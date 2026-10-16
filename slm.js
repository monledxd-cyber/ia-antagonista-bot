const fs = require('fs');
const path = require('path');
const diag = require('./diag');

const q = (x) => String(Math.min(3, Math.floor(Math.max(0, x) * 4)));
const prefijo = (acc, est, rs, vb, vida) => `${acc}|${est}|${(rs || [0, 0, 0, 0]).slice(0, 4).map(q).join('')}|${vb}|${vida}>`;

function crearSLM(dir) {
  const rm = path.join(dir, 'modelo.onnx'), rv = path.join(dir, 'vocab.json');
  let ort = null, sesion = null, vocab = null, idx = null, cargando = null, fallos = 0;
  let filas = null;
  const usadas = [];
  function corpus() {
    if (filas) return filas;
    filas = [];
    try {
      for (const l of fs.readFileSync(path.join(dir, 'dataset.jsonl'), 'utf8').split('\n')) {
        if (!l.trim()) continue;
        const x = JSON.parse(l), a = String(x.p).replace('>', '').split('|');
        filas.push({ t: x.t, acc: a[0], est: a[1], rs: (a[2] || '0000').split('').map(Number), r: x.r || 0 });
      }
    } catch (e) {}
    return filas;
  }
  function recuperar(info, evitar) {
    const c = corpus();
    if (!c.length) return null;
    const rs = (info.rs || [0, 0, 0, 0]).slice(0, 4).map((v) => Math.min(3, Math.floor(Math.max(0, v) * 4)));
    const pt = [];
    for (const x of c) {
      if (usadas.includes(x.t)) continue;
      const v = validar(x.t, evitar, true);
      if (v.motivo) continue;
      let sc = (x.acc === info.acc ? 3 : 0) + (x.est === info.estilo ? 3 : 0) + (x.est === 'libre' ? 0.5 : 0);
      for (let i = 0; i < 4; i++) sc -= Math.abs((x.rs[i] || 0) - rs[i]) * 0.4;
      pt.push([sc + x.r + Math.random() * 0.8, x.t]);
    }
    if (!pt.length) return null;
    pt.sort((a, b) => b[0] - a[0]);
    const top = pt.filter((x) => x[0] >= pt[0][0] - 1.5).slice(0, 8), f = top[Math.floor(Math.random() * top.length)][1];
    usadas.push(f);
    if (usadas.length > 60) usadas.shift();
    return f;
  }
  const listo = () => !!sesion || corpus().length > 0;
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
  let ultLog = 0, motivo = '', conocidas = null;
  const rechazo = (m, crudo) => { motivo = m; if (Date.now() - ultLog > 10_000) { ultLog = Date.now(); console.log(`[slm] sin frase (${m})${crudo ? ': ' + String(crudo).slice(0, 70) : ''}`); } return null; };
  async function generar(info, opc) {
    await cargar();
    opc = opc || {};
    if (!sesion) return recuperar(info, opc.evitar || []) || rechazo('modelo no cargado');
    const r = await generarModelo(info, opc);
    return r || recuperar(info, opc.evitar || []);
  }
  async function generarModelo(info, opc) {
    const acc = vocab.acc && !vocab.acc.includes(info.acc) ? (vocab.acc.includes('otra') ? 'otra' : vocab.acc[0]) : info.acc;
    const est = vocab.est && !vocab.est.includes(info.estilo) ? (vocab.est.includes('libre') ? 'libre' : vocab.est[0]) : info.estilo;
    const p = prefijo(acc, est, est === 'libre' ? [0, 0, 0, 0] : info.rs, info.vb, info.vida);
    const ids = [...p].map((c) => idx.get(c));
    if (ids.some((x) => x === undefined)) return rechazo('prefijo con simbolos fuera del vocabulario ' + p);
    const fin = idx.get(vocab.fin), pad = idx.get('\x00'), max = Math.min(opc.max || 110, vocab.ctx - ids.length - 1);
    const prohibidos = new Set([pad]);
    const salida = [];
    const t0 = Date.now(), limite = opc.limite || 20000;
    try {
      for (let i = 0; i < max; i++) {
        const t = new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]);
        const out = await sesion.run({ ids: t });
        const lg = out.logits.data, V = vocab.chars.length, off = (ids.length - 1) * V;
        const nx = muestra(lg.subarray(off, off + V), opc.temp || 0.8, opc.k || 12, i < 8 ? new Set([...prohibidos, fin]) : prohibidos);
        if (nx === fin) break;
        ids.push(nx); salida.push(vocab.chars[nx]);
        if (Date.now() - t0 > limite) return rechazo(`tardo mas de ${limite} ms (${i + 1} letras)`, salida.join(''));
      }
    } catch (e) { fallos++; diag.log('warn', 'slm', 'generacion: ' + String(e.message).slice(0, 100)); return rechazo('error ' + String(e.message).slice(0, 80)); }
    const crudo = salida.join('');
    const m = validar(crudo, opc.evitar || []);
    if (m.motivo) return rechazo(m.motivo, crudo);
    return m.f;
  }
  function validar(f, evitar, sinVocab) {
    f = f.replace(/\s+/g, ' ').trim();
    if (f.length < 12) return { motivo: 'muy corta' };
    if (f.length > 140) return { motivo: 'muy larga' };
    if (/https?:|\[|\]/.test(f)) return { motivo: 'trae enlaces o corchetes' };
    const w = f.toLowerCase().split(' ');
    if (new Set(w).size < Math.min(4, w.length)) return { motivo: 'palabras repetidas' };
    const ap = w.slice(0, 3).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '');
    if (evitar.includes(ap)) return { motivo: 'apertura prohibida' };
    if (!sinVocab && vocab && vocab.palabras && vocab.palabras.length) {
      if (!conocidas) conocidas = new Set(vocab.palabras);
      const ws = f.toLowerCase().match(/[^\W\d_]+/g) || [];
      const ok = ws.filter((x) => conocidas.has(x)).length;
      if (!ws.length || ok / ws.length < 0.7) return { motivo: `texto sin sentido (${ok}/${ws.length} palabras conocidas)` };
    }
    return { f };
  }
  cargar();
  return { generar, listo, prefijo, motivo: () => motivo };
}
module.exports = { crearSLM, prefijo };
