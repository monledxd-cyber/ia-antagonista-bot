const fs = require('fs');
const path = require('path');

const q = (x) => String(Math.min(3, Math.floor(Math.max(0, x) * 4)));
const PRE = / ?\p{L}+| ?\p{Nd}+| ?[^\p{L}\p{N}_\s]|\s+/gu;

function crearChat(dir) {
  const rm = path.join(dir, 'modelo.onnx'), rv = path.join(dir, 'vocab.json');
  let sesion = null, kvm = null, kvIds = [], kvK = null, kvV = null, cola = Promise.resolve(), vocab = null, idx = null, rank = null, base = null, cache = new Map(), cargando = null, fallos = 0;
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
        const opc = { intraOpNumThreads: 1, interOpNumThreads: 1, enableCpuMemArena: false, enableMemPattern: false }, r8 = path.join(dir, 'modelo_q8.onnx');
        const kvj = path.join(dir, 'kv.json');
        if (process.env.IA_KV !== '0' && fs.existsSync(kvj)) {
          try {
            kvm = JSON.parse(fs.readFileSync(kvj, 'utf8'));
            const k8 = path.join(dir, 'modelo_kv_q8.onnx'), k32 = path.join(dir, 'modelo_kv.onnx');
            if (process.env.IA_Q8 !== '0' && fs.existsSync(k8)) { try { sesion = await ort.InferenceSession.create(k8, opc); } catch (e) { sesion = null; } }
            if (!sesion && fs.existsSync(k32)) sesion = await ort.InferenceSession.create(k32, opc);
            if (!sesion) kvm = null;
          } catch (e) { sesion = null; kvm = null; console.log('[chat] kv no cargo:', String(e.message).slice(0, 100)); }
        }
        if (!sesion && process.env.IA_Q8 !== '0' && fs.existsSync(r8)) { try { sesion = await ort.InferenceSession.create(r8, opc); } catch (e) { sesion = null; console.log('[chat] q8 no cargo, uso fp32:', String(e.message).slice(0, 100)); } }
        if (!sesion) { kvm = null; sesion = await ort.InferenceSession.create(rm, opc); }
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
  const prohibidos = () => new Set(vocab.tokens.map((t, i) => (/^<(U|A|L|S|E:[^>]*|R\d:\d|pad)>$/.test(t) ? i : -1)).filter((i) => i >= 0));
  async function pasoCompleto(ids) {
    const t = new sesion._ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]);
    const out = await sesion.run({ ids: t });
    const V = vocab.tokens.length, off = (ids.length - 1) * V;
    return out.logits.data.subarray(off, off + V);
  }
  async function pasoKV(ids) {
    const { L, H, dh } = kvm, Tn = sesion._ort.Tensor, V = vocab.tokens.length;
    let c = 0;
    const m = Math.min(kvIds.length, ids.length);
    while (c < m && kvIds[c] === ids[c]) c++;
    if (c === ids.length) c--;
    if (c < kvIds.length) {
      const P = kvIds.length;
      if (c <= 0) { c = 0; kvK = new Float32Array(0); kvV = new Float32Array(0); } else {
        const nk = new Float32Array(L * H * c * dh), nv = new Float32Array(L * H * c * dh);
        for (let r = 0; r < L * H; r++) { nk.set(kvK.subarray(r * P * dh, r * P * dh + c * dh), r * c * dh); nv.set(kvV.subarray(r * P * dh, r * P * dh + c * dh), r * c * dh); }
        kvK = nk; kvV = nv;
      }
      kvIds = kvIds.slice(0, c);
    }
    if (!kvK) { kvK = new Float32Array(0); kvV = new Float32Array(0); }
    const nuevo = ids.slice(c);
    let out;
    try {
      out = await sesion.run({ ids: new Tn('int64', BigInt64Array.from(nuevo.map((x) => BigInt(x))), [1, nuevo.length]), pk: new Tn('float32', kvK, [L, H, c, dh]), pv: new Tn('float32', kvV, [L, H, c, dh]) });
    } catch (e) { kvIds = []; kvK = null; kvV = null; throw e; }
    kvK = Float32Array.from(out.nk.data); kvV = Float32Array.from(out.nv.data); kvIds = ids.slice();
    const off = (nuevo.length - 1) * V;
    return Float32Array.from(out.logits.data.subarray(off, off + V));
  }
  function paso(ids) {
    if (!kvm) return pasoCompleto(ids);
    const p = cola.then(() => pasoKV(ids));
    cola = p.catch(() => {});
    return p;
  }
  const clf = require('./slm_clf').crearClasificador(dir);
  let ordenadas = null;
  function armar(txt, ids) {
    txt = txt.replace(/\s+/g, ' ').trim();
    if (!ordenadas) ordenadas = clf.clases().slice().sort((x, y) => y.length - x.length);
    let intencion = null, resto = '';
    for (const c of ordenadas) {
      const p = c.replace(/_/g, ' ');
      if (txt === p || txt.startsWith(p + ' ')) { intencion = c; resto = txt.slice(p.length).trim(); break; }
    }
    const slots = {};
    if (intencion) {
      for (const mm of resto.matchAll(/([A-Z]\d?):\s*(.+?)(?=\s+[A-Z]\d?:\s|$)/g)) slots[mm[1]] = mm[2].trim();
    } else {
      const partes = txt.split('|').map((x) => x.trim());
      intencion = partes[0].replace(/\s+/g, '_');
      for (const p of partes.slice(1)) { const mm = p.match(/^(\w+):\s*(.+)$/); if (mm) slots[mm[1]] = mm[2].trim(); }
    }
    return { txt, intencion, slots, ids };
  }
  async function avanzar(ids) {
    const s = idx.get('<S>'), pr = prohibidos();
    pr.delete(s);
    pr.add(idx.get(vocab.fin));
    const sal = [];
    for (let i = 0; i < 40; i++) {
      const lg = await paso(ids);
      let mx = -1e9, nx = 0;
      for (let j = 0; j < lg.length; j++) if (!pr.has(j) && lg[j] > mx) { mx = lg[j]; nx = j; }
      ids.push(nx);
      if (nx === s) break;
      sal.push(vocab.tokens[nx]);
    }
    return { txt: sal.join(''), ids };
  }
  const resumen = (l) => (l ? [l.intencion, ...Object.entries(l.slots || {}).map(([k, v]) => `${k}: ${v}`)].join(' | ') : '');
  async function leer(texto, prev) {
    await cargar();
    if (!sesion) return null;
    const pre = prev && idx.has('<P>') ? [idx.get('<P>'), ...codificar(String(prev)).slice(0, 24)] : [];
    const cab = [...pre, idx.get('<U>'), ...codificar(String(texto).slice(0, 200)).slice(0, 40), idx.get('<L>')];
    const r1 = await avanzar(cab.slice());
    let lec = armar(r1.txt, r1.ids);
    const pc = process.env.IA_CLF === '0' ? null : clf.clasificar(texto);
    if (pc) {
      lec.clf = pc;
      if (lec.intencion !== pc.p) {
        if (pc.conf >= 0.5) {
          const pf = pc.p.replace(/_/g, ' '), r2 = await avanzar([...cab, ...codificar(pf)]);
          const l2 = armar(pf + ' ' + r2.txt, r2.ids);
          l2.clf = pc; l2.cambiada = lec.intencion; lec = l2;
        } else { lec.dudoso = true; if (pc.conf < Number(process.env.IA_FUERA || 0.45)) lec.fuera = true; }
      }
    }
    return lec;
  }
  let permitidas = null;
  const palabras = (t) => String(t).toLowerCase().match(/\p{L}+/gu) || [];
  function cargarPermitidas() {
    try { permitidas = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'palabras.json'), 'utf8'))); } catch (e) { permitidas = null; }
  }
  const calidad = (f) => {
    const w = palabras(f);
    if (f.length > 260 || w.length > 45) return false;
    for (let i = 3; i < w.length; i++) if (w[i] === w[i - 1] && w[i] === w[i - 2] && w[i] === w[i - 3]) return false;
    const bg = new Map();
    for (let i = 1; i < w.length; i++) { const b = w[i - 1] + ' ' + w[i]; bg.set(b, (bg.get(b) || 0) + 1); }
    if ([...bg.values()].some((v) => v >= 3 && w.length > 6)) return false;
    return !(w.length >= 8 && new Set(w).size / w.length < 0.4);
  };
  const sinAc = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const conTermino = (x, f) => {
    const ws = palabras(sinAc(x)).filter((w) => w.length >= 4), g = sinAc(f);
    return !ws.length || ws.some((w) => g.includes(w.slice(0, 5)));
  };
  const valida = (f, extra, hv) => {
    if (!calidad(f)) return false;
    const nums = f.match(/\d+/g) || [];
    if (nums.length) {
      const ok = new Set((String(extra) + ' ' + Object.values(hv || {}).join(' ')).match(/\d+/g) || []);
      if (!nums.every((n) => ok.has(n))) return false;
    }
    if (!permitidas) return true;
    const ent = new Set(palabras(extra));
    return palabras(f).every((w) => permitidas.has(w) || ent.has(w) || w === 'n');
  };
  async function responder(texto, info) {
    await cargar();
    if (!sesion) return null;
    if (!permitidas) cargarPermitidas();
    info = info || {};
    const lec = info.lectura || (await leer(texto));
    if (!lec) return null;
    const g = (k, d) => (idx.has(k) ? idx.get(k) : idx.get(d));
    const rs = (info.rs || [0, 0, 0, 0]).slice(0, 4).map(q);
    const ids = lec.ids.slice();
    const claves = (vocab.hechos && vocab.hechos[lec.intencion]) || [];
    const hv = info.hechos || {};
    if (claves.length && claves.every((k) => hv[k] !== undefined)) ids.push(idx.get('<F>'), ...codificar(claves.map((k) => `${k}: ${hv[k]}`).join(' | ')).slice(0, 24));
    const mem = Object.entries(info.memoria || {}).filter(([k, v]) => ['teme', 'tiene', 'refugio', 'nombre'].includes(k) && v).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, 2);
    if (mem.length) ids.push(idx.get('<M>'), ...codificar(mem.map(([k, v]) => `${k}: ${v}`).join(' | ')).slice(0, 24));
    ids.push(...[g(`<E:${info.estilo}>`, '<E:libre>'), ...rs.map((d, i) => idx.get(`<R${i}:${d}>`)), idx.get('<A>')]);
    const fin = idx.get(vocab.fin), pr = prohibidos();
    const sal = [];
    const temp = info.temp || Number(process.env.SLM_TEMP) || 0.6, k = info.k || 8;
    const t0 = Date.now();
    try {
      for (let i = 0; i < Math.min(100, vocab.ctx - ids.length - 1); i++) {
        const lg = await paso(ids);
        const nx = muestra(lg, temp, k, i < 3 ? new Set([...pr, fin]) : pr);
        if (nx === fin) break;
        ids.push(nx); sal.push(vocab.tokens[nx]);
        if (Date.now() - t0 > 15000) break;
      }
    } catch (e) { fallos++; console.log('[chat] error:', String(e.message).slice(0, 100)); return null; }
    let f = sal.join('').replace(/\s+/g, ' ').trim();
    const nom = info.nombre;
    f = nom ? f.replace(/\{n\}/g, nom) : f.replace(/\{n\},\s*/g, '').replace(/,?\s*\{n\}/g, '').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
    if (lec.intencion === 'definicion' && lec.slots.X && !conTermino([lec.slots.X, lec.slots.X2 || ''].join(' '), f)) return null;
    if (f.length < 4 || /[{}]/.test(f) || !valida(f, texto + ' ' + (nom || '') + ' ' + Object.values(lec.slots).join(' ') + ' ' + mem.map((x) => x[1]).join(' '), Object.fromEntries(claves.filter((k) => hv[k] !== undefined).map((k) => [k, hv[k]])))) return null;
    return f;
  }
  cargar();
  return { _paso: paso, responder, leer, resumen, calidad, conTermino, listo: () => !!sesion, cargar, _cod: (t) => codificar(t) };
}
const _compartidos = new Map();
function compartido(dir) {
  if (!_compartidos.has(dir)) _compartidos.set(dir, crearChat(dir));
  return _compartidos.get(dir);
}
module.exports = { crearChat, compartido };
