const fs = require('fs');
const path = require('path');
const diag = require('./diag');

const q = (x) => String(Math.min(3, Math.floor(Math.max(0, x) * 4)));
const prefijo = (acc, est, rs, vb, vida) => `${acc}|${est}|${(rs || [0, 0, 0, 0]).slice(0, 4).map(q).join('')}|${vb}|${vida}>`;

function crearSLM(dir) {
  const rm = path.join(dir, 'modelo.onnx'), rv = path.join(dir, 'vocab.json');
  let ort = null, sesion = null, vocab = null, idx = null, cargando = null, fallos = 0;
  const listo = () => !!sesion;
  async function cargar() {
    if (sesion || fallos >= 3 || process.env.IA_SLM === '0') return;
    if (!fs.existsSync(rm) || !fs.existsSync(rv)) return;
    if (cargando) return cargando;
    cargando = (async () => {
      try {
        ort = ort || require('onnxruntime-node');
        vocab = JSON.parse(fs.readFileSync(rv, 'utf8'));
        idx = new Map(vocab.chars.map((c, i) => [c, i]));
        sesion = await ort.InferenceSession.create(rm);
        diag.log('info', 'slm', `modelo cargado (${vocab.chars.length} simbolos, ctx ${vocab.ctx})`);
      } catch (e) { fallos++; diag.log('warn', 'slm', 'no se pudo cargar: ' + String(e.message).slice(0, 120)); }
      cargando = null;
    })();
    return cargando;
  }
  function muestra(lg, temp, k, prohibidos) {
    const top = [];
    for (let i = 0; i < lg.length; i++) { if (prohibidos.has(i)) continue; top.push([lg[i], i]); }
    top.sort((a, b) => b[0] - a[0]);
    const c = top.slice(0, k), mx = c[0][0], ps = c.map((x) => Math.exp((x[0] - mx) / temp)), s = ps.reduce((a, b) => a + b, 0);
    let r = Math.random() * s;
    for (let i = 0; i < c.length; i++) { r -= ps[i]; if (r <= 0) return c[i][1]; }
    return c[0][1];
  }
  async function generar(info, opc) {
    await cargar();
    if (!sesion) return null;
    opc = opc || {};
    const p = prefijo(info.acc, info.estilo, info.rs, info.vb, info.vida);
    const ids = [...p].map((c) => idx.get(c));
    if (ids.some((x) => x === undefined)) return null;
    const fin = idx.get(vocab.fin), pad = idx.get('\x00'), max = Math.min(opc.max || 130, vocab.ctx - ids.length - 1);
    const prohibidos = new Set([pad]);
    const salida = [];
    const t0 = Date.now();
    try {
      for (let i = 0; i < max; i++) {
        const t = new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]);
        const out = await sesion.run({ ids: t });
        const lg = out.logits.data, V = vocab.chars.length, off = (ids.length - 1) * V;
        const nx = muestra(lg.subarray(off, off + V), opc.temp || 0.8, opc.k || 12, i < 8 ? new Set([...prohibidos, fin]) : prohibidos);
        if (nx === fin) break;
        ids.push(nx); salida.push(vocab.chars[nx]);
        if (Date.now() - t0 > 8000) return null;
      }
    } catch (e) { fallos++; diag.log('warn', 'slm', 'generacion: ' + String(e.message).slice(0, 100)); return null; }
    return validar(salida.join(''), opc.evitar || []);
  }
  function validar(f, evitar) {
    f = f.replace(/\s+/g, ' ').trim();
    if (f.length < 12 || f.length > 140 || /https?:|\[|\]/.test(f)) return null;
    const w = f.toLowerCase().split(' ');
    if (new Set(w).size < Math.min(4, w.length)) return null;
    for (let i = 0; i + 6 < f.length; i++) if (f.indexOf(f.slice(i, i + 6), i + 6) > -1 && /^[a-z]{6}$/i.test(f.slice(i, i + 6))) return null;
    const ap = w.slice(0, 3).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '');
    if (evitar.includes(ap)) return null;
    return f;
  }
  cargar();
  return { generar, listo, prefijo };
}
module.exports = { crearSLM, prefijo };
