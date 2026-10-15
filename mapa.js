const fs = require('fs');
const { Movements } = require('mineflayer-pathfinder');
const diag = require('./diag');

const FAM = { coal: /^(deepslate_)?coal_ore$/, iron: /^(deepslate_)?iron_ore$/, copper: /^(deepslate_)?copper_ore$/, gold: /^(deepslate_|nether_)?gold_ore$/, redstone: /^(deepslate_)?redstone_ore$/, lapis: /^(deepslate_)?lapis_ore$/, diamond: /^(deepslate_)?diamond_ore$/, emerald: /^(deepslate_)?emerald_ore$/ };
let actual = null;

function crearMapa(bot, ruta) {
  let d = { menas: {}, pel: {} }, sucio = false;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); for (const k of Object.keys(d.pel)) { d.pel[k] *= 0.85; if (d.pel[k] < 0.3) delete d.pel[k]; } } catch (e) { /* nuevo */ }
  const fallos = new Map();
  const dim = () => String((bot.game && bot.game.dimension) || 'overworld').replace(/.*:/, '');
  let dimC = 'overworld', nPel = Object.keys(d.pel).length;
  const refrescar = () => { dimC = dim(); nPel = Object.keys(d.pel).length; };
  refrescar();
  const rf = setInterval(refrescar, 1000);
  const celda = (x, y, z) => dimC + ':' + (Math.floor(x) >> 2) + ',' + (Math.floor(y) >> 2) + ',' + (Math.floor(z) >> 2);
  const ids = {};
  const idsDe = (t) => (ids[t] = ids[t] || Object.values(bot.registry.blocksByName).filter((b) => FAM[t].test(b.name)).map((b) => b.id));

  function marcarPeligro(p, v, motivo) {
    const k = celda(p.x, p.y, p.z);
    d.pel[k] = Math.min(6, (d.pel[k] || 0) + v); nPel = Math.max(nPel, 1); sucio = true;
    if (motivo) diag.log('info', 'mapa', 'peligro ' + motivo + ' en ' + Math.floor(p.x) + ',' + Math.floor(p.y) + ',' + Math.floor(p.z));
  }
  const peligro = (p) => (nPel ? d.pel[celda(p.x, p.y, p.z)] || 0 : 0);
  const marcarFallo = (p) => { fallos.set(Math.floor(p.x) + ',' + Math.floor(p.y) + ',' + Math.floor(p.z), Date.now()); };

  function anotar(t, p) {
    const l = (d.menas[t] = d.menas[t] || []), key = dim() + ':' + p.x + ',' + p.y + ',' + p.z;
    if (l.some((m) => m.k === key)) return;
    l.push({ k: key, x: p.x, y: p.y, z: p.z, d: dim() });
    if (l.length > 300) l.shift();
    sucio = true;
  }
  function menaCercana(t) {
    const l = d.menas[t]; if (!l || !bot.entity) return null;
    const yo = bot.entity.position, ahora = Date.now();
    let mejor = null, md = 1e9;
    for (let i = l.length - 1; i >= 0; i--) {
      const m = l[i];
      if (m.d !== dim()) continue;
      const b = bot.blockAt({ x: m.x, y: m.y, z: m.z });
      if (b && !FAM[t].test(b.name)) { l.splice(i, 1); sucio = true; continue; }
      const f = fallos.get(m.x + ',' + m.y + ',' + m.z);
      if (f && ahora - f < 600_000) continue;
      if (peligro(m) >= 2) continue;
      const dd = Math.hypot(m.x - yo.x, m.z - yo.z) + 1.5 * Math.abs(m.y - yo.y);
      if (dd < md) { md = dd; mejor = m; }
    }
    return mejor ? { x: mejor.x, y: mejor.y, z: mejor.z } : null;
  }

  actual = { peligro };
  if (!Movements.prototype._mapaParche) {
    const orig = Movements.prototype.exclusionStep;
    Movements.prototype.exclusionStep = function (b) { const p = actual && b && b.position ? actual.peligro(b.position) : 0; return orig.call(this, b) + (p >= 1 ? Math.min(12, p * 3) : 0); };
    Movements.prototype._mapaParche = true;
  }

  let rot = 0;
  const esc = setInterval(() => {
    if (!bot.entity || (bot.pvp && bot.pvp.target)) return;
    const ks = Object.keys(FAM);
    try { for (let i = 0; i < 2; i++) { const t = ks[rot++ % ks.length]; for (const p of bot.findBlocks({ matching: idsDe(t), maxDistance: 24, count: 12 })) anotar(t, p); } } catch (e) { /* ignorar */ }
  }, 6_000);

  let ultLava = 0, vyPrev = 0, hpPrev = null, ultPos = null;
  const med = setInterval(() => {
    if (!bot.entity) return;
    const p = bot.entity.position;
    if (bot.entity.isInLava && Date.now() - ultLava > 2000) { ultLava = Date.now(); marcarPeligro(p, 2, 'lava'); }
    if (bot.entity.onGround) ultPos = p.clone();
    vyPrev = bot.entity.velocity ? bot.entity.velocity.y : 0;
  }, 100);
  bot.on('health', () => {
    const h = bot.health;
    if (hpPrev !== null && h < hpPrev - 2.5 && vyPrev < -0.7 && ultPos) marcarPeligro(ultPos, 1.2, 'caida');
    hpPrev = h;
  });
  bot.on('path_update', (r) => {
    if (r && (r.status === 'noPath' || r.status === 'timeout')) {
      const g = bot.pathfinder && bot.pathfinder.goal;
      if (g && g.x !== undefined) marcarFallo({ x: g.x, y: g.y !== undefined ? g.y : bot.entity.position.y, z: g.z });
    }
  });
  const resumen = () => `menas ${Object.entries(d.menas).map(([k, l]) => k + l.length).join(' ')} zonas_peligro ${Object.keys(d.pel).length}`;
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(() => { guardar(); diag.estado.mapa = resumen(); }, 60_000);
  bot.once('end', () => { clearInterval(rf); clearInterval(esc); clearInterval(med); clearInterval(gt); guardar(); });

  const api = { menaCercana, marcarPeligro, marcarFallo, peligro, guardar, resumen };
  bot._mapa = api;
  return api;
}
module.exports = { crearMapa };
