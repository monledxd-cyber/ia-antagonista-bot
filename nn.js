const fs = require('fs');
const diag = require('./diag');

const ACC = ['atacar', 'retroceder', 'curar', 'bloquear', 'esquivar', 'otra'];
const NI = 35, NH = 32, NO = ACC.length, GAMMA = 0.8, LR = 0.01, VENT = 6;

function rnn(w) {
  const r = (n, s) => Array.from({ length: n }, () => (Math.random() - 0.5) * 2 * s);
  const ok = w && w.w1 && w.w1.length === NI * NH && w.u && w.u.length === NH * NH;
  const m = ok ? w : { w1: r(NI * NH, 0.3), u: r(NH * NH, 0.12), b1: new Array(NH).fill(0), w2: r(NH * NO, 0.3), b2: new Array(NO).fill(0) };
  const cero = () => new Array(NH).fill(0);
  const step = (x, hp) => {
    const h = new Array(NH);
    for (let j = 0; j < NH; j++) {
      let s = m.b1[j];
      for (let i = 0; i < NI; i++) s += x[i] * m.w1[i * NH + j];
      for (let i = 0; i < NH; i++) s += hp[i] * m.u[i * NH + j];
      h[j] = Math.tanh(s);
    }
    const o = new Array(NO);
    for (let k = 0; k < NO; k++) { let s = m.b2[k]; for (let j = 0; j < NH; j++) s += h[j] * m.w2[j * NO + k]; o[k] = s; }
    return { h, o };
  };
  const seq = (xs, h0) => {
    const hs = [h0 || cero()], os = [];
    for (const x of xs) { const r2 = step(x, hs[hs.length - 1]); hs.push(r2.h); os.push(r2.o); }
    return { hs, os };
  };
  const clip = (v) => Math.max(-1, Math.min(1, v));
  const grad = (xs, dOs, h0, lr) => {
    const { hs } = seq(xs, h0);
    let dhSig = cero();
    for (let t = xs.length - 1; t >= 0; t--) {
      const h = hs[t + 1], hprev = hs[t], dh = dhSig.slice();
      for (let k = 0; k < NO; k++) {
        const e = dOs[t][k];
        if (!e) continue;
        for (let j = 0; j < NH; j++) { dh[j] += e * m.w2[j * NO + k]; m.w2[j * NO + k] -= lr * e * h[j]; }
        m.b2[k] -= lr * e;
      }
      const dp = new Array(NH);
      for (let j = 0; j < NH; j++) dp[j] = clip(dh[j] * (1 - h[j] * h[j]));
      const nuevo = cero();
      for (let i = 0; i < NH; i++) { let s = 0; for (let j = 0; j < NH; j++) s += m.u[i * NH + j] * dp[j]; nuevo[i] = s; }
      for (let j = 0; j < NH; j++) {
        if (!dp[j]) continue;
        for (let i = 0; i < NI; i++) m.w1[i * NH + j] -= lr * dp[j] * xs[t][i];
        for (let i = 0; i < NH; i++) m.u[i * NH + j] -= lr * dp[j] * hprev[i];
        m.b1[j] -= lr * dp[j];
      }
      dhSig = nuevo;
    }
  };
  const pre = (x, q, lr) => {
    const { o } = step(x, cero());
    grad([x], [o.map((v, k) => clip(v - q[k]))], null, lr);
  };
  const tdVentana = (ep, ini, lr) => {
    const w = ep.slice(ini, ini + VENT), n = w.length;
    if (n < 2 && !ep[ini + n - 1].fin) return 0;
    const xs = w.map((p) => p.s), { os } = seq(xs, null), dOs = w.map(() => new Array(NO).fill(0));
    let err = 0, cnt = 0;
    for (let t = 0; t < n; t++) {
      let obj;
      if (w[t].fin) obj = w[t].r;
      else if (t + 1 < n) obj = w[t].r + GAMMA * Math.max(...os[t + 1]);
      else continue;
      obj = Math.max(-3, Math.min(3, obj));
      const e = clip(os[t][w[t].a] - obj);
      dOs[t][w[t].a] = e; err += e * e; cnt++;
    }
    if (cnt) grad(xs, dOs, null, lr);
    return cnt ? err / cnt : 0;
  };
  return { m, step, seq, grad, pre, tdVentana, cero };
}

