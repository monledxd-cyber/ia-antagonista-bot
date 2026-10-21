const diag = require('./diag');

const TIPOS = [
  ['flecha', /(arrow|bow|crossbow)[._]shoot|trident[._]throw/, 0.7],
  ['explosion', /generic[._]explode|tnt[._]primed|creeper[._]primed|firework[._]blast/, 0.8],
  ['perla', /ender_pearl[._]throw|enderpearl[._]throw/, 0.5],
  ['escudo', /shield[._]block/, 0.6],
  ['golpe', /player[._](attack|hurt)|mace[._]smash/, 0.6],
  ['bloque', /block[._].*[._](break|place)/, 0.35],
  ['paso', /[._]step$|elytra[._]flying|player[._]swim/, 0.3],
  ['comida', /player[._]burp|generic[._]eat|generic[._]drink/, 0.25],
];
const SORDO = /^(ambient|music|weather|record)/;

function crearPercepcion(bot) {
  const oidos = [], hist = new Map();
  let dano = null, ultLog = 0, ultOculto = 0;
  const visCache = new Map();

  function ojo() { const p = bot.entity.position; return { x: p.x, y: p.y + 1.62, z: p.z }; }

  function visible(pos, maxD) {
    if (!bot.entity) return false;
    const o = ojo(), dx = pos.x - o.x, dy = pos.y - o.y, dz = pos.z - o.z, d = Math.hypot(dx, dy, dz);
    if (d < 1.5) return true;
    if (d > (maxD || 64)) return false;
    const n = Math.min(160, Math.ceil(d * 2)), V = require('vec3');
    for (let i = 1; i < n; i++) {
      const k = i / n;
      let b; try { b = bot.blockAt(new V(o.x + dx * k, o.y + dy * k, o.z + dz * k)); } catch (e) { return true; }
      if (b && b.boundingBox === 'block' && !/glass|leaves|bars|fence|gate|slab|stairs|iron_door|trapdoor|cobweb/.test(b.name)) return false;
    }
    return true;
  }

  function visibleE(e) {
    const c = visCache.get(e.id), t = Date.now();
    if (c && t - c.t < 300) return c.v;
    const v = visible({ x: e.position.x, y: e.position.y + (e.height || 1.8) * 0.8, z: e.position.z });
    visCache.set(e.id, { t, v });
    if (visCache.size > 80) visCache.clear();
    return v;
  }

  function oir(nombre, pos, vol) {
    if (!bot.entity || !pos) return;
    const n = String(nombre || '').toLowerCase().replace(/^minecraft:/, '');
    if (SORDO.test(n)) return;
    const tp = TIPOS.find((x) => x[1].test(n));
    if (!tp) return;
    const d = Math.hypot(pos.x - bot.entity.position.x, pos.z - bot.entity.position.z);
    if (d < 1.5 || d > 70) return;
    oidos.push({ t: Date.now(), tipo: tp[0], base: tp[2], x: pos.x, y: pos.y, z: pos.z, d, n });
    while (oidos.length > 60) oidos.shift();
  }

  bot.on('soundEffectHeard', (n, p, v) => { try { oir(n, p, v); } catch (e) { /* ignorar */ } });
  bot.on('hardcodedSoundEffectHeard', (id, cat, p, v) => { try { const n = bot.registry && bot.registry.sounds && bot.registry.sounds[id] && bot.registry.sounds[id].name; if (n) oir(n, p, v); } catch (e) { /* ignorar */ } });

  function alDano(p) {
    if (!bot.entity || p.entityId !== bot.entity.id) return;
    const cid = p.sourceCauseId > 0 ? p.sourceCauseId - 1 : null, did = p.sourceDirectId > 0 ? p.sourceDirectId - 1 : null;
    const ce = cid !== null ? bot.entities[cid] : null, de = did !== null ? bot.entities[did] : null;
    const pos = p.sourcePosition || (ce && ce.position) || (de && de.position) || null;
    const proy = !!(de && cid !== did && de.name && /arrow|trident|fireball|snowball|pearl|potion|charge/.test(de.name));
    let vis = true;
    if (ce) vis = visibleE(ce);
    else if (pos) vis = visible(pos);
    else vis = false;
    const d = pos ? Math.hypot(pos.x - bot.entity.position.x, pos.z - bot.entity.position.z) : null;
    dano = { t: Date.now(), causa: ce || null, causaId: cid, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, proy, vis, d, tipo: p.sourceTypeId };
    if (!vis || proy) {
      if (Date.now() - ultLog > 3000) { ultLog = Date.now(); console.log(`[percepcion] dano ${vis ? '' : 'sin ver '}${proy ? 'proyectil ' : ''}de ${ce ? (ce.username || ce.name) : '?'}${d !== null ? ' a ' + d.toFixed(0) + 'm' : ''}`); }
      reaccionar(dano);
    }
  }
  try { bot._client.on('damage_event', alDano); } catch (e) { /* sin cliente */ }

  function reaccionar(x) {
    try {
      if (!x.pos || !bot.entity) return;
      if (x.d !== null && x.d > 6 && bot._pred && bot._pred.huir && !bot.pvp.target) bot._pred.huir(x.pos, 7);
      const V = require('vec3');
      if (!bot.pvp.target || !bot.entities[bot.pvp.target.id]) bot.lookAt(new V(x.pos.x, bot.entity.position.y + 1.6, x.pos.z), true).catch(() => {});
    } catch (e) { /* ignorar */ }
  }

  function ocultos() {
    const t = Date.now(), r = [];
    if (!bot.entity) return r;
    for (const e of Object.values(bot.entities)) {
      if (e === bot.entity || e.type !== 'player' || !e.position) continue;
      const d = e.position.distanceTo(bot.entity.position);
      if (d > 64) continue;
      let h = hist.get(e.id); if (!h) { h = []; hist.set(e.id, h); }
      const u = h[h.length - 1];
      if (!u || t - u.t > 400) { h.push({ t, d }); while (h.length > 12) h.shift(); }
      const v = visibleE(e);
      let acerca = 0;
      if (h.length >= 3) { const a = h[0], b = h[h.length - 1]; if (b.t > a.t) acerca = (a.d - b.d) / ((b.t - a.t) / 1000); }
      r.push({ e, d, vis: v, acerca });
    }
    if (hist.size > 60) { for (const k of [...hist.keys()]) if (!bot.entities[k]) hist.delete(k); }
    return r;
  }

  function amenaza() {
    const t = Date.now();
    if (!bot.entity) return { nivel: 0 };
    let best = { nivel: 0, fuente: null, pos: null };
    const sube = (nivel, fuente, pos) => { if (nivel > best.nivel) best = { nivel, fuente, pos }; };
    if (dano && t - dano.t < 5000 && (!dano.vis || dano.proy)) sube(1 - (t - dano.t) / 8000, dano.proy ? 'proyectil' : 'daño oculto', dano.pos);
    for (const o of oidos) {
      const edad = (t - o.t) / 1000;
      if (edad > 6) continue;
      const cerca = Math.max(0, 1 - o.d / 40);
      if (o.tipo === 'comida' && o.d > 20) continue;
      sube(o.base * cerca * Math.max(0, 1 - edad / 6), o.tipo, o);
    }
    for (const x of ocultos()) {
      if (x.vis && x.d > 3) continue;
      if (!x.vis && x.d < 40) sube(0.25 + 0.5 * Math.max(0, Math.min(1, x.acerca / 5)) * Math.max(0, 1 - x.d / 40), 'rival oculto', x.e.position);
    }
    return best;
  }

  const nivel = () => amenaza().nivel;

  function vector(t) {
    try {
      const a = amenaza(), v = t && t.position ? (visibleE(t) ? 1 : 0) : 1;
      let acerca = 0;
      if (t) { const h = hist.get(t.id); if (h && h.length >= 3) { const x = h[0], y = h[h.length - 1]; if (y.t > x.t) acerca = (x.d - y.d) / ((y.t - x.t) / 1000); } }
      const dm = dano && Date.now() - dano.t < 4000 ? 1 - (Date.now() - dano.t) / 4000 : 0;
      return [Math.max(0, Math.min(1, a.nivel)), v, Math.max(-1, Math.min(1, acerca / 6)), dm * (dano && (!dano.vis || dano.proy) ? 1 : 0.4)];
    } catch (e) { return [0, 1, 0, 0]; }
  }

  const resumen = () => { const a = amenaza(); return { nivel: a.nivel, fuente: a.fuente, oidos: oidos.filter((o) => Date.now() - o.t < 6000).length, dano: dano && Date.now() - dano.t < 5000 ? { oculto: !dano.vis, proy: dano.proy, d: dano.d } : null }; };

  const iv = setInterval(() => {
    try {
      const a = amenaza();
      diag.estado.percepcion = a.nivel > 0.05 ? `${a.fuente} ${a.nivel.toFixed(2)}` : 'tranquilo';
      if (a.nivel >= 0.6 && a.pos && Date.now() - ultOculto > 4000 && !bot.pvp.target && !(dano && Date.now() - dano.t < 600)) {
        ultOculto = Date.now();
        const V = require('vec3');
        bot.lookAt(new V(a.pos.x, bot.entity.position.y + 1.6, a.pos.z), false).catch(() => {});
      }
    } catch (e) { /* ignorar */ }
  }, 700);
  if (iv.unref) iv.unref();
  bot.once('end', () => clearInterval(iv));

  const api = {
    visible, visibleE, ocultos, amenaza, nivel, vector, resumen, oidos: () => oidos.slice(),
    ultimoDano: () => dano,
    atacante: (ms) => (dano && dano.causa && Date.now() - dano.t < (ms || 6000) && bot.entities[dano.causaId] && dano.causa.type === 'player' ? bot.entities[dano.causaId] : null),
  };
  bot._perc = api;
  return api;
}
module.exports = { crearPercepcion };
