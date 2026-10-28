const fs = require('fs');
const diag = require('./diag');

const DIM = ['odio', 'desprecio', 'sadismo', 'dominio', 'frustracion', 'hastio', 'fascinacion', 'frialdad'];
const EVT = ['golpe', 'dano', 'muerte', 'gana', 'pierde', 'huye', 'muere_jugador', 'frase_efectiva', 'frase_fallida', 'logro', 'atasco', 'hambre', 'suplica', 'amenaza', 'hostil', 'burla', 'soledad', 'presencia'];
const ESTILOS = ['frio', 'escala', 'repeticion', 'burla_fallo', 'pregunta', 'orden', 'susurro', 'promesa'];
const ND = DIM.length, NE = EVT.length, NS = ESTILOS.length;
const TAU = [1800, 900, 480, 600, 900, 600, 900, 300];
const KAPPA = 0.35, ETA = 0.02, ETA_P = 0.15, ETA_T = 0.05;

const PRI = {
  golpe: { sadismo: 1.2, dominio: 1.5, frialdad: 0.8, hastio: -0.5 },
  dano: { frustracion: 1.2, odio: 1, desprecio: 0.8, frialdad: -0.8, dominio: -0.6 },
  muerte: { frustracion: 2.2, odio: 1.8, dominio: -1.5, frialdad: -1, sadismo: 0.5 },
  gana: { dominio: 1.8, frialdad: 1, hastio: 1, frustracion: -1 },
  pierde: { odio: 1.8, frustracion: 1.6, dominio: -1.6, frialdad: -0.8 },
  huye: { dominio: 1.5, desprecio: 1.6, sadismo: 1.4, fascinacion: 0.5 },
  muere_jugador: { sadismo: 1.2, hastio: 1.8, dominio: 1, fascinacion: -1, frustracion: -0.5 },
  frase_efectiva: { dominio: 1.2, sadismo: 1, fascinacion: 0.6 },
  frase_fallida: { frustracion: 0.8, desprecio: 0.8, dominio: -0.5 },
  logro: { frialdad: 0.6, hastio: -1.2, frustracion: -0.6 },
  atasco: { frustracion: 1, hastio: 0.6 },
  hambre: { frustracion: 0.6, desprecio: 0.5 },
  suplica: { desprecio: 2.2, sadismo: 1.4, fascinacion: 1, odio: 0.4, frialdad: 0.5 },
  amenaza: { desprecio: 1.2, frialdad: 1, odio: 0.5 },
  hostil: { odio: 1.4, desprecio: 0.6 },
  burla: { odio: 1.2, frialdad: 1.2, frustracion: 0.5, dominio: -0.3 },
  soledad: { hastio: 1.2, frustracion: 0.8, odio: 0.4, fascinacion: -0.5 },
  presencia: { fascinacion: 1, hastio: -0.8, desprecio: 0.4 },
};
const MAPA_REGLA = {
  golpe: 'golpe', golpe_pleno: 'golpe', golpe_critico: 'golpe', golpe_flojo: 'golpe', dano: 'dano', muerte: 'muerte', muerte_repetida: 'muerte', gana: 'gana', pierde: 'pierde', huye: 'huye', muere_jugador: 'muere_jugador',
  frase_efectiva: 'frase_efectiva', frase_fallida: 'frase_fallida', atasco: 'atasco', hambre: 'hambre', aire: 'hambre',
  craft_armadura: 'logro', craft_herramienta: 'logro', craft_arma: 'logro', ganar_valioso: 'logro', mineral: 'logro', netherite: 'logro', pocion_ok: 'logro', cosecha_wart: 'logro', item_nuevo: 'logro', paso_ok: 'logro',
};
const PRI_H = [[0, 4, 0.8], [4, 0, 0.3], [2, 3, 0.5], [3, 7, 0.4], [7, 4, -0.9], [5, 7, 0.3], [1, 6, 0.3], [6, 1, 0.3], [5, 3, 0.3]];
const PRI_T = {
  frio: { desprecio: 1, frialdad: 1.2, dominio: 0.4 }, escala: { odio: 1.2, frustracion: 1 }, repeticion: { frustracion: 0.8, hastio: 0.5, odio: 0.4 }, burla_fallo: { desprecio: 0.8, dominio: 0.6 },
  pregunta: { hastio: 1, fascinacion: 0.8, frialdad: 0.3 }, orden: { dominio: 1.2, frialdad: 0.5 }, susurro: { sadismo: 1.2, fascinacion: 0.8, frialdad: 0.4 }, promesa: { sadismo: 0.8, odio: 0.6, dominio: 0.6 },
};