function crearNN(bot, ruta, rutaDatos) {
  let red = null, eps = [], act = [], pend = [], sucio = false, h = null, ultSug = null;
  let st = { na: 0, ra: 0, nd: 0, rd: 0, ent: 0, err: 0, pre: 0, sim: 0, simWin: 0, base: 0 };
  try { const d = JSON.parse(fs.readFileSync(ruta, 'utf8')); if (d && d.m && d.m.u && d.m.w1.length === 31 * NH) { const ex = []; for (let i = 0; i < 4 * NH; i++) ex.push((Math.random() - 0.5) * 0.1); d.m.w1 = d.m.w1.concat(ex); }
    if (d && d.m && d.m.u && d.m.w1.length === NI * NH) { red = rnn(d.m); st = Object.assign(st, d.st || {}); } } catch (e) { /* nueva */ }
  if (!red) red = rnn();
  try { const d = JSON.parse(fs.readFileSync(rutaDatos, 'utf8')); if (Array.isArray(d)) eps = d.filter((e) => Array.isArray(e) && e.length && e[0].s && (e[0].s.length === NI || e[0].s.length === 31)); for (const e of eps) for (const p of e) while (p.s.length < NI) p.s.push(0); } catch (e) { /* vacio */ }
  const MODO = process.env.IA_NN || 'auto';
  h = red.cero();

  function precalentar(n = 6000, epocas = 12) {
    const casos = require('./nn_casos').generar(n);
    for (let e = 0; e < epocas; e++) { const lr = 0.02 * Math.pow(0.8, e); for (const c of casos) red.pre(c.s, c.q, lr); }
    st.pre++; sucio = true;
  }
  function simular(n = 600) {
    const S = require('./nn_sim');
    const r = S.entrenar(red, n);
    st.sim++; st.simWin = r.win; st.base = r.base; sucio = true;
    diag.log('info', 'nn', `sim ${n} episodios: gana ${Math.round(r.win * 100)}% (experto ${Math.round(r.base * 100)}%)`);
  }
  if (!st.pre) precalentar();
  if (!st.sim && process.env.IA_NN_SIM !== '0') simular();

  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clase = (n) => /mace/.test(n) ? 0 : /crystal|anchor/.test(n) ? 1 : /_sword/.test(n) ? 2 : /_axe/.test(n) ? 3 : /bow|trident/.test(n) ? 4 : 5;
  const vidaRival = (e) => { const v = e && e.metadata && e.metadata[9]; return typeof v === 'number' && v >= 0 && v <= 40 ? v : null; };
  const bq = (p) => bot.blockAt(p);

  function entorno() {
    const p = bot.entity.position.floored();
    let lava = 0, vacio = 0;
    try {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) { const b = bq(p.offset(dx, dy, dz)); if (b && (b.name === 'lava' || b.name === 'fire' || b.name === 'magma_block')) lava = 1; }
      let suelo = 0;
      for (let dy = 1; dy <= 4; dy++) { const b = bq(p.offset(0, -dy, 0)); if (b && b.boundingBox === 'block') { suelo = 1; break; } }
      vacio = suelo ? 0 : 1;
    } catch (e) { /* ignorar */ }
    const flechas = Object.values(bot.entities).filter((e) => /^(arrow|spectral_arrow|trident|snowball|fireball|wind_charge)$/.test(e.name || '') && e.position.distanceTo(bot.entity.position) < 12 && e.velocity && e.position.plus(e.velocity).distanceTo(bot.entity.position) < e.position.distanceTo(bot.entity.position)).length;
    return [c(flechas / 2, 0, 1), lava, vacio];
  }

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
    const hr = vidaRival(t), lag = bot._lag;
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
      ...entorno(),
      ...(bot._leng ? bot._leng.vector(t.username) : [0, 0, 0, 0]),
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
  const sesgos = (sug) => {
    if (!activo()) return {};
    if (sug === 1 || sug === 2) return { cautela: 0.15, agresion: -0.1 };
    if (sug === 0) return { agresion: 0.15 };
    return {};
  };

  function cerrarMuestra(m, extra, fin) {
    const dh = (m.hp2 - m.hp) / 20, dr = m.rhp !== null && m.rhp2 !== null ? (m.rhp - m.rhp2) / 20 : 0;
    const pn = bot._premio ? 0.5 * Math.tanh((bot._premio.neto() - (m.n0 || 0)) / 4) : 0;
    const r = c(dh + 0.5 * dr + pn + (extra || 0), -1.5, 1.5);
    if (m.sug !== null) { if (m.sug === m.a) { st.ra += r; st.na++; } else { st.rd += r; st.nd++; } }
    act.push({ s: m.s, a: m.a, r, fin: !!fin });
    sucio = true;
  }

  function entrenar(n) {
    const total = eps.reduce((a, e) => a + e.length, 0);
    if (total < 30) return;
    let err = 0;
    for (let k = 0; k < n; k++) {
      let ep = eps[Math.floor(Math.random() * eps.length)];
      if (Math.random() < 0.4) { const y = eps[Math.floor(Math.random() * eps.length)]; if (y.reduce((a, p) => a + Math.abs(p.r), 0) > ep.reduce((a, p) => a + Math.abs(p.r), 0)) ep = y; }
      const ini = Math.max(0, Math.floor(Math.random() * Math.max(1, ep.length - 1)) - 1);
      err += red.tdVentana(ep, ini, LR);
    }
    st.ent += n; st.err = err / n; sucio = true;
  }

  const it = setInterval(() => {
    if (!bot.entity) return;
    const ahora = Date.now(), t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) { if (bot._bandits) bot._bandits.nnExtra = {}; return; }
    let s; try { s = estado(t); } catch (e) { return; }
    const r = red.step(s, h); h = r.h;
    const sug = mejor(r.o); ultSug = sug;
    if (bot._bandits) bot._bandits.nnExtra = sesgos(sug);
    pend.push({ s, a: accion(t), sug, hp: bot.health, rhp: vidaRival(t), t: ahora, n0: bot._premio ? bot._premio.neto() : 0 });
    while (pend.length && ahora - pend[0].t >= 4000) { const m = pend.shift(); m.hp2 = bot.health; m.rhp2 = vidaRival(t); cerrarMuestra(m, 0, false); }
    diag.estado.nn = `eps ${eps.length} ent ${st.ent} err ${st.err.toFixed(3)} sug ${ACC[ultSug]} ${activo() ? 'ACTIVA' : 'sombra'} acuerdo ${st.na}/${st.nd} r ${(st.na ? st.ra / st.na : 0).toFixed(2)}/${(st.nd ? st.rd / st.nd : 0).toFixed(2)} sim ${Math.round(st.simWin * 100)}%/${Math.round(st.base * 100)}%`;
  }, 1000);

  const guardar = () => {
    if (!sucio) return;
    try { fs.writeFileSync(ruta, JSON.stringify({ m: red.m, st })); fs.writeFileSync(rutaDatos, JSON.stringify(eps)); sucio = false; } catch (e) { /* ignorar */ }
  };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const api = {
    fin: (res) => {
      const extra = res === 'gane' ? 0.5 : res === 'perdi' ? -0.8 : 0;
      const n = pend.length;
      for (const m of pend.splice(0)) { m.hp2 = bot.health; m.rhp2 = null; cerrarMuestra(m, extra / Math.max(1, n), false); }
      if (act.length) { act[act.length - 1].fin = true; eps.push(act); let tot = eps.reduce((a, e) => a + e.length, 0); while (tot > 4000 && eps.length > 1) tot -= eps.shift().length; }
      act = []; h = red.cero();
      entrenar(150);
      if (bot._bandits) bot._bandits.nnExtra = {};
      guardar();
    },
    precalentar, simular, sugerir: () => (ultSug === null ? null : ACC[ultSug]), estado: () => st, activo, guardar, ACC, entrenar, _estadoDe: estado,
  };
  bot._nn = api;
  return api;
}
module.exports = { crearNN, rnn, ACC, NI, NO };
