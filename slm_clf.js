const fs = require('fs');
const path = require('path');

function crearClasificador(dir) {
  let m = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'clf.json'), 'utf8'));
    const b = fs.readFileSync(path.join(dir, 'clf.bin'));
    m = { N: j.N, clases: j.clases, esc: j.esc, b: j.b, W: new Int8Array(b.buffer, b.byteOffset, b.length) };
  } catch (e) { m = null; }
  const h = (s) => {
    let x = 2166136261;
    for (const c of Buffer.from(s, 'utf8')) x = Math.imul(x ^ c, 16777619) >>> 0;
    return x % m.N;
  };
  function feats(t) {
    const ws = String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const c = new Map();
    const sum = (k) => c.set(k, (c.get(k) || 0) + 1);
    for (const w of ws) {
      const p = ' ' + w + ' ';
      for (let n = 2; n <= 5; n++) for (let i = 0; i + n <= p.length; i++) sum(h('c:' + p.slice(i, i + n)));
      sum(h('w:' + w));
    }
    for (let i = 0; i + 1 < ws.length; i++) sum(h('b:' + ws[i] + ' ' + ws[i + 1]));
    let nr = 0;
    for (const [k, n] of c) { const v = 1 + Math.log(n); c.set(k, v); nr += v * v; }
    nr = Math.sqrt(nr) || 1;
    for (const [k, v] of c) c.set(k, v / nr);
    return c;
  }
  function clasificar(texto) {
    if (!m) return null;
    const f = feats(texto), K = m.clases.length, z = new Array(K);
    for (let k = 0; k < K; k++) {
      let s = 0;
      const o = k * m.N;
      for (const [i, v] of f) s += v * m.W[o + i];
      z[k] = s * m.esc[k] + m.b[k];
    }
    const mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), t = e.reduce((a, b) => a + b, 0);
    let bi = 0;
    for (let k = 1; k < K; k++) if (e[k] > e[bi]) bi = k;
    return { p: m.clases[bi], conf: e[bi] / t };
  }
  return { clasificar, listo: () => !!m, clases: () => (m ? m.clases : []) };
}
module.exports = { crearClasificador };
