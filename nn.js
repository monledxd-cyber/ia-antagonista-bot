const fs = require('fs');
const REL = require('./relevancia');
const diag = require('./diag');

const ACC = ['atacar', 'retroceder', 'curar', 'bloquear', 'esquivar', 'otra'];
const NI = 62 + REL.NC, NP = 3, AUX = 0.5, NH = 64, NO = ACC.length, GAMMA = 0.85, LR = 0.01, VENT = 8;
const NE = Math.max(1, Number(process.env.IA_NN_N) || 3);
const TICK_MS = Number(process.env.IA_NN_MS) || 400;

function rnn(w) {
  const r = (n, s) => Array.from({ length: n }, () => (Math.random() - 0.5) * 2 * s);
  const ok = w && w.w1 && w.w1.length === NI * NH && w.u && w.u.length === NH * NH;
  const m = ok ? w : { w1: r(NI * NH, 0.3), u: r(NH * NH, 0.12), b1: new Array(NH).fill(0), w2: r(NH * NO, 0.3), b2: new Array(NO).fill(0) };
  if (!m.w3 || m.w3.length !== NH * NP) { m.w3 = r(NH * NP, 0.1); m.b3 = new Array(NP).fill(0); }
  const pad = (x) => (x.length < NI ? x.concat(new Array(NI - x.length).fill(0)) : x);
  const cero = () => new Array(NH).fill(0);
  const step = (x, hp) => {
    x = pad(x);
    const h = new Array(NH);
    for (let j = 0; j < NH; j++) {
      let s = m.b1[j];
      for (let i = 0; i < NI; i++) s += x[i] * m.w1[i * NH + j];
      for (let i = 0; i < NH; i++) s += hp[i] * m.u[i * NH + j];
      h[j] = Math.tanh(s);
    }
    const o = new Array(NO);
    for (let k = 0; k < NO; k++) { let s = m.b2[k]; for (let j = 0; j < NH; j++) s += h[j] * m.w2[j * NO + k]; o[k] = s; }
    const pr = new Array(NP);
    for (let k = 0; k < NP; k++) { let s = m.b3[k]; for (let j = 0; j < NH; j++) s += h[j] * m.w3[j * NP + k]; pr[k] = Math.tanh(s); }
    return { h, o, p: pr };
  };
  const seq = (xs, h0) => {
    const hs = [h0 || cero()], os = [], ps = [];
    for (const x of xs) { const r2 = step(x, hs[hs.length - 1]); hs.push(r2.h); os.push(r2.o); ps.push(r2.p); }
    return { hs, os, ps };
  };
  const clip = (v) => Math.max(-1, Math.min(1, v));
  const grad = (xs, dOs, h0, lr, dPs) => {
    xs = xs.map(pad);
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
      if (dPs && dPs[t]) for (let k = 0; k < NP; k++) {
        const e = dPs[t][k];
        if (!e) continue;
        for (let j = 0; j < NH; j++) { dh[j] += e * m.w3[j * NP + k]; m.w3[j * NP + k] -= lr * e * h[j]; }
        m.b3[k] -= lr * e;
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
  const tdVentana = (ep, ini, lr, tgt) => {
    const w = ep.slice(ini, ini + VENT), n = w.length;
    if (n < 2 && !ep[ini + n - 1].fin) return 0;
    const xs = w.map((p) => p.s), { os, ps } = seq(xs, null), ot = tgt ? tgt.seq(xs, null).os : os, dOs = w.map(() => new Array(NO).fill(0));
    const dPs = w.map((x, t) => (x.p ? ps[t].map((v, k) => AUX * clip((v - x.p[k]) * (1 - v * v))) : null));
    const aux = dPs.some((x) => x);
    let err = 0, cnt = 0;
    for (let t = 0; t < n; t++) {
      let obj;
      if (w[t].fin) obj = w[t].r;
      else if (t + 1 < n) { const sig = os[t + 1], am = sig.indexOf(Math.max(...sig)); obj = w[t].r + GAMMA * ot[t + 1][am]; }
      else continue;
      obj = Math.max(-3, Math.min(3, obj));
      const e = clip(os[t][w[t].a] - obj);
      dOs[t][w[t].a] = e; err += e * e; cnt++;
    }
    if (cnt || aux) grad(xs, dOs, null, lr, dPs);
    return cnt ? err / cnt : 0;
  };
  const copiar = (o) => { for (const k of ['w1', 'u', 'b1', 'w2', 'b2', 'w3', 'b3']) m[k] = o.m[k].slice(); };
  return { m, step, seq, grad, pre, tdVentana, cero, copiar };
}

function migrar(m) {
  const nh0 = m.b1.length, ni0 = Math.round(m.w1.length / nh0), r = () => (Math.random() - 0.5) * 0.1;
  if (ni0 === NI && nh0 === NH) return m;
  const w1 = new Array(NI * NH), u = new Array(NH * NH), w2 = new Array(NH * NO), b1 = new Array(NH).fill(0);
  for (let i = 0; i < NI; i++) for (let j = 0; j < NH; j++) w1[i * NH + j] = i < ni0 && j < nh0 ? m.w1[i * nh0 + j] : r();
  for (let i = 0; i < NH; i++) for (let j = 0; j < NH; j++) u[i * NH + j] = i < nh0 && j < nh0 ? m.u[i * nh0 + j] : r() * 0.5;
  for (let j = 0; j < NH; j++) for (let k = 0; k < NO; k++) w2[j * NO + k] = j < nh0 ? m.w2[j * NO + k] : r();
  for (let j = 0; j < nh0 && j < NH; j++) b1[j] = m.b1[j];
  return { w1, u, b1, w2, b2: m.b2, w3: m.w3, b3: m.b3 };
}

function crearNN(bot, ruta, rutaDatos) {
  let red = null, eps = [], act = [], pend = [], sucio = false, hs = [], ultSug = null, inc = 0, extras = [];
  let st = { na: 0, ra: 0, nd: 0, rd: 0, ent: 0, err: 0, pre: 0, sim: 0, simWin: 0, base: 0, pe: 0, pb: 0, pn: 0 };
  let ultRel = null, ultPend = null, ultPred = null;
  try { const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (d && d.m && d.m.u && d.m.w1 && d.m.b1) { d.m = migrar(d.m); red = rnn(d.m); st = Object.assign(st, d.st || {}); if (Array.isArray(d.ms)) extras = d.ms.filter((x) => x && x.w1 && x.u && x.b1).map((x) => rnn(migrar(x))); } } catch (e) { /* nueva */ }
  if (!red) red = rnn();
  try { const d = JSON.parse(fs.readFileSync(rutaDatos, 'utf8')); if (Array.isArray(d)) eps = d.filter((e) => Array.isArray(e) && e.length && e[0].s && e[0].s.length <= NI); for (const e of eps) for (const p of e) while (p.s.length < NI) p.s.push(0); } catch (e) { /* vacio */ }
  const MODO = process.env.IA_NN || 'auto';
  let sinc = 0, ultLibre = Date.now();
  const clon = (r, ruido) => { const m = JSON.parse(JSON.stringify(r.m)); if (ruido) for (const k of ['w1', 'u', 'w2', 'w3']) for (let i = 0; i < m[k].length; i++) m[k][i] += (Math.random() - 0.5) * ruido; return rnn(m); };
  let redes = [red], objetivos = [];

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
  for (const x of extras.slice(0, NE - 1)) redes.push(x);
  while (redes.length < NE) redes.push(clon(red, 0.1));
  objetivos = redes.map((r) => clon(r, 0));
  hs = redes.map((r) => r.cero());

  const dmgIn = [], hitsOut = [];
  let hpAnt = null;
  bot.on('health', () => { const h = bot.health; if (hpAnt !== null && h < hpAnt) dmgIn.push({ t: Date.now(), v: hpAnt - h }); hpAnt = h; while (dmgIn.length > 40) dmgIn.shift(); });
  bot.on('entityHurt', (e) => { const t = bot.pvp && bot.pvp.target; if (t && e && e.id === t.id) { hitsOut.push(Date.now()); while (hitsOut.length > 40) hitsOut.shift(); } });
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

  function extra(t) {
    const ahora = Date.now(), cnt = (re) => bot.inventory.items().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
    const din = dmgIn.filter((x) => ahora - x.t < 3000).reduce((a, x) => a + x.v, 0), hout = hitsOut.filter((x) => ahora - x < 3000).length;
    const ult = hitsOut.length ? (ahora - hitsOut[hitsOut.length - 1]) / 1000 : 2;
    const yo = bot.entity.position;
    let hostiles = 0, jugadores = 0;
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !e.position) continue;
      const d = e.position.distanceTo(yo);
      if (e.type === 'player') { if (e.id !== t.id && d < 24) jugadores++; } else if (e.type === 'hostile' && d < 12) hostiles++;
    }
    return [c(din / 10, 0, 1), c(hout / 6, 0, 1), c(Math.min(2, ult) / 2, 0, 1), c(cnt(/^totem_of_undying$/) / 2, 0, 1), c(cnt(/potion$/) / 4, 0, 1), c(bot.inventory.items().filter((i) => bot.registry.foodsByName && bot.registry.foodsByName[i.name]).reduce((a, i) => a + i.count, 0) / 16, 0, 1), c(hostiles / 4, 0, 1), c(jugadores / 3, 0, 1)];
  }

  const rel = (t) => { const p = t.position, yo = bot.entity.position, dx = p.x - yo.x, dz = p.z - yo.z; return { id: t.id, t: Date.now(), d: Math.hypot(dx, dz), a: Math.atan2(dz, dx), y: p.y - yo.y }; };
  const objetivoP = (r0, r1) => {
    let da = r1.a - r0.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    return [c((r1.d - r0.d) / 3, -1, 1), c(r0.d * da / 3, -1, 1), c((r1.y - r0.y) / 2, -1, 1)];
  };
  function cinem(t, yo, nd, ux, uz, cierre) {
    const P = bot._pred;
    if (!P) return new Array(12).fill(0);
    const R = P.resumen ? P.resumen() : { proy: null, pase: 99, expl: null };
    const f = P.futura(t, 8), d8 = Math.hypot(f.x - yo.x, f.z - yo.z), L = P.aterrizaje(t), v = P.vel(t);
    const tc = nd > 3 && cierre > 0.2 ? c((nd - 3) / cierre / 3, 0, 1) : 1;
    return [c(d8 / 10, 0, 2), c((d8 - nd) / 4, -1, 1), c((f.y - yo.y) / 5, -1, 1), L ? 1 : 0, L ? c(L.n / 40, 0, 1) : 1, L ? c(Math.hypot(L.x - yo.x, L.z - yo.z) / 6, 0, 1) : 1, L ? c(L.alto / 10, 0, 1) : 0, tc, c((v.x * -uz + v.z * ux) * 20 / 6, -1, 1), R.proy === null ? 1 : c(R.proy / 25, 0, 1), c(R.pase / 3, 0, 1), R.expl === null ? 1 : c(R.expl / 12, 0, 1)];
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
    const sv = [
      c(bot.health / 20, 0, 1), c(bot.food / 20, 0, 1), hr === null ? 0.5 : c(hr / 20, 0, 1), hr === null ? 1 : 0,
      c(d / 10, 0, 2), c((t.position.y - yo.y) / 5, -1, 1), c(Math.hypot(v.x, v.z) * 20 / 6, 0, 1), c(cierre / 6, -1, 1),
      ...oh, escudoR, /bow|crossbow|trident/.test(arma) ? 1 : 0,
      clase(mia) / 5, arm([5, 6, 7, 8].map((i) => bot.inventory.slots[i])), arm((t.equipment || []).slice(2, 6)),
      lag ? c(lag.ping() / 300, 0, 1) : 0, lag ? c(lag.tps() / 20, 0, 1) : 1, lag && lag.rival(t) ? 1 : 0,
      noche, bot.entity.isInWater ? 1 : 0, c(cau, 0, 1),
      cnt(/^(golden_apple|enchanted_golden_apple)$/) > 0 ? 1 : 0, cnt(/^ender_pearl$/) > 0 ? 1 : 0, bot._premio ? bot._premio.ventaja(t) : 0,
      ...entorno(),
      ...(bot._leng ? bot._leng.vector(t.username) : [0, 0, 0, 0]),
      ...extra(t),
      ...cinem(t, yo, nd, dir.x / nd, dir.z / nd, cierre),
      ...(bot._perc ? bot._perc.vector(t) : [0, 1, 0, 0]),
      ...(bot._afecto ? bot._afecto.vector(t) : [0, 0, 0]),
    ];
    return REL.aplicar(bot, sv, t);
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
  function cerrarMuestra(m, extra, fin) {
    const dh = (m.hp2 - m.hp) / 20, dr = m.rhp !== null && m.rhp2 !== null ? (m.rhp - m.rhp2) / 20 : 0;
    const pn = bot._premio ? 0.5 * Math.tanh((bot._premio.neto() - (m.n0 || 0)) / 4) : 0;
    const r = c(dh + 0.5 * dr + pn + (extra || 0), -1.5, 1.5);
    if (m.sug !== null) { if (m.sug === m.a) { st.ra += r; st.na++; } else { st.rd += r; st.nd++; } }
    act.push({ s: m.s, a: m.a, r, fin: !!fin, p: m.p });
    sucio = true;
  }

  const pri = (e) => 0.2 + e.reduce((a, p) => a + Math.abs(p.r), 0) / e.length;
  function elegirEp() {
    let tot = 0; const ps = eps.map((e, i) => { const v = pri(e) * (1 + 0.5 * i / eps.length); tot += v; return v; });
    let r = Math.random() * tot;
    for (let i = 0; i < eps.length; i++) { r -= ps[i]; if (r <= 0) return eps[i]; }
    return eps[eps.length - 1];
  }
  function entrenar(n) {
    const total = eps.reduce((a, e) => a + e.length, 0);
    if (total < 30) return;
    let err = 0;
    for (let k = 0; k < n; k++) {
      const ep = elegirEp();
      const ini = Math.max(0, Math.floor(Math.random() * Math.max(1, ep.length - 1)) - 1);
      const i = k % redes.length, e2 = i === 0 ? ep : elegirEp();
      const ini2 = i === 0 ? ini : Math.max(0, Math.floor(Math.random() * Math.max(1, e2.length - 1)) - 1);
      err += redes[i].tdVentana(e2, ini2, LR, objetivos[i]);
    }
    if (++sinc >= 4) { redes.forEach((r, i) => objetivos[i].copiar(r)); sinc = 0; }
    st.ent += n; st.err = err / n; sucio = true;
  }

  const softmax = (q, T) => { const mx = Math.max(...q), e = q.map((v) => Math.exp((v - mx) / T)), s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };
  function elegirAccion(q) {
    const e0 = Math.min(0.6, Math.max(0.04, 0.3 * Math.exp(-st.ent / 1500)) + 0.3 * Math.min(1, inc * 2));
    if (Math.random() >= e0) return mejor(q);
    const p = softmax(q, 0.5); let r = Math.random();
    for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return i; }
    return mejor(q);
  }
  const confianza = (q) => { const o = q.slice().sort((a, b) => b - a); return Math.tanh(2 * (o[0] - o[1])); };
  const sesgos = (sug, q) => {
    if (!activo()) return {};
    const k = (0.4 + 0.6 * confianza(q)) / (1 + 3 * inc);
    const e = (o) => { const r = {}; for (const [n, v] of Object.entries(o)) r[n] = v * k; return r; };
    if (sug === 0) return e({ agresion: 0.2 });
    if (sug === 1) return e({ cautela: 0.2, agresion: -0.12 });
    if (sug === 2) return e({ cautela: 0.2, agresion: -0.15 });
    if (sug === 3) return e({ cautela: 0.12, paciencia: 0.15 });
    if (sug === 4) return e({ astucia: 0.15, cautela: 0.05 });
    return {};
  };

  let ocupado = false, ultTick = 0;
  function decidir() {
    if (!bot.entity || ocupado) return;
    const ahora = Date.now(), t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) { if (bot._bandits) bot._bandits.nnExtra = {}; return; }
    ocupado = true; ultTick = ahora;
    try {
      let s; try { s = estado(t); } catch (e) { return; }
      const r1 = rel(t), rapido = !!(ultRel && ultRel.id === t.id && r1.t - ultRel.t < 250);
      if (!rapido && ultRel && ultRel.id === t.id && r1.t - ultRel.t < 1200) {
        const tg = objetivoP(ultRel, r1);
        if (ultPend) ultPend.p = tg;
        if (ultPred) {
          const me = tg.reduce((a, v, k) => a + (v - ultPred[k]) * (v - ultPred[k]), 0) / NP, mb = tg.reduce((a, v) => a + v * v, 0) / NP, al = st.pn < 30 ? 1 / (st.pn + 1) : 0.03;
          st.pe += al * (me - st.pe); st.pb += al * (mb - st.pb); st.pn++;
          diag.estado.nnPred = `prediccion rival: error ${st.pe.toFixed(3)} vs base ${st.pb.toFixed(3)} (${st.pn} muestras)`;
        }
      }
      if (!rapido) ultRel = r1;
      const rs = redes.map((r, i) => r.step(s, hs[i]));
      hs = rs.map((x) => x.h);
      const q = new Array(NO).fill(0).map((_, k) => rs.reduce((a, x) => a + x.o[k], 0) / rs.length);
      inc = rs.length > 1 ? q.reduce((a, m, k) => a + Math.sqrt(rs.reduce((b, x) => b + (x.o[k] - m) * (x.o[k] - m), 0) / rs.length), 0) / NO : 0;
      if (!rapido) ultPred = [0, 1, 2].map((k) => rs.reduce((a, x) => a + x.p[k], 0) / rs.length);
      const sug = elegirAccion(q); ultSug = sug;
      if (bot._bandits) bot._bandits.nnExtra = sesgos(sug, q);
      pend.push({ s, a: accion(t), sug, hp: bot.health, rhp: vidaRival(t), t: ahora, n0: bot._premio ? bot._premio.neto() : 0 });
      if (!rapido) ultPend = pend[pend.length - 1];
      while (pend.length && ahora - pend[0].t >= 3000) { const m = pend.shift(); m.hp2 = bot.health; m.rhp2 = vidaRival(t); cerrarMuestra(m, 0, false); }
      diag.estado.nn = `eps ${eps.length} ent ${st.ent} err ${st.err.toFixed(3)} sug ${ACC[ultSug]} redes ${redes.length} desacuerdo ${inc.toFixed(2)} ${activo() ? 'ACTIVA' : 'sombra'} acuerdo ${st.na}/${st.nd} r ${(st.na ? st.ra / st.na : 0).toFixed(2)}/${(st.nd ? st.rd / st.nd : 0).toFixed(2)} sim ${Math.round(st.simWin * 100)}%/${Math.round(st.base * 100)}%`;
    } finally { ocupado = false; }
  }
  const it = setInterval(() => {
    decidir();
    if (!(bot.pvp && bot.pvp.target) && Date.now() - ultLibre > 15000) { ultLibre = Date.now(); entrenar(20); }
  }, TICK_MS);
  let hpPrev = null;
  bot.on('health', () => { const v = bot.health; if (hpPrev !== null && v < hpPrev && Date.now() - ultTick > 120) decidir(); hpPrev = v; });

  const guardar = () => {
    if (!sucio) return;
    try { fs.writeFileSync(ruta, JSON.stringify({ m: red.m, ms: redes.slice(1).map((r) => r.m), st })); fs.writeFileSync(rutaDatos, JSON.stringify(eps)); sucio = false; } catch (e) { /* ignorar */ }
  };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const api = {
    fin: (res) => {
      const extra = res === 'gane' ? 0.5 : res === 'perdi' ? -0.8 : 0;
      const n = pend.length;
      for (const m of pend.splice(0)) { m.hp2 = bot.health; m.rhp2 = null; cerrarMuestra(m, extra / Math.max(1, n), false); }
      if (act.length) { act[act.length - 1].fin = true; eps.push(act); let tot = eps.reduce((a, e) => a + e.length, 0); while (tot > 4000 && eps.length > 1) tot -= eps.shift().length; }
      act = []; hs = redes.map((r) => r.cero());
      entrenar(150);
      if (bot._bandits) bot._bandits.nnExtra = {};
      guardar();
    },
    precalentar, simular, sugerir: () => (ultSug === null ? null : ACC[ultSug]), predRival: () => (ultPred ? { cierre: -ultPred[0] * 3, lateral: ultPred[1] * 3, altura: ultPred[2] * 2 } : null), estado: () => st, activo, guardar, ACC, entrenar, _estadoDe: estado,
  };
  bot._nn = api;
  return api;
}
module.exports = { crearNN, rnn, ACC, NI, NO };
