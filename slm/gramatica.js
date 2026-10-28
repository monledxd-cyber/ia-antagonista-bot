const fs = require('fs');
const path = require('path');

const SD = path.join(__dirname, 'semilla');
const ESTILOS = ['frio', 'escala', 'repeticion', 'burla_fallo', 'pregunta', 'orden', 'susurro', 'promesa'];
const RIVAL = { hostil: 0, amenaza: 1, suplica: 2, burla: 3 };
const RIVAL_E = { hostil: 'frio', amenaza: 'susurro', suplica: 'frio', burla: 'burla_fallo' };
const PRIMERO = new Set(['escala', 'repeticion']);
const MAXLEN = 140;
const ENTERO = /entero|sano|sana|rasgu|daño se fue|veinte corazones|renueva|reconstruyo|reparaci/i;

let cache = null;
function semilla() {
  if (cache) return cache;
  cache = {};
  for (const f of fs.readdirSync(SD).filter((x) => x.endsWith('.json'))) {
    try { cache[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')); } catch (e) { /* ignorar */ }
  }
  return cache;
}

const seeded = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sinN = (t) => t.replace(/\{n\},\s*/g, '').replace(/,?\s*\{n\}/g, '').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const largo = (t) => t.replace(/\{n\}/g, 'Rival').length;

function unir(core, ctx, ctxPrimero) {
  let a = ctxPrimero ? ctx : core, b = ctxPrimero ? core : ctx;
  if (/\{n\}/.test(a) && /\{n\}/.test(b)) b = sinN(b);
  return a + ' ' + b;
}

const ctxDe = (ctx, tag, est) => (ctx[tag] ? (PRIMERO.has(est) ? ctx[tag].frio : ctx[tag][est]) || [] : []);

function etiqueta(tag) { return tag === 'bajo' ? { vb: 'v-', vida: 'bajo' } : { vb: tag, vida: 'ok' }; }

function filas(opc) {
  const cap = (opc && opc.cap) || 24, rnd = seeded((opc && opc.seed) || 7), S = semilla(), out = [];
  const add = (acc, est, rs, vb, vida, t, r) => out.push({ acc, est, rs, vb, vida, t, r });
  const ctx = S.contexto || {}, riv = S.rival || {};
  for (const [acc, d] of Object.entries(S)) {
    if (acc === 'contexto' || acc === 'rival') continue;
    for (const est of ESTILOS) for (const t of d[est] || []) add(acc, est, [0, 0, 0, 0], 'v0', 'ok', t, 0.5);
  }
  for (const [tr, fr] of Object.entries(riv)) { const rs = [0, 0, 0, 0]; rs[RIVAL[tr]] = 3; for (const t of fr) add('otra', RIVAL_E[tr], rs, 'v0', 'ok', t, 0.5); }
  for (const tag of Object.keys(ctx)) {
    const e = etiqueta(tag);
    for (const est of ESTILOS) for (const t of ctx[tag][est] || []) add('otra', est, [0, 0, 0, 0], e.vb, e.vida, t, 0.5);
  }
  for (const [acc, d] of Object.entries(S)) {
    if (acc === 'contexto' || acc === 'rival') continue;
    for (const est of ESTILOS) for (const tag of Object.keys(ctx)) {
      const cores = (d[est] || []).filter((t) => !(acc === 'curar' && tag === 'bajo' && ENTERO.test(t))), cs = ctxDe(ctx, tag, est);
      const pares = [];
      for (const c of cores) for (const x of cs) pares.push([c, x]);
      for (let i = pares.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pares[i], pares[j]] = [pares[j], pares[i]]; }
      const e = etiqueta(tag);
      let n = 0;
      for (const [c, x] of pares) {
        if (n >= cap) break;
        const t = unir(c, x, PRIMERO.has(est) || rnd() < 0.35);
        if (largo(t) > MAXLEN) continue;
        add(acc, est, [0, 0, 0, 0], e.vb, e.vida, t, 0.3);
        n++;
      }
    }
  }
  const vistos = new Set();
  return out.filter((x) => { const k = x.acc + x.est + x.vb + x.vida + x.rs.join('') + x.t.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function candidatos(info, n) {
  const S = semilla(), ctx = S.contexto || {}, out = [];
  const est0 = ESTILOS.includes(info.estilo) ? info.estilo : null;
  const rs = (info.rs || [0, 0, 0, 0]).map((v) => Math.min(3, Math.floor(Math.max(0, v) * 4)));
  const mx = Math.max(...rs), trait = mx >= 2 ? Object.keys(RIVAL).find((k) => rs[RIVAL[k]] === mx) : null;
  for (let i = 0; i < n; i++) {
    const est = est0 || pick(ESTILOS);
    let t, acc = info.acc;
    if (trait && info.acc === 'otra' && S.rival && S.rival[trait] && Math.random() < 0.7) t = pick(S.rival[trait]);
    else {
      const d = S[acc] || S.otra;
      if (!d || !d[est] || !d[est].length) continue;
      t = pick(d[est]);
      const tag = info.vida === 'bajo' ? 'bajo' : info.vb === 'v+' ? 'v+' : info.vb === 'v-' ? 'v-' : null;
      if (tag && ctxDe(ctx, tag, est).length && Math.random() < 0.7 && !(acc === 'curar' && tag === 'bajo' && ENTERO.test(t))) {
        const u = unir(t, pick(ctxDe(ctx, tag, est)), PRIMERO.has(est) || Math.random() < 0.35);
        if (largo(u) <= MAXLEN) t = u;
      }
    }
    out.push({ t, acc, est });
  }
  return out;
}

const prefijo = (x) => `${x.acc}|${x.est}|${x.rs.join('')}|${x.vb}|${x.vida}>`;

if (require.main === module) {
  const f = filas({ cap: Number(process.argv[2]) || 24 });
  fs.writeFileSync(path.join(__dirname, 'semilla_gen.jsonl'), f.map((x) => JSON.stringify({ p: prefijo(x), t: x.t, r: x.r })).join('\n') + '\n');
  const cnt = {};
  for (const x of f) { const k = `${x.vb}/${x.vida}`; cnt[k] = (cnt[k] || 0) + 1; }
  const largos = f.map((x) => largo(x.t));
  console.log(f.length, 'filas', JSON.stringify(cnt), 'largo medio', Math.round(largos.reduce((a, b) => a + b, 0) / largos.length), 'max', Math.max(...largos));
}
module.exports = { filas, candidatos, semilla, ESTILOS };
