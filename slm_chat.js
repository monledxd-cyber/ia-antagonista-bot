const fs = require('fs');
const path = require('path');

const q = (x) => String(Math.min(3, Math.floor(Math.max(0, x) * 4)));
const PRE = / ?\p{L}+| ?\p{Nd}+| ?[^\p{L}\p{N}_\s]|\s+/gu;

function crearChat(dir) {
  const rm = path.join(dir, 'modelo.onnx'), rv = path.join(dir, 'vocab.json');
  let sesion = null, vocab = null, idx = null, rank = null, base = null, cache = new Map(), cargando = null, fallos = 0;
  const cargar = () => {
    if (sesion || fallos >= 3 || !fs.existsSync(rm) || !fs.existsSync(rv)) return Promise.resolve();
    if (cargando) return cargando;
    cargando = (async () => {
      try {
        const ort = require('onnxruntime-node');
        vocab = JSON.parse(fs.readFileSync(rv, 'utf8'));
        idx = new Map(vocab.tokens.map((t, i) => [t, i]));
        rank = new Map(vocab.merges.map((m, i) => [m[0] + '\u0001' + m[1], i]));
        base = new Set(vocab.base);
        sesion = await ort.InferenceSession.create(rm);
        sesion._ort = ort;
      } catch (e) { fallos++; console.log('[chat] no se pudo cargar:', String(e.message).slice(0, 120)); }
      cargando = null;
    })();
    return cargando;
  };
  function palabra(w) {
    let r = cache.get(w);
    if (r) return r;
    let s = [...w].map((c) => (base.has(c) ? c : ' '));
    while (s.length > 1) {
      let mejor = null, bi = -1;
      for (let i = 0; i < s.length - 1; i++) {
        const k = rank.get(s[i] + '\u0001' + s[i + 1]);
        if (k !== undefined && (mejor === null || k < mejor)) { mejor = k; bi = i; }
      }
      if (mejor === null) break;
      s.splice(bi, 2, s[bi] + s[bi + 1]);
    }
    cache.set(w, s);
    return s;
  }
  const codificar = (t) => {
    const out = [];
    for (const w of (String(t).match(PRE) || [])) for (const p of palabra(w)) if (idx.has(p)) out.push(idx.get(p));
    return out;
  };
  function muestra(lg, temp, k, prohibidos) {
    const top = [];
    for (let i = 0; i < lg.length; i++) if (!prohibidos.has(i)) top.push([lg[i], i]);
    top.sort((a, b) => b[0] - a[0]);
    const c = top.slice(0, k), mx = c[0][0], ps = c.map((x) => Math.exp((x[0] - mx) / temp)), s = ps.reduce((a, b) => a + b, 0);
    let r = Math.random() * s;
    for (let i = 0; i < c.length; i++) { r -= ps[i]; if (r <= 0) return c[i][1]; }
    return c[0][1];
  }
  let permitidas = null;
  const palabras = (t) => String(t).toLowerCase().match(/\p{L}+/gu) || [];
  function cargarPermitidas() {
    permitidas = new Set();
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, '..', 'dialogo_base.json'), 'utf8'));
      for (const c of Object.values(b.C)) for (const r of c.r) for (const w of palabras(r.split('|').slice(1).join('|'))) permitidas.add(w);
      for (const l of fs.readFileSync(path.join(dir, '..', 'semilla', 'otra.json'), 'utf8').split('\n')) for (const w of palabras(l)) permitidas.add(w);
      for (const f of ['psique.json', 'rival.json']) for (const w of palabras(fs.readFileSync(path.join(dir, '..', 'semilla', f), 'utf8'))) permitidas.add(w);
    } catch (e) { permitidas = null; }
  }
  const valida = (f, texto) => {
    if (!permitidas) return true;
    const ent = new Set(palabras(texto));
    return palabras(f).every((w) => permitidas.has(w) || ent.has(w) || w === 'n');
  };
  async function responder(texto, info) {
    await cargar();
    if (!permitidas) cargarPermitidas();
    if (!sesion) return null;
    info = info || {};
    const g = (k, d) => (idx.has(k) ? idx.get(k) : idx.get(d));
    const rs = (info.rs || [0, 0, 0, 0]).slice(0, 4).map(q);
    const ids = [idx.get('<U>'), ...codificar(String(texto).slice(0, 200)).slice(0, 40), g(`<E:${info.estilo}>`, '<E:libre>'), ...rs.map((d, i) => idx.get(`<R${i}:${d}>`)), idx.get('<A>')];
    const n0 = ids.length, fin = idx.get(vocab.fin), nEsp = vocab.tokens.findIndex((t) => !/^<.*>$/.test(t) || t.length === 1);
    const prohibidos = new Set(vocab.tokens.map((t, i) => (/^<(U|A|E:[^>]*|R\d:\d|pad)>$/.test(t) ? i : -1)).filter((i) => i >= 0));
    const sal = [];
    const temp = info.temp || Number(process.env.SLM_TEMP) || 0.65, k = info.k || 10;
    const t0 = Date.now();
    try {
      for (let i = 0; i < Math.min(70, vocab.ctx - n0 - 1); i++) {
        const t = new sesion._ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]);
        const out = await sesion.run({ ids: t });
        const V = vocab.tokens.length, off = (ids.length - 1) * V;
        const nx = muestra(out.logits.data.subarray(off, off + V), temp, k, i < 3 ? new Set([...prohibidos, fin]) : prohibidos);
        if (nx === fin) break;
        ids.push(nx); sal.push(vocab.tokens[nx]);
        if (Date.now() - t0 > 15000) break;
      }
    } catch (e) { fallos++; console.log('[chat] error:', String(e.message).slice(0, 100)); return null; }
    let f = sal.join('').replace(/\s+/g, ' ').trim();
    const nom = info.nombre;
    f = nom ? f.replace(/\{n\}/g, nom) : f.replace(/\{n\},\s*/g, '').replace(/,?\s*\{n\}/g, '').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
    if (f.length < 4 || /[{}]/.test(f) || !valida(f, texto + ' ' + (nom || ''))) return null;
    return f;
  }
  cargar();
  return { responder, listo: () => !!sesion, cargar };
}
module.exports = { crearChat };
