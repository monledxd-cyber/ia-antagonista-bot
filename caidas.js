const { Vec3 } = require('vec3');
const diag = require('./diag');

// Nunca caerse por tonto (guardia de bordes) y caer a proposito cuando sirve para ganar distancia.
function crearCaidas(bot, o) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAL = /lava|magma|fire|cactus|campfire|sweet_berry|powder_snow/;
  let ultGuardia = 0, ultDrop = 0, bajando = false;
  const bl = (p) => bot.blockAt(p);
  const hay = (n) => bot.inventory.items().some((i) => i.name === n);

  // Mira la columna bajo (x,z) desde y: devuelve { k, nombre } del primer bloque solido o liquido, k = caida en bloques
  function columna(x, y, z, max = 40) {
    for (let k = 0; k <= max; k++) {
      const b = bl(new Vec3(x, y - k, z));
      if (!b) return { k, nombre: 'unknown' };
      if (b.boundingBox === 'block' || /water|lava|bubble_column/.test(b.name) || MAL.test(b.name)) return { k, nombre: b.name };
    }
    return { k: max + 1, nombre: 'vacio' };
  }
  const caidaMala = (c, tolerada) => MAL.test(c.nombre) || c.nombre === 'vacio' || (c.k > tolerada && !/water|bubble_column/.test(c.nombre));

  function rumbo() {
    const c = bot.controlState || {};
    let f = (c.forward ? 1 : 0) - (c.back ? 1 : 0), l = (c.left ? 1 : 0) - (c.right ? 1 : 0);
    if (!f && !l) return null;
    const y = bot.entity.yaw;
    return { x: -Math.sin(y) * f - Math.cos(y) * l, z: -Math.cos(y) * f + Math.sin(y) * l, esp: c.sprint ? 1.5 : 1 };
  }

  // Guardia: si el movimiento manual lleva a un vacio peligroso, lo corta
  const guardia = setInterval(() => {
    if (!bot.entity || !bot.entity.onGround || bajando || (bot._caidaOK || 0) > Date.now() || bot.entity.isInWater) return;
    const r = rumbo();
    if (!r) return;
    const n = Math.hypot(r.x, r.z) || 1, p = bot.entity.position;
    const tx = Math.floor(p.x + (r.x / n) * 0.9 * r.esp), tz = Math.floor(p.z + (r.z / n) * 0.9 * r.esp), ty = Math.floor(p.y) - 1;
    const c = columna(tx, ty, tz, 8);
    if (!caidaMala(c, 4)) return;
    if (c.k <= 1 && !MAL.test(c.nombre)) return;
    ['forward', 'back', 'left', 'right', 'sprint'].forEach((k) => bot.setControlState(k, false));
    if (Date.now() - ultGuardia > 1500) diag.log('info', 'caidas', 'frena en borde (' + c.nombre + ' a ' + c.k + ')');
    ultGuardia = Date.now();
  }, 70);

  // Caida estrategica: borde cercano con caida tolerable (agua/cubo o dano asumible), lejos del rival
  function buscar(t) {
    const p = bot.entity.position.floored(), hp = bot.health;
    const balde = hay('water_bucket');
    let mejor = null, mp = -1e9;
    for (let a = 0; a < 360; a += 30) {
      const dx = Math.cos((a * Math.PI) / 180), dz = Math.sin((a * Math.PI) / 180);
      const away = t ? -(dx * (t.position.x - p.x) + dz * (t.position.z - p.z)) / (Math.hypot(t.position.x - p.x, t.position.z - p.z) || 1) : 0;
      if (away < -0.2) continue;
      for (let r = 1; r <= 5; r++) {
        const ex = Math.round(p.x + dx * r), ez = Math.round(p.z + dz * r);
        const a1 = bl(new Vec3(ex, p.y, ez)), a2 = bl(new Vec3(ex, p.y + 1, ez));
        if (!a1 || !a2) break;
        if (a1.boundingBox !== 'empty' || a2.boundingBox !== 'empty') break;
        const c = columna(ex, p.y - 1, ez, 45);
        if (c.k <= 1) continue; // todavia hay suelo
        if (MAL.test(c.nombre) || c.nombre === 'vacio') break;
        const agua = /water|bubble/.test(c.nombre), dano = agua ? 0 : Math.max(0, c.k - 3);
        if (!(c.k >= 4)) break;
        const ok = agua || (balde && c.k <= 60) || (hp - dano >= 8);
        if (!ok) break;
        const pun = c.k * 0.5 + away * 6 - dano * 0.7 + (agua ? 6 : 0) + (balde ? 4 : 0) - r * 0.4;
        if (pun > mp) { mp = pun; mejor = { ex, ez, dx, dz, k: c.k, dano, agua, r }; }
        break;
      }
    }
    return mejor;
  }

  async function saltar(c) {
    bajando = true; ultDrop = Date.now(); bot._caidaOK = Date.now() + 5000;
    diag.log('info', 'caidas', `salta a proposito: ${c.k} bloques (dano ~${c.dano}${c.agua ? ', agua' : ''})`);
    try {
      if (bot.pvp) bot.pvp.stop();
      bot.pathfinder.setGoal(null);
      const b = bot.inventory.items().find((i) => i.name === 'water_bucket');
      if (b && !c.agua) await bot.equip(b, 'hand').catch(() => {});
      await bot.look(Math.atan2(-c.dx, -c.dz), 0, true);
      bot.setControlState('sprint', true); bot.setControlState('forward', true);
      const y0 = bot.entity.position.y, t0 = Date.now();
      while (Date.now() - t0 < 1500 && bot.entity.position.y > y0 - 1.2) await dormir(60);
      bot.setControlState('forward', false); bot.setControlState('sprint', false);
    } catch (e) { /* ignorar */ }
    finally { bajando = false; bot._caidaOK = Date.now() + 4000; }
  }

  const estrat = setInterval(() => {
    if (!bot.entity || bajando || o.ocupado() || bot.health === undefined || Date.now() - ultDrop < 25_000) return;
    const t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) return;
    const d = t.position.distanceTo(bot.entity.position);
    if (d > 9 || !bot.entity.onGround) return;
    const apuro = bot.health <= 9 || (bot._retirada || 0) > Date.now() || (bot.health < 13 && d < 4) || (o.odio(t.username) > 6 && bot.health < 16 && Math.random() < 0.1);
    if (!apuro) return;
    const c = buscar(t);
    if (c) saltar(c);
  }, 400);

  bot.once('end', () => { clearInterval(guardia); clearInterval(estrat); });
}

module.exports = { crearCaidas };
