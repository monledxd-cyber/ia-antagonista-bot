const { Vec3 } = require('vec3');
const diag = require('./diag');
const F = require('./fisica');
const { ignorado } = require('./modo');

const G = 0.08, DRAG_Y = 0.98, DRAG_H = 0.91, SPRINT = 0.28;
const PROY = { arrow: [0.05, 0.99], spectral_arrow: [0.05, 0.99], trident: [0.05, 0.99], potion: [0.05, 0.99], fireball: [0, 1], small_fireball: [0, 1], wind_charge: [0, 1], breeze_wind_charge: [0, 1], dragon_fireball: [0, 1] };
const EXPL = { end_crystal: 9, tnt: 8 };
const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);

function crearPrediccion(bot) {
  const hist = new Map();
  let esq = 0, esqP = 0, esqE = 0, margen = 5, ult = null, sum = { proy: null, pase: 99, expl: null };
  const jugadores = () => Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username && e.position && !ignorado(bot, e));
  const bloque = (x, y, z) => bot.blockAt(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)));
  const solido = (x, y, z) => { const b = bloque(x, y, z); return !!b && b.boundingBox === 'block'; };
  const suelo = (x, y, z) => { const y0 = Math.floor(y); for (let i = 0; i < 64; i++) if (solido(x, y0 - i, z)) return y0 - i + 1; return -Infinity; };
  const enAire = (e) => !solido(e.position.x, e.position.y - 0.05, e.position.z);
  const mano = (e) => (e.heldItem && e.heldItem.name) || ((Array.isArray(e.equipment) && e.equipment[0] && e.equipment[0].name) || '');

  const reg = () => {
    const ahora = Date.now();
    for (const e of jugadores()) {
      let h = hist.get(e.id); if (!h) hist.set(e.id, (h = []));
      h.push({ t: ahora, x: e.position.x, y: e.position.y, z: e.position.z });
      if (h.length > 8) h.shift();
    }
    if (bot.entity) for (const e of Object.values(bot.entities)) {
      if (!e.position || !(PROY[e.name] || EXPL[e.name]) || e.position.distanceTo(bot.entity.position) > 40) continue;
      let h = hist.get(e.id); if (!h) hist.set(e.id, (h = []));
      h.push({ t: ahora, x: e.position.x, y: e.position.y, z: e.position.z });
      if (h.length > 6) h.shift();
    }
    if (hist.size > 60) for (const id of hist.keys()) if (!bot.entities[id]) hist.delete(id);
  };

  function vel(e) {
    const h = hist.get(e.id);
    if (!h || h.length < 3) return { x: 0, y: 0, z: 0 };
    const a = h[Math.max(0, h.length - 4)], b = h[h.length - 1], n = Math.max(1, (b.t - a.t) / 50);
    return { x: (b.x - a.x) / n, y: (b.y - a.y) / n, z: (b.z - a.z) / n };
  }

  function velP(e) {
    const h = hist.get(e.id);
    if (h && h.length >= 2) { const a = h[Math.max(0, h.length - 3)], b = h[h.length - 1], n = Math.max(1, (b.t - a.t) / 50); return { x: (b.x - a.x) / n, y: (b.y - a.y) / n, z: (b.z - a.z) / n }; }
    const v = e.velocity;
    return v ? { x: v.x, y: v.y, z: v.z } : null;
  }

  function impacto(e) {
    const k = PROY[e.name], v = velP(e);
    if (!k || !v || Math.hypot(v.x, v.y, v.z) < 0.15) return null;
    const me = bot.entity.position;
    if (e.position.distanceTo(me) < 2.5 && (v.x * (e.position.x - me.x) + v.z * (e.position.z - me.z)) > 0) return null;
    let x = e.position.x, y = e.position.y, z = e.position.z, vx = v.x, vy = v.y, vz = v.z, mejor = { d: 99 };
    for (let n = 1; n <= 30; n++) {
      for (let q = 0; q < 3; q++) {
        x += vx / 3; y += vy / 3; z += vz / 3;
        if (solido(x, y, z)) return { ...mejor, golpe: false, v };
        const dh = Math.hypot(x - me.x, z - me.z), dy = y - (me.y + 0.9);
        if (dh < mejor.d) mejor = { d: dh, n, x, y, z };
        if (dh < 0.65 && Math.abs(dy) < 1.15) return { n, x, y, z, d: dh, golpe: true, v };
      }
      vx *= k[1]; vy = vy * k[1] - k[0]; vz *= k[1];
    }
    return { ...mejor, golpe: false, v };
  }

  function escanear() {
    const me = bot.entity.position;
    let mejorP = null, pase = 99, expl = null;
    for (const e of Object.values(bot.entities)) {
      if (!e.position || e === bot.entity) continue;
      const d = e.position.distanceTo(me);
      if (d > 40) continue;
      if (PROY[e.name]) {
        const im = impacto(e);
        if (!im) continue;
        if (im.golpe && (!mejorP || im.n < mejorP.im.n)) mejorP = { e, im };
        if (im.d < pase) pase = im.d;
      } else if (EXPL[e.name] && d < EXPL[e.name] + 3 && (!expl || d < expl.d)) expl = { e, d };
    }
    sum = { proy: mejorP ? mejorP.im.n : null, pase, expl: expl ? expl.d : null };
    return { mejorP, expl };
  }

  function revisarProy(mejorP) {
    const ahora = Date.now();
    if (!mejorP || ahora - esqP < 400) return false;
    const { e, im } = mejorP, me = bot.entity.position;
    if (im.n < 2) return false;
    const of = bot.inventory && bot.inventory.slots && bot.inventory.slots[45];
    if (of && of.name === 'shield' && /arrow|trident/.test(e.name)) return false;
    const vh = Math.hypot(im.v.x, im.v.z);
    if (vh < 0.05) return false;
    const u = [im.v.x / vh, im.v.z / vh], w = [me.x - e.position.x, me.z - e.position.z], cr = w[0] * u[1] - w[1] * u[0];
    const lado = cr >= 0 ? 1 : -1, perp = [u[1] * lado, -u[0] * lado];
    const need = Math.max(0, 1.0 - Math.abs(cr)) + 0.2;
    let d = null, mc = -1;
    for (const sg of [1, -1]) { const c = [perp[0] * sg, perp[1] * sg], l = libre(me.x, Math.floor(me.y), me.z, c) + (sg === 1 ? 0.5 : 0); if (l >= 2 && l > mc) { mc = l; d = c; } }
    if (!d) return false;
    const fis = F.ticksPara(F.estadoDe(bot), d, need);
    if (im.n > fis.n + 4) return false;
    esqP = ahora;
    ejecutar(d, Math.min(600, Math.max(200, (fis.n + 1) * 50)), fis.saltar);
    if (ahora - (revisarProy.log || 0) > 1000) { revisarProy.log = ahora; console.log(`[pred] ${e.name} llega en ${im.n} ticks; esquiva ${need.toFixed(1)} bloques`); }
    return true;
  }

  function revisarExpl(expl) {
    const ahora = Date.now();
    if (!expl || ahora - esqE < 700) return false;
    const { e, d } = expl, R = EXPL[e.name];
    if (d > R) return false;
    if (e.name === 'end_crystal' && !jugadores().some((j) => j.position.distanceTo(bot.entity.position) < 16) && !(bot.pvp && bot.pvp.target)) return false;
    const me = bot.entity.position, dir = elegir({ x: e.position.x, z: e.position.z }, e, { x: 0, z: 0 });
    if (!dir) return false;
    const fis = F.ticksPara(F.estadoDe(bot), dir, R + 1 - d);
    esqE = ahora;
    ejecutar(dir, Math.min(1200, Math.max(300, (fis.n + 2) * 50)), fis.saltar);
    if (ahora - (revisarExpl.log || 0) > 1000) { revisarExpl.log = ahora; console.log(`[pred] ${e.name} a ${d.toFixed(1)} bloques; se aleja`); }
    return true;
  }

  function futura(e, ticks) {
    const v = vel(e); let { x, y, z } = e.position, vy = v.y, vx = v.x, vz = v.z;
    const aire = enAire(e);
    for (let n = 0; n < ticks; n++) {
      if (aire) { vy = (vy - G) * DRAG_Y; y += vy; if (vy < 0) { const s = suelo(x, y + 1, z); if (y <= s) { y = s; vy = 0; } } }
      x += vx; z += vz; const dr = aire ? DRAG_H : 0.98; vx *= dr; vz *= dr;
    }
    return { x, y, z };
  }

  function aterrizaje(e, max = 40) {
    const hh = hist.get(e.id);
    if (!hh || hh.length < 3 || !enAire(e)) return null;
    const v = vel(e); let { x, y, z } = e.position, vy = v.y, vx = v.x, vz = v.z;
    for (let n = 1; n <= max; n++) {
      vy = (vy - G) * DRAG_Y; x += vx; z += vz; y += vy; vx *= DRAG_H; vz *= DRAG_H;
      if (vy < 0) { const s = suelo(x, y + 1, z); if (y <= s) return { x, y: s, z, n, alto: e.position.y - s }; }
    }
    return null;
  }

  function libre(px, py, pz, d) {
    for (let k = 1; k <= 5; k++) {
      const x = px + d[0] * k, z = pz + d[1] * k;
      if (solido(x, py, z) || solido(x, py + 1, z)) return k - 1;
      const f = bloque(x, py - 1, z);
      if (f && /lava|fire|magma/.test(f.name)) return k - 1;
      if (!solido(x, py - 1, z) && !solido(x, py - 2, z)) return k - 1;
    }
    return 5;
  }

  function elegir(L, e, v) {
    const me = bot.entity.position, ax = me.x - L.x, az = me.z - L.z, r = Math.hypot(ax, az), vh = Math.hypot(v.x, v.z);
    const u = vh > 0.02 ? [v.x / vh, v.z / vh] : null;
    const des = r > 0.8 ? [ax / r, az / r] : u ? [-u[1], u[0]] : DIRS[Math.floor(Math.random() * 8)];
    let mejor = null, ms = -1e9;
    for (const d of DIRS) {
      const c = libre(me.x, Math.floor(me.y), me.z, d);
      if (c < 3) continue;
      const s = d[0] * des[0] + d[1] * des[1] - (u ? 0.4 * Math.max(0, d[0] * u[0] + d[1] * u[1]) : 0) + 0.1 * c;
      if (s > ms) { ms = s; mejor = d; }
    }
    return mejor;
  }

  function ejecutar(d, ms, saltar) {
    const yaw = Math.atan2(-d[0], -d[1]);
    const t = bot.pvp && bot.pvp.target;
    try { if (bot.pvp && bot.pvp.target) bot.pvp.stop(); if (bot.pathfinder) bot.pathfinder.setGoal(null); } catch (err) { /* ignorar */ }
    bot.look(yaw, 0, true).catch(() => {});
    const ks = saltar ? ['forward', 'sprint', 'jump'] : ['forward', 'sprint'];
    for (const k of ks) bot.setControlState(k, true);
    setTimeout(() => { for (const k of ['forward', 'sprint', 'jump']) bot.setControlState(k, false); }, ms);
    if (t && t.type === 'player') setTimeout(() => { try { if (bot.entities[t.id] && bot.pvp && !bot.pvp.target) bot.pvp.attack(t); } catch (err) { /* ignorar */ } }, ms + 150);
  }

  function huir(pos, dd) {
    const me = bot.entity.position, d0 = Math.hypot(me.x - pos.x, me.z - pos.z);
    const dir = elegir({ x: pos.x, z: pos.z }, null, { x: 0, z: 0 });
    if (!dir) return false;
    const fis = F.ticksPara(F.estadoDe(bot), dir, Math.max(0.5, dd - d0));
    ejecutar(dir, Math.min(1200, Math.max(300, (fis.n + 2) * 50)), fis.saltar);
    return true;
  }

  function escudo(ms, dur) {
    const of = bot.inventory && bot.inventory.slots && bot.inventory.slots[45];
    if (!of || of.name !== 'shield') return;
    setTimeout(() => { try { bot.activateItem(true); setTimeout(() => { try { bot.deactivateItem(); } catch (err) { /* ignorar */ } }, dur); } catch (err) { /* ignorar */ } }, Math.max(0, ms));
  }

  function revisar() {
    if (!bot.entity || bot.health === undefined) return;
    const me = bot.entity.position, ahora = Date.now();
    if (ult && ahora > ult.eval) {
      const dano = ult.hp - bot.health;
      if (dano >= 4) { margen = Math.min(7.5, margen + 0.5); diag.log('warn', 'prediccion', `esquiva fallida (-${dano.toFixed(1)}); margen ${margen.toFixed(1)}`); }
      else margen = Math.max(4.5, margen - 0.1);
      diag.estado.pred = `margen ${margen.toFixed(1)} ult ${dano >= 4 ? 'golpe' : 'ok'}`;
      ult = null;
    }
    const { mejorP, expl } = escanear();
    if (revisarExpl(expl) || revisarProy(mejorP)) return;
    if (ahora - esq < 800) return;
    for (const e of jugadores()) {
      const dy = e.position.y - me.y;
      if (dy < 1.5 || dy > 40 || Math.hypot(e.position.x - me.x, e.position.z - me.z) > 14) continue;
      const v = vel(e);
      if (!(/^mace$/.test(mano(e)) || (v.y < -0.45 && dy > 2))) continue;
      const L = aterrizaje(e);
      if (!L || L.alto < 1.5 || Math.abs(L.y - me.y) > 2.2) continue;
      const h = Math.hypot(L.x - me.x, L.z - me.z);
      if (h > 4.6) continue;
      const need = Math.max(0, margen - h), d = elegir(L, e, v);
      const fis = d ? F.ticksPara(F.estadoDe(bot), d, need) : { n: need / SPRINT, saltar: false }, tNeed = fis.n + 3;
      if (L.n > tNeed + 5) continue;
      esq = ahora;
      ult = { hp: bot.health, eval: ahora + L.n * 50 + 500 };
      if (d) ejecutar(d, Math.min(900, Math.max(300, (fis.n + 2) * 50)), fis.saltar);
      escudo((L.n - 2) * 50, 600);
      if (ahora - (revisar.log || 0) > 1000) { revisar.log = ahora; console.log(`[pred] ${e.username} cae en ${L.n} ticks a ${h.toFixed(1)} bloques (alto ${L.alto.toFixed(1)}); ${d ? 'esquiva' : 'sin salida libre'}`); }
      return;
    }
  }

  let c = 0;
  const onTick = () => { reg(); if (++c % 2 === 0) { try { revisar(); } catch (err) { diag.log('warn', 'prediccion', String(err && err.message).slice(0, 80)); } } };
  bot.on('physicsTick', onTick);
  bot.once('end', () => bot.removeListener('physicsTick', onTick));
  const api = { vel, futura, aterrizaje, impacto, huir, resumen: () => sum, margen: () => margen };
  bot._pred = api;
  return api;
}
module.exports = { crearPrediccion };
