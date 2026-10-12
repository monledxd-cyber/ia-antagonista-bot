const { goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const diag = require('./diag');

function crearBase(bot, o) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let base = null, encerrado = false, emb = null, ultRegreso = 0, ultEnc = 0;
  const jugadores = () => Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username && e.gameMode !== 'spectator' && e.gameMode !== 'creative' && e.position);
  const rival = () => bot.pvp && bot.pvp.target;
  const dist = (e) => e.position.distanceTo(bot.entity.position);

  bot.once('spawn', () => { if (!base && bot.entity) base = bot.entity.position.floored(); });
  bot._base = () => base;
  bot._fijarBase = (p) => { base = p.floored ? p.floored() : p; };

  const bloque = () => bot.inventory.items().find((i) => /^(cobblestone|cobbled_deepslate|dirt|netherrack|stone|oak_planks|spruce_planks|birch_planks|andesite|diorite|granite|deepslate)$/.test(i.name) && i.count >= 1);

  // Encierro: tapa los lados y el techo cuando va perdiendo y el rival aun no esta encima.
  async function encierro() {
    if (encerrado) return;
    const yo = bot.entity.position.floored();
    const lugares = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [0, 2, 0]];
    encerrado = true; ultEnc = Date.now();
    try { if (bot.pvp) bot.pvp.stop(); bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    diag.log('info', 'base', 'encierro');
    for (const d of lugares) {
      const b = bloque(); if (!b) break;
      const p = yo.offset(d[0], d[1], d[2]), actual = bot.blockAt(p);
      if (!actual || actual.name !== 'air') continue;
      const ref = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].map((r) => bot.blockAt(p.offset(r[0], r[1], r[2]))).find((x) => x && x.boundingBox === 'block' && !x.position.equals(yo) && !x.position.equals(yo.offset(0, 1, 0)));
      if (!ref) continue;
      try {
        await bot.equip(b, 'hand');
        await bot.placeBlock(ref, p.minus(ref.position));
      } catch (e) { /* siguiente */ }
    }
    // dentro: curarse hasta estar bien o hasta que rompan el muro
    const t0 = Date.now();
    while (bot.entity && Date.now() - t0 < 25_000 && bot.health < 17) await dormir(700);
    for (const d of lugares) {
      const b = bot.blockAt(yo.offset(d[0], d[1], d[2]));
      if (b && /^(cobblestone|cobbled_deepslate|dirt|netherrack|stone|.*_planks|andesite|diorite|granite|deepslate)$/.test(b.name) && !(d[0] === 0 && d[1] === 0 && d[2] === 0)) {
        try { await bot.dig(b); } catch (e) { /* ignorar */ }
        break;
      }
    }
    encerrado = false;
  }

  bot._encierro = () => { if (!encerrado && bloque()) encierro().catch(() => { encerrado = false; }); };

  const encInt = setInterval(() => {
    if (!bot.entity || encerrado || o.ocupado() || bot.health === undefined) return;
    if (Date.now() - ultEnc < 40_000) return;
    const t = rival();
    if (!t || bot.health > 7 || !bloque()) return;
    const d = dist(t);
    if (d < 2.2) return;
    if (/bow|crossbow|trident/.test((t.heldItem && t.heldItem.name) || '') && d > 6) return;
    encierro().catch(() => { encerrado = false; });
  }, 500);

  // Volver a base a recuperarse cuando esta herido y nadie lo ve
  const regInt = setInterval(() => {
    if (!base || !bot.entity || o.ocupado() || encerrado || rival() || Date.now() - ultRegreso < 60_000) return;
    if (bot.health > 12 || o.hayEnemigo(20)) return;
    if (bot.entity.position.distanceTo(base) < 6) return;
    ultRegreso = Date.now();
    diag.log('info', 'base', 'vuelve a base');
    try { bot.pathfinder.setGoal(new goals.GoalNear(base.x, base.y, base.z, 3)); } catch (e) { /* ignorar */ }
  }, 3_000);

  // Emboscada: agachado y quieto cuando un jugador odiado se acerca, golpea al estar a mano.
  const embInt = setInterval(() => {
    if (!bot.entity || encerrado || o.ocupado() || bot.health === undefined) return;
    if (emb) {
      const e = bot.entities[emb.id];
      const fin = !e || Date.now() > emb.hasta || rival() || bot.health < 8;
      if (fin) { bot.setControlState('sneak', false); emb = null; return; }
      const d = dist(e);
      if (d <= 3.8) {
        bot.setControlState('sneak', false);
        try { bot.pvp.attack(e); } catch (x) { /* ignorar */ }
        diag.log('info', 'base', 'emboscada golpea a ' + e.username);
        emb = null; return;
      }
      if (d > 34) { bot.setControlState('sneak', false); emb = null; }
      return;
    }
    if (rival() || bot.health < 15 || o.objetivo()) return;
    if (Math.random() > 0.25) return;
    const c = jugadores().filter((e) => { const d = dist(e); return d > 6 && d < 26 && o.odio(e.username) >= 2; }).sort((a, b) => dist(a) - dist(b))[0];
    if (!c) return;
    const mira = new Vec3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    const haciaMi = bot.entity.position.minus(c.position).normalize();
    const viene = mira.dot(haciaMi) > 0.2;
    if (!viene && Math.random() > 0.4) return;
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    bot.setControlState('sneak', true);
    bot.setControlState('sprint', false);
    emb = { id: c.id, hasta: Date.now() + 15_000 + Math.floor(Math.random() * 10_000) };
    diag.log('info', 'base', 'emboscada contra ' + c.username);
  }, 400);

  bot.once('end', () => { clearInterval(encInt); clearInterval(regInt); clearInterval(embInt); });
}

module.exports = { crearBase };
