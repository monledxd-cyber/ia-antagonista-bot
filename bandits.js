const fs = require('fs');

// Aprendizaje por refuerzo: bandits contextuales. Cada pelea elige un "perfil" (multiplicadores de cooldown y sesgos de
// temperamento) por jugador y tipo de arma rival; al terminar, la recompensa actualiza lo elegido. Persistente.
const MULT = [0.6, 1, 1.6];
const DECISIONES = ['cristal', 'smash', 'arco', 'trid', 'perla', 'empuje', 'terreno', 'reposicion', 'finta', 'cobertura'];
const SESGOS = [-0.25, 0, 0.25];
const RASGOS = ['agresion', 'cautela', 'astucia', 'paciencia'];

function crearBandits(ruta, diag) {
  let d = {}, sucio = false, perfil = null;
  try { d = JSON.parse(fs.readFileSync(ruta, 'utf8')) || {}; } catch (e) { d = {}; }
  const celda = (dec, ctx, k) => (((d[dec] = d[dec] || {})[ctx] = d[dec][ctx] || {})[k] = d[dec][ctx][k] || { n: 0, m: 0.2 });

  function valor(dec, ctx, k) {
    const a = celda(dec, ctx, k), g = celda(dec, '*', k);
    const w = a.n / (a.n + 3);
    return w * a.m + (1 - w) * g.m;
  }
  function elegir(dec, ctx, arms) {
    if (Math.random() < 0.12) return arms[Math.floor(Math.random() * arms.length)];
    const N = arms.reduce((s, x) => s + celda(dec, ctx, x.k).n, 0) + 1;
    let mejor = arms[0], mp = -1e9;
    for (const x of arms) {
      const a = celda(dec, ctx, x.k);
      const p = valor(dec, ctx, x.k) + 0.5 * Math.sqrt(Math.log(N + 1) / (a.n + 1)) + (Math.random() - 0.5) * 0.15;
      if (p > mp) { mp = p; mejor = x; }
    }
    return mejor;
  }
  function premiar(dec, ctx, k, r) {
    for (const c of [ctx, '*']) {
      const a = celda(dec, c, k);
      a.n++; a.m += (r - a.m) / Math.min(a.n, 40);
    }
    sucio = true;
  }

  const lec = () => (d._lec = d._lec || {});
  function lecRiesgo(clave) {
    const a = lec()[clave]; if (!a || a.g + a.p < 3) return null;
    const n = a.g + a.p; return { n, perd: a.p / n, gan: a.g / n };
  }
  function lecReg(clave, res) {
    if (res !== 'gane' && res !== 'perdi') return;
    for (const c of [clave, clave.split('|')[0]]) { const a = (lec()[c] = lec()[c] || { g: 0, p: 0 }); if (res === 'gane') a.g++; else a.p++; }
    sucio = true;
  }
  let extra = {};
  function perfilIniciar(ctx, clave, modelo) {
    extra = {};
    const r = clave && (lecRiesgo(clave) || lecRiesgo(clave.split('|')[0]));
    if (r && r.perd >= 0.6) { extra.cautela = 0.25; extra.agresion = -0.2; }
    else if (r && r.gan >= 0.8) extra.agresion = 0.15;
    if (modelo && modelo.huye >= 0.4) extra.agresion = (extra.agresion || 0) + 0.2;
    if (modelo && modelo.muertes >= 2) { extra.cautela = (extra.cautela || 0) + 0.15; extra.agresion = (extra.agresion || 0) - 0.1; }
    const p = { ctx, mult: {}, sesgo: {} };
    for (const dec of DECISIONES) p.mult[dec] = elegir('cd_' + dec, ctx, MULT.map((v) => ({ k: String(v), v }))).v;
    for (const r of RASGOS) p.sesgo[r] = elegir('rasgo_' + r, ctx, SESGOS.map((v) => ({ k: String(v), v }))).v;
    perfil = p;
    if (diag) diag.estado.perfilPelea = (Object.keys(extra).length ? '[lec ' + Object.entries(extra).map(([k, v]) => k + v).join(',') + '] ' : '') + ctx + ' ' + Object.entries(p.mult).map(([k, v]) => k + 'x' + v).join(' ');
    return p;
  }
  function perfilFin(res, dano, neto) {
    if (!perfil) return;
    const r0 = res === 'gane' ? 0.6 + 0.4 * (1 - Math.min(20, dano) / 20) : res === 'perdi' ? -1 : 0.1 - Math.min(20, dano) / 40;
    const r = typeof neto === 'number' ? 0.65 * r0 + 0.35 * Math.tanh(neto / 6) : r0;
    for (const dec of DECISIONES) premiar('cd_' + dec, perfil.ctx, String(perfil.mult[dec]), r);
    for (const k of RASGOS) premiar('rasgo_' + k, perfil.ctx, String(perfil.sesgo[k]), r);
    perfil = null; extra = {};
  }
  const mult = (dec) => (perfil && perfil.mult[dec]) || 1;
  const sesgo = (r) => (perfil ? (perfil.sesgo[r] || 0) + (extra[r] || 0) + ((api.nnExtra || {})[r] || 0) : 0);
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const resumen = () => { let n = 0; for (const [dk, dec] of Object.entries(d)) { if (dk === '_lec') continue; for (const c of Object.values(dec)) for (const a of Object.values(c)) n += a.n; } return n; };
  const api = { nnExtra: {}, elegir, premiar, perfilIniciar, perfilFin, descartar: () => { perfil = null; extra = {}; }, lecReg, lecRiesgo, lecciones: () => lec(), mult, sesgo, guardar, resumen, activo: () => !!perfil };
  module.exports.actual = api;
  return api;
}
module.exports = { crearBandits, actual: null };
