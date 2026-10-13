const fs = require('fs');
const diag = require('./diag');

// Red neuronal pequena (MLP, JS puro) que aprende el valor esperado de cada accion de pelea.
// Modo sombra: sugiere y mide si coincidir con ella rinde mas; solo si rinde mas, sesga levemente el temperamento.
const ACC = ['atacar', 'retroceder', 'curar', 'bloquear', 'esquivar', 'otra'];
const NI = 28, NH = 16, NO = ACC.length, GAMMA = 0.8, LR = 0.01;

function mlp(w) {
  const r = (n, s) => Array.from({ length: n }, () => (Math.random() - 0.5) * 2 * s);
  const m = w || { w1: r(NI * NH, 0.35), b1: new Array(NH).fill(0), w2: r(NH * NO, 0.35), b2: new Array(NO).fill(0) };
  const fwd = (x) => {
    const h = new Array(NH);
    for (let j = 0; j < NH; j++) { let s = m.b1[j]; for (let i = 0; i < NI; i++) s += x[i] * m.w1[i * NH + j]; h[j] = Math.tanh(s); }
    const o = new Array(NO);
    for (let k = 0; k < NO; k++) { let s = m.b2[k]; for (let j = 0; j < NH; j++) s += h[j] * m.w2[j * NO + k]; o[k] = s; }
    return { h, o };
  };
  const paso = (x, a, objetivo) => {
    const { h, o } = fwd(x);
    const e = Math.max(-1, Math.min(1, o[a] - objetivo));
    const dh = new Array(NH);
    for (let j = 0; j < NH; j++) dh[j] = e * m.w2[j * NO + a] * (1 - h[j] * h[j]);
    for (let j = 0; j < NH; j++) m.w2[j * NO + a] -= LR * e * h[j];
    m.b2[a] -= LR * e;
    for (let j = 0; j < NH; j++) { for (let i = 0; i < NI; i++) m.w1[i * NH + j] -= LR * dh[j] * x[i]; m.b1[j] -= LR * dh[j]; }
    return e * e;
  };
  return { m, fwd, paso, q: (x) => fwd(x).o };
}

