const fs = require('fs');
const diag = require('./diag');

const CANALES = ['supervivencia', 'humanidad', 'logro', 'dominio', 'curiosidad', 'sadismo', 'masoquismo', 'resentimiento', 'schadenfreude'];
const MAPA = {
  golpe: { dominio: 0.65, sadismo: 0.35 },
  gana: { dominio: 0.7, resentimiento: 0.3 },
  muere_jugador: { schadenfreude: 0.7, dominio: 0.3 },
  huye: { dominio: 0.5, sadismo: 0.25, resentimiento: 0.25 },
  kill_con_nuevo: { logro: 0.6, dominio: 0.4 },
  pierde: { humanidad: 0.55, dominio: 0.45 },
  dano: { supervivencia: 0.7, humanidad: 0.3 },
  muerte: { supervivencia: 0.6, humanidad: 0.4 },
  muerte_repetida: { supervivencia: 0.5, humanidad: 0.5 },
  perder_valioso: { humanidad: 0.5, logro: 0.5 },
  perder_equipo: { humanidad: 0.5, logro: 0.5 },
  craft_armadura: { logro: 1 }, craft_herramienta: { logro: 1 }, craft_arma: { logro: 1 }, equipar: { logro: 1 }, ganar_valioso: { logro: 1 },
  mineral: { logro: 1 }, mineral_perdido: { logro: 1 }, paso_ok: { logro: 1 }, paso_fallo: { logro: 1 }, sin_nada: { logro: 1 }, atasco: { logro: 1 },
  item_nuevo: { logro: 0.5, curiosidad: 0.5 },
  hambre: { supervivencia: 1 }, aire: { supervivencia: 1 },
  frase_efectiva: { dominio: 0.6, sadismo: 0.4 }, frase_fallida: { dominio: 1 },
  libre: { logro: 1 },
  golpe_pleno: { dominio: 1 }, golpe_critico: { dominio: 0.7, sadismo: 0.3 }, golpe_flojo: { dominio: 1 },
  netherite: { logro: 1 }, pocion_ok: { logro: 1 }, cosecha_wart: { logro: 1 }, pocion_golpe: { dominio: 0.7, sadismo: 0.3 }, pocion_fallo: { dominio: 1 },
};
const CAP = { sadismo: 10, schadenfreude: 8, dominio: 40, resentimiento: 12, logro: 60, curiosidad: 15 };
const MEDIA_VIDA = { sadismo: 480, masoquismo: 600, schadenfreude: 300 };