const sig = (x) => 1 / (1 + Math.exp(-x));
const mat = (r, c, v) => Array.from({ length: r }, () => new Array(c).fill(v || 0));
const clon = (a) => a.map((x) => (Array.isArray(x) ? x.slice() : x));
const c01 = (v) => Math.max(0, Math.min(1, v));

function pesosIniciales() {
  const Wx = mat(ND, NE), Wh = mat(ND, ND), Wt = mat(NS, ND), Wp = mat(NE, ND);
  EVT.forEach((e, j) => { for (const [k, v] of Object.entries(PRI[e] || {})) Wx[DIM.indexOf(k)][j] = v; });
  for (let i = 0; i < ND; i++) Wh[i][i] = 0.6;
  for (const [i, j, v] of PRI_H) Wh[i][j] = v;
  ESTILOS.forEach((e, i) => { for (const [k, v] of Object.entries(PRI_T[e] || {})) Wt[i][DIM.indexOf(k)] = v; });
  return { Wx, Wh, b: new Array(ND).fill(-0.8), Wp, bp: new Array(NE).fill(0), Wt, bt: new Array(NS).fill(0), s: sig(-0.8) };
}

function crearPsique(bot, ruta) {
  const w = pesosIniciales();
  let s = new Array(ND).fill(w.s), st = { pe: 0, pb: 0, n: 0, ne: 0 }, jug = {}, frec = new Array(NE).fill(1), base = 0, ultEv = null, sucio = false, ult = Date.now(), ultLog = 0;
  try {
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    for (const k of ['Wx', 'Wh', 'Wp', 'Wt']) if (Array.isArray(d.w && d.w[k]) && d.w[k].length === w[k].length) w[k] = d.w[k];
    for (const k of ['b', 'bp', 'bt']) if (Array.isArray(d.w && d.w[k]) && d.w[k].length === w[k].length) w[k] = d.w[k];
    if (Array.isArray(d.s) && d.s.length === ND) s = d.s;
    st = Object.assign(st, d.st || {}); jug = d.jug || {}; if (Array.isArray(d.frec) && d.frec.length === NE) frec = d.frec; base = d.base || 0;
  } catch (e) { /* nuevo */ }

  const reposo = () => w.b.map(sig);
  function decaer() {
    const ahora = Date.now(), dt = Math.min(120, (ahora - ult) / 1000); ult = ahora;
    if (dt <= 0) return;
    const r = reposo();
    for (let i = 0; i < ND; i++) s[i] = r[i] + (s[i] - r[i]) * Math.exp(-dt / TAU[i]);
  }

  function prediccion(sx) {
    const z = new Array(NE);
    for (let j = 0; j < NE; j++) { let a = w.bp[j]; for (let i = 0; i < ND; i++) a += w.Wp[j][i] * (sx[i] - 0.3); z[j] = a; }
    const mx = Math.max(...z), ex = z.map((v) => Math.exp(v - mx)), sm = ex.reduce((a, b) => a + b, 0);
    return ex.map((v) => v / sm);
  }

  function aprenderPrediccion(j) {
    if (!ultEv) return;
    const p = prediccion(ultEv.sPost), tot = frec.reduce((a, b) => a + b, 0);
    const ce = -Math.log(Math.max(1e-6, p[j])), cb = -Math.log(frec[j] / tot);
    const al = st.n < 50 ? 1 / (st.n + 1) : 0.02;
    st.pe += al * (ce - st.pe); st.pb += al * (cb - st.pb); st.n++;
    const dz = p.slice(); dz[j] -= 1;
    const ds = new Array(ND).fill(0);
    for (let k = 0; k < NE; k++) {
      const g = dz[k];
      if (Math.abs(g) < 1e-9) continue;
      for (let i = 0; i < ND; i++) { ds[i] += g * w.Wp[k][i]; w.Wp[k][i] -= ETA_P * g * (ultEv.sPost[i] - 0.3); }
      w.bp[k] -= ETA_P * g;
    }
    for (let i = 0; i < ND; i++) {
      const du = Math.max(-1, Math.min(1, ds[i])) * KAPPA * ultEv.sg[i] * (1 - ultEv.sg[i]);
      if (!du) continue;
      w.b[i] -= ETA * du;
      for (let k = 0; k < NE; k++) if (ultEv.e[k]) w.Wx[i][k] -= ETA * du * ultEv.e[k];
      for (let k = 0; k < ND; k++) w.Wh[i][k] -= ETA * du * ultEv.sPre[k];
    }
    frec[j] += 1; if (frec[j] > 5000) frec = frec.map((v) => v * 0.5);
    sucio = true;
  }

  function evento(nombre, mag, jugador) {
    const j = EVT.indexOf(nombre);
    if (j < 0) return;
    decaer();
    aprenderPrediccion(j);
    const e = new Array(NE).fill(0); e[j] = c01(mag === undefined ? 0.6 : mag);
    const sPre = s.slice(), sg = new Array(ND);
    for (let i = 0; i < ND; i++) {
      let u = w.b[i];
      for (let k = 0; k < NE; k++) if (e[k]) u += w.Wx[i][k] * e[k];
      for (let k = 0; k < ND; k++) u += w.Wh[i][k] * sPre[k];
      sg[i] = sig(u);
      s[i] = (1 - KAPPA) * sPre[i] + KAPPA * sg[i];
    }
    ultEv = { e, sPre, sg, sPost: s.slice() };
    st.ne++;
    if (jugador) {
      const p = jug[jugador] || (jug[jugador] = { hum: 0, t: 0 });
      if (nombre === 'suplica' || nombre === 'huye') p.hum = Math.min(1, p.hum + 0.15 * (e[j] || 0.5));
      p.t = Date.now();
    }
    sucio = true;
  }

  const evento_ = (regla, x, motivo) => {
    try {
      const n = MAPA_REGLA[regla];
      if (n) evento(n, Math.min(1, Math.abs(x || 0.6) / 1.5), motivo && typeof motivo === 'string' ? String(motivo).split(' ')[0] : null);
    } catch (e) { /* ignorar */ }
  };
  const rasgo = (nombre, r) => {
    try { for (const k of ['suplica', 'amenaza', 'hostil', 'burla']) if (r && r[k] > 0.25) evento(k, r[k], nombre); } catch (e) { /* ignorar */ }
  };

  const logitsEstilo = () => {
    const z = new Array(NS);
    for (let k = 0; k < NS; k++) { let a = w.bt[k]; for (let i = 0; i < ND; i++) a += w.Wt[k][i] * (s[i] - 0.3); z[k] = a; }
    const m = z.reduce((a, b) => a + b, 0) / NS;
    return z.map((v) => v - m);
  };
  function aprenderEstilo(estilo, r, snap) {
    try {
      const k = ESTILOS.indexOf(estilo), x = snap && snap.length === ND ? snap : s;
      if (k < 0) return;
      const z = new Array(NS), mx = [];
      for (let q = 0; q < NS; q++) { let a = w.bt[q]; for (let i = 0; i < ND; i++) a += w.Wt[q][i] * (x[i] - 0.3); z[q] = a; }
      const m = Math.max(...z), ex = z.map((v) => Math.exp(v - m)), sm = ex.reduce((a, b) => a + b, 0), p = ex.map((v) => v / sm);
      base += 0.05 * (r - base);
      const adv = Math.max(-1, Math.min(1, r - base));
      for (let q = 0; q < NS; q++) {
        const g = ETA_T * adv * ((q === k ? 1 : 0) - p[q]);
        w.bt[q] += g;
        for (let i = 0; i < ND; i++) w.Wt[q][i] += g * (x[i] - 0.3);
      }
      sucio = true;
    } catch (e) { /* ignorar */ }
  }

  const sesgos = () => {
    const g = (v, k) => Math.max(-0.12, Math.min(0.12, v * k));
    const [odio, desp, sad, dom, fru, has, fas, fri] = s;
    return { agresion: g(0.5 * odio + 0.5 * dom - 0.35, 0.3), paciencia: g(0.6 * sad + 0.6 * fri - 0.35, 0.3), astucia: g(0.5 * has + 0.5 * fas - 0.3, 0.25), cautela: g(0.3 * fru - 0.4 * dom + 0.05, 0.25) };
  };
  const dominante = () => { let k = 0; for (let i = 1; i < ND; i++) if (s[i] > s[k]) k = i; return s[k] > 0.5 ? DIM[k] : null; };

  const resumen = () => DIM.map((k, i) => k.slice(0, 4) + ' ' + s[i].toFixed(2)).join(' ');
  const iv = setInterval(() => {
    try {
      decaer();
      const ahora = Date.now(), yo = bot.entity && bot.entity.position;
      let cerca = false, lejos = true;
      if (yo) for (const e of Object.values(bot.entities || {})) { if (e && e.type === 'player' && e !== bot.entity && e.position) { const d = e.position.distanceTo(yo); if (d < 16) cerca = true; if (d < 48) lejos = false; } }
      if (cerca && ahora - (api._pres || 0) > 20_000) { api._pres = ahora; evento('presencia', 0.5); }
      else if (!yo || (lejos && ahora - (api._sol || 0) > 30_000 && ahora - (api._sinRival || ahora) > 60_000)) { api._sol = ahora; evento('soledad', 0.4); }
      if (cerca || !lejos) api._sinRival = ahora; else if (!api._sinRival) api._sinRival = ahora;
      diag.estado.psique = resumen() + (st.n > 20 ? ` | pred ${st.pe.toFixed(2)} vs ${st.pb.toFixed(2)}` : '');
      if (ahora - ultLog > 300_000) { ultLog = ahora; console.log('[psique] ' + diag.estado.psique); }
    } catch (e) { /* ignorar */ }
  }, 5000);
  const gt = setInterval(() => guardar(), 60_000);
  [iv, gt].forEach((t) => t.unref && t.unref());
  function guardar() { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify({ w: { Wx: w.Wx, Wh: w.Wh, Wp: w.Wp, Wt: w.Wt, b: w.b, bp: w.bp, bt: w.bt }, s, st, jug, frec, base })); sucio = false; } catch (e) { /* ignorar */ } }
  bot.once('end', () => { clearInterval(iv); clearInterval(gt); guardar(); });

  const api = {
    evento: evento_, directo: evento, rasgo, aprenderEstilo, sesgos, dominante, guardar, resumen,
    vector: () => { decaer(); return s.map(c01); },
    snapshot: () => s.slice(),
    sesgoEstilo: () => logitsEstilo(),
    humanidad: (n) => (jug[n] ? jug[n].hum : 0),
    estado: () => Object.fromEntries(DIM.map((k, i) => [k, s[i]])),
    pred: () => ({ ...st }),
  };
  bot._psique = api;
  return api;
}
module.exports = { crearPsique, DIM, EVT, ESTILOS };
