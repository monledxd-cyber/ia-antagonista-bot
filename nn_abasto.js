const fs = require('fs');
const diag = require('./diag');

const NF = 40, NS = 64, NHA = 40, NOA = 6;
const TIER = { leather: 0.5, wooden: 1, chainmail: 1.5, stone: 2, golden: 2, turtle: 2, iron: 3, diamond: 4, netherite: 5 };
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

function crearNNAbasto(bot, ruta) {
  const modo = process.env.IA_NN_ABASTO || 'auto';
  if (modo === '0') return null;
  const rnd = (n, s) => Array.from({ length: n }, () => (Math.random() - 0.5) * 2 * s);
  let d = { pasos: {}, cnt: {}, buf: [], n: 0, W: null };
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  let W = d.W && d.W.w1 && d.W.ws && d.W.ws.length === NS * NHA && d.W.w2 && d.W.b2 ? d.W : null;
  if (W && (W.w1.length !== NF * NHA || W.w2.length !== NHA * NOA)) {
    const nf0 = Math.round(W.w1.length / NHA), no0 = W.b2.length, w1 = rnd(NF * NHA, 0.1), w2 = rnd(NHA * NOA, 0.1), b2 = [0, 0, 0, 0.4, -2, -2];
    for (let i = 0; i < Math.min(nf0, NF); i++) for (let j = 0; j < NHA; j++) w1[i * NHA + j] = W.w1[i * NHA + j];
    for (let j = 0; j < NHA; j++) for (let k = 0; k < Math.min(no0, NOA); k++) w2[j * NOA + k] = W.w2[j * no0 + k];
    for (let k = 0; k < Math.min(no0, NOA); k++) b2[k] = W.b2[k];
    W = { w1, ws: W.ws, b1: W.b1, w2, b2 };
  }
  if (!W) W = { w1: rnd(NF * NHA, 0.3), ws: rnd(NS * NHA, 0.3), b1: new Array(NHA).fill(0), w2: rnd(NHA * NOA, 0.2), b2: [0, 0, 0, 0.4, -2, -2] };
  d.W = W;
  d.buf = (d.buf || []).filter((b) => b && Array.isArray(b.x)).map((b) => { while (b.x.length < NF) b.x.push(0); return b; });
  let sucio = false, pend = [], cache = null, mults = {}, info = {}, actual = null;

  const sig = (v) => 1 / (1 + Math.exp(-v));
  function fwd(x, si) {
    const h = new Array(NHA);
    for (let j = 0; j < NHA; j++) {
      let s = W.b1[j] + W.ws[si * NHA + j];
      for (let i = 0; i < NF; i++) s += x[i] * W.w1[i * NHA + j];
      h[j] = Math.tanh(s);
    }
    const z = new Array(NOA);
    for (let k = 0; k < NOA; k++) { let s = W.b2[k]; for (let j = 0; j < NHA; j++) s += h[j] * W.w2[j * NOA + k]; z[k] = s; }
    return { h, o: [Math.tanh(z[0]), Math.tanh(z[1]), sig(z[2]), sig(z[3]), sig(z[4]), sig(z[5])] };
  }
  function entrenar(x, si, y, lr) {
    const { h, o } = fwd(x, si);
    const y5 = y[5] === undefined ? 0 : y[5];
    const e = [(o[0] - y[0]) * (1 - o[0] * o[0]), (o[1] - y[1]) * (1 - o[1] * o[1]), o[2] - y[2], o[3] - y[3], o[4] - y[4], o[5] - y5];
    const dh = new Array(NHA).fill(0);
    for (let k = 0; k < NOA; k++) {
      const g = cl(e[k], -1, 1);
      for (let j = 0; j < NHA; j++) { dh[j] += g * W.w2[j * NOA + k]; W.w2[j * NOA + k] -= lr * g * h[j]; }
      W.b2[k] -= lr * g;
    }
    for (let j = 0; j < NHA; j++) {
      const g = dh[j] * (1 - h[j] * h[j]);
      if (!g) continue;
      for (let i = 0; i < NF; i++) W.w1[i * NHA + j] -= lr * g * x[i];
      W.ws[si * NHA + j] -= lr * g;
      W.b1[j] -= lr * g;
    }
    return e.reduce((a, v) => a + v * v, 0) / NOA;
  }

  function estado() {
    const it = bot.inventory.items(), ahora = Date.now();
    const cnt = (re) => it.filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
    const sat = (v, k) => v / (v + k);
    const tier = (re) => Math.max(0, ...it.filter((i) => re.test(i.name)).map((i) => TIER[i.name.split('_')[0]] || 0)) / 5;
    const dim = String((bot.game && bot.game.dimension) || 'overworld');
    const yo = bot.entity.position;
    let hos = 0, jug = 0;
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !e.position) continue;
      const dd = e.position.distanceTo(yo);
      if (e.type === 'hostile' && dd < 16) hos++; else if (e.type === 'player' && dd < 32) jug++;
    }
    const food = it.filter((i) => bot.registry.foodsByName && bot.registry.foodsByName[i.name]).reduce((a, i) => a + i.count, 0);
    const arm = [5, 6, 7, 8].map((s) => { const x = bot.inventory.slots[s]; return x ? (TIER[x.name.split('_')[0]] || 0.5) / 5 : 0; });
    const of = bot.inventory.slots[45];
    return [
      cl(bot.health / 20, 0, 1), cl(bot.food / 20, 0, 1), bot.time && bot.time.timeOfDay >= 13000 ? 1 : 0, /nether/.test(dim) ? 1 : 0, /end/.test(dim) ? 1 : 0, cl((yo.y - 64) / 100, -1, 1), cl(((bot.experience && bot.experience.level) || 0) / 30, 0, 1),
      sat(cnt(/_log$/), 16), sat(cnt(/_planks$/), 16), sat(cnt(/^cobblestone$/), 32), sat(cnt(/^(coal|charcoal)$/), 8), sat(cnt(/^(raw_iron|iron_ingot)$/), 8), sat(cnt(/^(raw_gold|gold_ingot)$/), 4), sat(cnt(/^diamond$/), 3), sat(cnt(/^redstone$/), 8), sat(cnt(/^lapis_lazuli$/), 4), sat(cnt(/^(raw_copper|copper_ingot)$/), 8),
      sat(food, 5), tier(/_pickaxe$/), tier(/_sword$/), tier(/_axe$/), ...arm,
      (of && of.name === 'shield') || cnt(/^shield$/) ? 1 : 0, cnt(/^(bow|crossbow)$/) ? 1 : 0, sat(cnt(/^arrow$/), 16), cnt(/^bucket$/) ? 1 : 0, cnt(/^water_bucket$/) ? 1 : 0, cnt(/_bed$/) ? 1 : 0, cnt(/^totem_of_undying$/) ? 1 : 0, cnt(/^(golden_apple|enchanted_golden_apple)$/) ? 1 : 0, sat(cnt(/^ender_pearl$/), 4), sat(cnt(/^tnt$/), 4),
      cl(it.length / 36, 0, 1), sat(hos, 2), sat(jug, 1),
      cl((bot._atascos ? bot._atascos.reciente(600_000) : 0) / 3, 0, 1), cl((bot._mapa ? bot._mapa.peligro(yo) : 0) / 3, 0, 1),
    ];
  }
  const idx = (n) => { if (d.pasos[n] !== undefined) return d.pasos[n]; const k = Object.keys(d.pasos).length; if (k >= NS) return -1; d.pasos[n] = k; sucio = true; return k; };

  function preparar(nombres) {
    const ahora = Date.now();
    if (cache && ahora - cache.t < 1500 && nombres.length === cache.n) return;
    if (!bot.entity) { mults = {}; return; }
    let x; try { x = estado(); } catch (e) { mults = {}; return; }
    const us = [], ps = [];
    for (const n of nombres) {
      const si = idx(n);
      if (si < 0) continue;
      const { o } = fwd(x, si), D = Math.max(10, Math.exp(o[2] * Math.log(601)) - 1);
      const u = ((0.6 * o[0] * 5 + 0.4 * o[1] * 10) * (0.5 + 0.5 * o[3]) - 2 * o[4] - 1.5 * o[5]) / D;
      ps.push({ n, u, o, D, c: Math.min(1, d.n / 80) * Math.min(1, (d.cnt[n] || 0) / 4) });
      if (d.cnt[n]) us.push(u);
    }
    mults = {};
    if (us.length >= 2) {
      const med = us.slice().sort((a, b) => a - b)[Math.floor(us.length / 2)];
      const sd = Math.max(0.02, Math.sqrt(us.reduce((a, v) => a + (v - med) * (v - med), 0) / us.length));
      for (const p of ps) { const m = Math.exp(cl(0.5 * (p.u - med) / sd, -0.8, 0.8)); mults[p.n] = 1 + p.c * (m - 1); }
    }
    info = ps.sort((a, b) => b.u - a.u).slice(0, 4).map((p) => `${p.n}:${(p.u * 100).toFixed(1)}(${(p.o[3] * 100).toFixed(0)}%/${Math.round(p.D)}s)`).join(' ');
    diag.estado.nnAbasto = `muestras ${d.n} modo ${modo === 'sombra' ? 'sombra' : d.n >= 80 ? 'activa' : 'aprendiendo'} top ${info}`;
    cache = { t: ahora, n: nombres.length };
  }
  const mult = (n) => (modo === 'sombra' ? 1 : mults[n] || 1);

  function inicio(nombre) {
    if (!bot.entity) return null;
    let x; try { x = estado(); } catch (e) { return null; }
    const si = idx(nombre);
    if (si < 0) return null;
    const m = { nombre, x, si, t0: Date.now(), n0: bot._premio ? bot._premio.neto() : 0, atasco: 0 };
    actual = m;
    return m;
  }
  function fin(m, ok) {
    if (!m) return;
    if (actual === m) actual = null;
    m.dur = (Date.now() - m.t0) / 1000; m.ok = ok ? 1 : 0; m.nEnd = bot._premio ? bot._premio.neto() : 0; m.muerte = 0;
    pend.push(m);
  }
  bot.on('death', () => { for (const m of pend) if (Date.now() - m.t0 < 90_000) m.muerte = 1; });

  function cerrar(m) {
    const y = [cl((m.nEnd - m.n0) / 5, -1, 1), cl((m.nFin - m.n0) / 10, -1, 1), cl(Math.log1p(m.dur) / Math.log(601), 0, 1), m.ok, m.muerte, m.atasco ? 1 : 0];
    entrenar(m.x, m.si, y, 0.03);
    d.buf.push({ x: m.x.map((v) => Math.round(v * 1000) / 1000), si: m.si, y }); if (d.buf.length > 600) d.buf.shift();
    for (let i = 0; i < 6 && d.buf.length > 5; i++) { const b = d.buf[Math.floor(Math.random() * d.buf.length)]; entrenar(b.x, b.si, b.y, 0.02); }
    d.n++; d.cnt[m.nombre] = (d.cnt[m.nombre] || 0) + 1; sucio = true; cache = null;
  }
  const t1 = setInterval(() => {
    const ahora = Date.now();
    for (let i = pend.length - 1; i >= 0; i--) if (ahora - pend[i].t0 >= 300_000) { const m = pend.splice(i, 1)[0]; m.nFin = bot._premio ? bot._premio.neto() : m.nEnd; cerrar(m); }
  }, 10_000);
  const t2 = setInterval(() => {
    if (d.buf.length < 20 || (bot.pvp && bot.pvp.target)) return;
    for (let i = 0; i < 10; i++) { const b = d.buf[Math.floor(Math.random() * d.buf.length)]; entrenar(b.x, b.si, b.y, 0.015); }
    sucio = true;
  }, 30_000);
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const t3 = setInterval(guardar, 60_000);
  [t1, t2, t3].forEach((t) => t.unref && t.unref());
  bot.once('end', () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); guardar(); });
  const api = { preparar, mult, inicio, fin, guardar, atasco: () => { if (actual) actual.atasco = 1; }, estado: () => ({ n: d.n, cnt: d.cnt }), _cerrar: (m) => { m.nFin = m.nEnd; cerrar(m); }, _fwd: fwd };
  bot._nnAb = api;
  return api;
}
module.exports = { crearNNAbasto, NF };