function crearAfecto(bot, memoria, ruta) {
  let d = { tot: {}, p: {} }, sucio = false;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  const est = { sadismo: 0, masoquismo: 0, schadenfreude: 0 }, acc = {};
  let tEst = Date.now(), tAcc = Date.now(), ultLog = 0;

  const dec = () => {
    const ahora = Date.now(), s = (ahora - tEst) / 1000; tEst = ahora;
    for (const k of Object.keys(est)) est[k] *= Math.pow(0.5, s / MEDIA_VIDA[k]);
    const sa = (ahora - tAcc) / 1000; tAcc = ahora;
    for (const k of Object.keys(acc)) acc[k] *= Math.pow(0.5, sa / 600);
  };
  const sube = (k, v) => { dec(); est[k] = Math.min(1, est[k] + v); };

  const jug = (n) => { if (!n) return null; return d.p[n] || (d.p[n] = { res: 0, des: 0, t: Date.now() }); };
  const nombre = (m) => { if (!m) return null; const n = String(m).split(' ')[0]; return bot.players && bot.players[n] ? n : null; };
  const odioDe = (n) => { try { return memoria && memoria.odio ? memoria.odio(n) : 0; } catch (e) { return 0; } };

  function pesos(regla, nj) {
    dec();
    const p = nj ? jug(nj) : null;
    const w = {};
    for (const c of CANALES) w[c] = 1;
    w.sadismo = 1 + 0.4 * est.sadismo;
    w.schadenfreude = 1 + 0.5 * est.schadenfreude;
    if (p) w.resentimiento = 1 + 0.6 * Math.min(1, (p.res + odioDe(nj)) / 25);
    for (const c of Object.keys(CAP)) if (c !== 'logro') w[c] *= 1 / (1 + (acc[c] || 0) / CAP[c]);
    w.dominio = Math.max(w.dominio, w.sadismo, w.schadenfreude, w.resentimiento);
    return w;
  }

  function pesar(regla, x, o) {
    if (process.env.IA_AFECTO === '0' || !x) return x;
    try {
      const m = MAPA[regla];
      if (!m) return x;
      const nj = nombre(o && o.motivo);
      const w = pesos(regla, nj);
      let r = 0;
      for (const [c, s] of Object.entries(m)) {
        r += s * w[c];
        d.tot[c] = (d.tot[c] || 0) + x * s; sucio = true;
        if (x > 0) acc[c] = (acc[c] || 0) + x * s;
      }
      if (x < 0 && regla === 'dano' && bot.health >= 8) r *= 1 - 0.25 * est.masoquismo;
      const lo = x < 0 ? (regla === 'muerte' || regla === 'muerte_repetida' ? 1 : 0.75) : 0.75, hi = x < 0 ? 1.25 : 1.5;
      r = Math.max(lo, Math.min(hi, r));
      evento(regla, x, nj);
      return x * r;
    } catch (e) { return x; }
  }

  function evento(regla, x, nj) {
    if (regla === 'golpe') sube('sadismo', 0.05);
    else if (regla === 'gana') sube('sadismo', 0.2);
    else if (regla === 'huye') sube('sadismo', 0.25);
    else if (regla === 'muere_jugador') sube('schadenfreude', 0.4);
    else if (regla === 'dano' && bot.health >= 8) sube('masoquismo', Math.min(0.15, -x * 0.05));
    else if (regla === 'muerte') { dec(); est.masoquismo *= 0.3; est.sadismo *= 0.5; }
    if (nj && (regla === 'pierde' || regla === 'muerte' || (regla === 'dano' && x < -0.5))) { const p = jug(nj); p.res = Math.min(40, p.res + (regla === 'dano' ? -x * 0.4 : 4)); p.t = Date.now(); sucio = true; }
    if (nj && regla === 'gana') { const p = jug(nj); p.res = Math.max(0, p.res - 2); sucio = true; }
  }

  const iv = setInterval(() => {
    try {
      const t = bot.pvp && bot.pvp.target;
      for (const n of Object.keys(d.p)) {
        const p = d.p[n], o = odioDe(n);
        p.res *= 0.9992;
        if (o > 12 && p.res > 6) p.des = Math.min(1, p.des + 0.004 * Math.min(2, o / 15) * (t && t.username === n ? 2 : 1));
        else p.des = Math.max(0, p.des - 0.0015);
        sucio = true;
      }
      dec();
      diag.estado.afecto = `sad ${est.sadismo.toFixed(2)} maso ${est.masoquismo.toFixed(2)} sch ${est.schadenfreude.toFixed(2)}`;
      if (Date.now() - ultLog > 300_000) { ultLog = Date.now(); console.log(`[afecto] ${diag.estado.afecto} | ${Object.entries(d.tot).map(([k, v]) => k.slice(0, 4) + ' ' + v.toFixed(0)).join(' ')}`); }
    } catch (e) { /* ignorar */ }
  }, 5000);
  const gt = setInterval(() => guardar(), 60_000);
  if (iv.unref) iv.unref();
  if (gt.unref) gt.unref();
  function guardar() { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } }
  bot.once('end', () => { clearInterval(iv); clearInterval(gt); guardar(); });

  const api = {
    pesar, guardar, estado: () => ({ ...est }), totales: () => ({ ...d.tot }),
    resentimiento: (n) => (d.p[n] ? d.p[n].res : 0),
    deshum: (n) => (d.p[n] ? d.p[n].des : 0),
    vector: (t) => {
      dec();
      const n = t && t.username, p = n && d.p[n];
      return [p ? Math.min(1, (p.res + odioDe(n)) / 40) : 0, p ? p.des : 0, Math.min(1, (est.sadismo + est.schadenfreude + est.masoquismo) / 2)];
    },
  };
  bot._afecto = api;
  return api;
}
module.exports = { crearAfecto, CANALES, MAPA };