function crearNN(bot, ruta, rutaDatos, o) {
  let red = null, buf = [], pend = [], sucio = false, st = { n: 0, acu: 0, ra: 0, na: 0, rd: 0, nd: 0, ent: 0, err: 0 };
  try { const d = JSON.parse(fs.readFileSync(ruta, 'utf8')); if (d && d.m && d.m.w1 && d.m.w1.length === NI * NH) { red = mlp(d.m); st = Object.assign(st, d.st || {}); } } catch (e) { /* nueva */ }
  if (!red) red = mlp();
  try { const d = JSON.parse(fs.readFileSync(rutaDatos, 'utf8')); if (Array.isArray(d)) buf = d.filter((x) => x && x.s && x.s.length === NI); } catch (e) { /* vacio */ }
  const MODO = process.env.IA_NN || 'auto';

  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clase = (n) => /mace/.test(n) ? 0 : /crystal|anchor/.test(n) ? 1 : /_sword/.test(n) ? 2 : /_axe/.test(n) ? 3 : /bow|trident/.test(n) ? 4 : 5;
  const vidaRival = (e) => { const h = e && e.metadata && e.metadata[9]; return typeof h === 'number' && h >= 0 && h <= 40 ? h : null; };

  function estado(t) {
    const yo = bot.entity.position, d = t.position.distanceTo(yo);
    const v = bot._vel ? bot._vel(t) : { x: 0, y: 0, z: 0 };
    const dir = t.position.minus(yo); dir.y = 0; const nd = Math.max(0.01, Math.hypot(dir.x, dir.z));
    const cierre = -((v.x * dir.x + v.z * dir.z) / nd) * 20;
    const arma = (t.heldItem && t.heldItem.name) || '';
    const oh = new Array(6).fill(0); oh[clase(arma)] = 1;
    const mia = (bot.heldItem && bot.heldItem.name) || '';
    const escudoR = Array.isArray(t.equipment) && t.equipment.some((x) => x && x.name === 'shield') ? 1 : 0;
    const arm = (sl) => sl.filter((x) => x).length / 4;
    const hr = vidaRival(t);
    const lag = bot._lag;
    const IC = bot._items;
    const cnt = (re) => bot.inventory.items().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
    const cau = bot._cautela ? bot._cautela(t.username) : 0;
    const noche = bot.time && bot.time.timeOfDay >= 13000 ? 1 : 0;
    return [
      c(bot.health / 20, 0, 1), c(bot.food / 20, 0, 1), hr === null ? 0.5 : c(hr / 20, 0, 1), hr === null ? 1 : 0,
      c(d / 10, 0, 2), c((t.position.y - yo.y) / 5, -1, 1), c(Math.hypot(v.x, v.z) * 20 / 6, 0, 1), c(cierre / 6, -1, 1),
      ...oh, escudoR, /bow|crossbow|trident/.test(arma) ? 1 : 0,
      clase(mia) / 5, arm([5, 6, 7, 8].map((i) => bot.inventory.slots[i])), arm((t.equipment || []).slice(2, 6)),
      lag ? c(lag.ping() / 300, 0, 1) : 0, lag ? c(lag.tps() / 20, 0, 1) : 1, lag && lag.rival(t) ? 1 : 0,
      noche, bot.entity.isInWater ? 1 : 0, c(cau, 0, 1),
      cnt(/^(golden_apple|enchanted_golden_apple)$/) > 0 ? 1 : 0, cnt(/^ender_pearl$/) > 0 ? 1 : 0, bot._premio ? bot._premio.ventaja(t) : 0,
    ];
  }

  function accion(t) {
    if (bot._curando && bot._curando()) return 2;
    const v = bot.entity.velocity, yo = bot.entity.position;
    const dir = t.position.minus(yo); dir.y = 0; const nd = Math.max(0.01, Math.hypot(dir.x, dir.z));
    const ux = dir.x / nd, uz = dir.z / nd, ra = v.x * ux + v.z * uz, la = Math.abs(v.x * -uz + v.z * ux);
    if (bot.usingHeldItem && bot.inventory.slots[45] && bot.inventory.slots[45].name === 'shield') return 3;
    if (ra < -0.08) return 1;
    if (la > 0.1) return 4;
    if (bot.pvp && bot.pvp.target && nd < 4.2) return 0;
    return 5;
  }

  const mejor = (q) => q.indexOf(Math.max(...q));
  const activo = () => MODO !== '0' && MODO !== 'sombra' && st.na >= 40 && st.nd >= 40 && (st.ra / st.na) - (st.rd / st.nd) > 0.02;

  function sesgos(sug) {
    if (!activo()) return {};
    if (sug === 1 || sug === 2) return { cautela: 0.15, agresion: -0.1 };
    if (sug === 0) return { agresion: 0.15 };
    return {};
  }

  function cerrarMuestra(m, s2, extra) {
    const dh = (m.hp2 - m.hp) / 20, dr = m.rhp !== null && m.rhp2 !== null ? (m.rhp - m.rhp2) / 20 : 0;
    const pn = bot._premio ? 0.5 * Math.tanh((bot._premio.neto() - (m.n0 || 0)) / 4) : 0;
    const r = c(dh + 0.5 * dr + pn + (extra || 0), -1.5, 1.5);
    if (m.sug !== null) { if (m.sug === m.a) { st.ra += r; st.na++; } else { st.rd += r; st.nd++; } }
    buf.push({ s: m.s, a: m.a, r, s2: s2 || null });
    if (buf.length > 3000) buf.shift();
    sucio = true;
  }

  function entrenar(n) {
    if (buf.length < 30) return;
    let err = 0;
    for (let k = 0; k < n; k++) {
      const x = buf[Math.floor(Math.random() * buf.length)];
      const obj = x.r + (x.s2 ? GAMMA * Math.max(...red.q(x.s2)) : 0);
      err += red.paso(x.s, x.a, c(obj, -3, 3));
    }
    st.ent += n; st.err = err / n; sucio = true;
  }

  let ultSug = null;
  const it = setInterval(() => {
    if (!bot.entity) return;
    const ahora = Date.now(), t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) { if (bot._bandits) bot._bandits.nnExtra = {}; return; }
    let s; try { s = estado(t); } catch (e) { return; }
    const q = red.q(s), sug = mejor(q);
    ultSug = sug;
    if (bot._bandits) bot._bandits.nnExtra = sesgos(sug);
    pend.push({ s, a: accion(t), sug, hp: bot.health, rhp: vidaRival(t), t: ahora, n0: bot._premio ? bot._premio.neto() : 0 });
    while (pend.length && ahora - pend[0].t >= 4000) {
      const m = pend.shift(); m.hp2 = bot.health; m.rhp2 = vidaRival(t);
      cerrarMuestra(m, s);
    }
    st.acu = st.na + st.nd;
    diag.estado.nn = `muestras ${buf.length} ent ${st.ent} err ${st.err.toFixed(3)} sug ${ACC[ultSug]} ${activo() ? 'ACTIVA' : 'sombra'} acuerdo ${st.na}/${st.nd} r ${(st.na ? st.ra / st.na : 0).toFixed(2)}/${(st.nd ? st.rd / st.nd : 0).toFixed(2)}`;
  }, 1000);

  const guardar = () => {
    if (!sucio) return;
    try { fs.writeFileSync(ruta, JSON.stringify({ m: red.m, st })); fs.writeFileSync(rutaDatos, JSON.stringify(buf.slice(-3000))); sucio = false; } catch (e) { /* ignorar */ }
  };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const api = {
    fin: (res) => {
      const extra = res === 'gane' ? 0.5 : res === 'perdi' ? -0.8 : 0;
      const n = pend.length;
      for (const m of pend.splice(0)) { m.hp2 = bot.health; m.rhp2 = null; cerrarMuestra(m, null, extra / Math.max(1, n)); }
      entrenar(150);
      if (bot._bandits) bot._bandits.nnExtra = {};
      guardar();
    },
    sugerir: () => (ultSug === null ? null : ACC[ultSug]), estado: () => st, activo, guardar, ACC, entrenar, _estadoDe: estado,
  };
  bot._nn = api;
  return api;
}
module.exports = { crearNN, mlp, ACC, NI };
