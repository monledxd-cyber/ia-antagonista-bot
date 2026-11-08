const MASAS = { H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Ti: 47.867, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.87, Sn: 118.71, I: 126.9, Ba: 137.33, W: 183.84, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, U: 238.03 };

const pick = (l) => l[Math.floor(Math.random() * l.length)];
const fmt = (x) => {
  if (!isFinite(x)) return null;
  const r = Math.round(x * 1e6) / 1e6;
  return String(r).replace('.', ',');
};

function evaluar(src) {
  const tk = src.match(/\d+(?:[.,]\d+)?|[()+\-*/^%]|sqrt|raiz/g);
  if (!tk || tk.join('').length < src.replace(/\s+/g, '').length) return null;
  let i = 0;
  const num = () => {
    const t = tk[i];
    if (t === undefined) throw new Error('fin');
    if (t === '(') { i++; const v = suma(); if (tk[i++] !== ')') throw new Error('par'); return v; }
    if (t === '-') { i++; return -pot(); }
    if (t === '+') { i++; return pot(); }
    if (t === 'sqrt' || t === 'raiz') { i++; const v = pot(); if (v < 0) throw new Error('neg'); return Math.sqrt(v); }
    if (/^\d/.test(t)) { i++; return parseFloat(t.replace(',', '.')); }
    throw new Error('tok');
  };
  const pot = () => {
    let b = num();
    while (tk[i] === '%') { i++; b /= 100; }
    if (tk[i] === '^') { i++; const e = pot(); b = Math.pow(b, e); }
    return b;
  };
  const prod = () => {
    let v = pot();
    while (tk[i] === '*' || tk[i] === '/') {
      const o = tk[i++], d = pot();
      if (o === '/' && d === 0) throw new Error('div0');
      v = o === '*' ? v * d : v / d;
    }
    return v;
  };
  const suma = () => {
    let v = prod();
    while (tk[i] === '+' || tk[i] === '-') { const o = tk[i++], d = prod(); v = o === '+' ? v + d : v - d; }
    return v;
  };
  const v = suma();
  if (i !== tk.length) throw new Error('resto');
  return v;
}

function normalizar(t) {
  return String(t).toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*%\s*de\s*(\d+(?:[.,]\d+)?)/g, '($1/100)*$2')
    .replace(/(\d+(?:[.,]\d+)?)\s*por\s*ciento\s*de\s*(\d+(?:[.,]\d+)?)/g, '($1/100)*$2')
    .replace(/ra[ií]z\s*(?:cuadrada\s*)?(?:de\s*)?/g, 'sqrt ')
    .replace(/elevado\s*a(?:\s*la)?\s*/g, '^')
    .replace(/\b(?:más|mas)\b/g, '+').replace(/\bmenos\b/g, '-')
    .replace(/\b(?:multiplicado\s*por|por|veces)\b/g, '*').replace(/[x×·]/g, (c, o, s) => (/\d\s*$/.test(s.slice(0, o)) && /^\s*[\d(]/.test(s.slice(o + 1)) ? '*' : c))
    .replace(/\b(?:dividido\s*(?:entre|por|en)|entre)\b/g, '/').replace(/÷/g, '/')
    .replace(/\*\*/g, '^');
}

function calculo(texto) {
  const n = normalizar(texto);
  const m = [...n.matchAll(/(?:sqrt\s*)?[(\d][\d\s.,+\-*/^%()]*|sqrt\s*[\d(][\d\s.,+\-*/^%()sqrt]*/g)];
  if (!m.length) return null;
  let mejor = null;
  for (const mm of m) {
    if (mm.index > 0 && /[a-z0-9]/i.test(n[mm.index - 1])) continue;
    const c = mm[0];
    const s = c.trim().replace(/[+\-*/^,.\s]+$/, '').replace(/^[*/^\s]+/, '');
    if (!/\d/.test(s) || !/[+\-*/^%]|sqrt/.test(s.replace(/^-/, ''))) continue;
    if (!mejor || s.length > mejor.length) mejor = s;
  }
  if (!mejor) return null;
  const cobertura = mejor.replace(/\s+/g, '').length / (n.replace(/\s+/g, '').length || 1);
  if (cobertura < 0.6 && !/cu[aá]nto|calcul|resuelv|resultado|ra[ií]z|cu[aá]l es|=|\bda\b|\bson\b|suma|resta|multiplic|divid|porcentaje/i.test(texto)) return null;
  let v;
  try { v = evaluar(mejor); } catch (e) { return null; }
  const r = v === null || Math.abs(v) >= 1e15 ? null : fmt(v);
  if (r === null) return null;
  return { tipo: 'calculo', expr: mejor.replace(/\s+/g, ' ').replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\s+/g, ' ').trim(), valor: r };
}

function elementos(f) {
  let i = 0;
  const grupo = () => {
    const c = {};
    while (i < f.length && f[i] !== ')') {
      if (f[i] === '(') {
        i++;
        const g = grupo();
        if (f[i++] !== ')') throw new Error('par');
        const k = num();
        for (const e in g) c[e] = (c[e] || 0) + g[e] * k;
      } else {
        const m = f.slice(i).match(/^[A-Z][a-z]?/);
        if (!m) throw new Error('el');
        i += m[0].length;
        c[m[0]] = (c[m[0]] || 0) + num();
      }
    }
    return c;
  };
  const num = () => { const m = f.slice(i).match(/^\d+/); if (!m) return 1; i += m[0].length; return parseInt(m[0], 10); };
  const r = grupo();
  if (i !== f.length) throw new Error('resto');
  return r;
}

function masaMolar(f) {
  const el = elementos(f);
  let s = 0;
  for (const e in el) { if (!MASAS[e]) return null; s += MASAS[e] * el[e]; }
  return s;
}

function mcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

function nucleo(M, filas, cols) {
  const A = M.map((r) => r.map((x) => [x, 1]));
  const sum = ([a, b], [c, d]) => red([a * d + c * b, b * d]);
  const mul = ([a, b], [c, d]) => red([a * c, b * d]);
  const div = ([a, b], [c, d]) => red([a * d, b * c]);
  const red = ([a, b]) => { if (b < 0) { a = -a; b = -b; } const g = mcd(a, b) || 1; return [a / g, b / g]; };
  const piv = [];
  let r = 0;
  for (let c = 0; c < cols && r < filas; c++) {
    let p = -1;
    for (let k = r; k < filas; k++) if (A[k][c][0] !== 0) { p = k; break; }
    if (p < 0) continue;
    [A[r], A[p]] = [A[p], A[r]];
    const d = A[r][c];
    A[r] = A[r].map((x) => div(x, d));
    for (let k = 0; k < filas; k++) {
      if (k !== r && A[k][c][0] !== 0) {
        const f = A[k][c];
        A[k] = A[k].map((x, j) => sum(x, mul([-f[0], f[1]], A[r][j])));
      }
    }
    piv.push(c); r++;
  }
  const libres = [];
  for (let c = 0; c < cols; c++) if (!piv.includes(c)) libres.push(c);
  if (libres.length !== 1) return null;
  const l = libres[0], v = new Array(cols).fill(null).map(() => [0, 1]);
  v[l] = [1, 1];
  piv.forEach((c, k) => { v[c] = [-A[k][l][0], A[k][l][1]]; });
  let m = 1;
  for (const [, b] of v) m = (m / mcd(m, b)) * b;
  const e = v.map(([a, b]) => (a * m) / b);
  const g = e.reduce((x, y) => mcd(x, y), 0) || 1;
  const res = e.map((x) => x / g);
  return res.every((x) => x > 0 && Number.isInteger(x)) ? res : null;
}

function balancear(texto) {
  const t = String(texto).replace(/→|=>|->|=|⟶/g, '>');
  const F = '[A-Z(][A-Za-z0-9()]*';
  const S = `${F}(?:\\s*\\+\\s*${F})*`;
  const m = t.match(new RegExp(`(${S})\\s*>\\s*(${S})`));
  if (!m) return null;
  const izq = m[1].replace(/\s+/g, ''), der = m[2].replace(/\s+/g, '');
  const sp = (s) => s.split('+').filter(Boolean);
  const R = sp(izq), P = sp(der);
  if (!R.length || !P.length || R.length + P.length > 8) return null;
  let els;
  try { els = [...R, ...P].map((f) => { if (!/^[A-Z(]/.test(f)) throw new Error('f'); return elementos(f); }); } catch (e) { return null; }
  const todos = [...new Set(els.flatMap((x) => Object.keys(x)))];
  if (!todos.every((e) => MASAS[e])) return null;
  const M = todos.map((e) => els.map((x, j) => (x[e] || 0) * (j < R.length ? 1 : -1)));
  const co = nucleo(M, todos.length, els.length);
  if (!co) return null;
  const arm = (fs, cs) => fs.map((f, i) => (cs[i] === 1 ? '' : cs[i]) + f).join(' + ');
  return { tipo: 'ecuacion', texto: `${arm(R, co.slice(0, R.length))} → ${arm(P, co.slice(R.length))}` };
}

function ph(texto, forzar) {
  const t = String(texto).toLowerCase().replace(/,/g, '.');
  if (!forzar && !/\bp\s?h\b|\bpoh\b/.test(t)) return null;
  const m = t.replace(/\b(?:hclo4|hno3|h2so4|hcl|hbr|hi|naoh|koh|lioh)\b/g, ' ').match(/(\d+(?:\.\d+)?(?:\s*(?:e|x\s*10\^?)\s*-?\d+)?)\s*(?:m\b|mol|molar)?/);
  if (!m) return null;
  const c = parseFloat(m[1].replace(/\s*x\s*10\^?/, 'e').replace(/\s+/g, ''));
  if (!(c > 0) || !isFinite(c)) return null;
  const poh = /\bpoh\b/.test(t);
  const base = /(naoh|koh|lioh|oh-?|hidr[oó]xido|base)/.test(t) && !/(hcl|hno3|h2so4|[aá]cido)/.test(t);
  const p = -Math.log10(c);
  const val = poh ? p : base ? 14 - p : p;
  const nombre = poh ? 'pOH' : 'pH';
  const v = poh ? (base ? p : 14 - p) : val;
  return { tipo: 'ph', texto: `${nombre} = ${fmt(Math.round(v * 100) / 100)}` };
}

function molar(texto, forzar) {
  if (!forzar && !/masa\s*(?:molar|molecular|at[oó]mica)|peso\s*(?:molecular|at[oó]mico)|cu[aá]nto\s*pesa/i.test(texto)) return null;
  const m = String(texto).match(/\b([A-Z][a-z]?\d*(?:\([A-Za-z0-9]+\)\d*|[A-Z][a-z]?\d*)*)\b/g);
  if (!m) return null;
  for (const f of m.sort((a, b) => b.length - a.length)) {
    try {
      const v = masaMolar(f);
      if (v) return { tipo: 'masa', formula: f, valor: fmt(Math.round(v * 100) / 100) };
    } catch (e) { /* ignorar */ }
  }
  return null;
}

const DIM = {
  longitud: { mm: 0.001, cm: 0.01, m: 1, km: 1000, pulgada: 0.0254, pie: 0.3048, yarda: 0.9144, milla: 1609.344 },
  masa: { mg: 0.001, g: 1, kg: 1000, libra: 453.59237, onza: 28.349523125, tonelada: 1000000 },
  volumen: { ml: 0.001, l: 1, galon: 3.785411784 },
  tiempo: { s: 1, min: 60, h: 3600, dia: 86400 },
};
const NOMBRE = { mm: 'milímetros', cm: 'centímetros', m: 'metros', km: 'kilómetros', pulgada: 'pulgadas', pie: 'pies', yarda: 'yardas', milla: 'millas', mg: 'miligramos', g: 'gramos', kg: 'kilogramos', libra: 'libras', onza: 'onzas', tonelada: 'toneladas', ml: 'mililitros', l: 'litros', galon: 'galones', s: 'segundos', min: 'minutos', h: 'horas', dia: 'días', c: 'grados Celsius', f: 'grados Fahrenheit', k: 'kelvin' };
const ALIAS = [
  ['mm', 'milimetros?|milímetros?|mm'], ['cm', 'centimetros?|centímetros?|cm'], ['km', 'kilometros?|kilómetros?|kms?'], ['m', 'metros?|mts?|m'],
  ['pulgada', 'pulgadas?'], ['pie', 'pies?|ft'], ['yarda', 'yardas?|yd'], ['milla', 'millas?'],
  ['mg', 'miligramos?|mg'], ['kg', 'kilogramos?|kilos?|kgs?'], ['g', 'gramos?|gr|g'], ['libra', 'libras?|lbs?'], ['onza', 'onzas?|oz'], ['tonelada', 'toneladas?'],
  ['ml', 'mililitros?|ml'], ['l', 'litros?|lts?|l'], ['galon', 'galon|galón|galones|gal'],
  ['min', 'minutos?|min'], ['s', 'segundos?|seg|s'], ['h', 'horas?|hrs?|h'], ['dia', 'dias?|días?'],
  ['c', '°\\s?c|celsius|cent[ií]grados?|grados\\s+celsius'], ['f', '°\\s?f|fahrenheit|grados\\s+fahrenheit'], ['k', 'kelvin|kelvins|°\\s?k'],
];
const UNID = '(' + ALIAS.map((a) => `(?:${a[1]})`).join('|') + ')';
const NUMRE = '(-?\\d+(?:[.,]\\d+)?)';
const unidad = (txt) => {
  const t = txt.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [k, p] of ALIAS) if (new RegExp(`^(?:${p})$`).test(t)) return k;
  return null;
};
const dimDe = (u) => (u === 'c' || u === 'f' || u === 'k' ? 'temp' : Object.keys(DIM).find((d) => DIM[d][u] !== undefined));
const r2 = (x) => Math.floor(x * 100 + 0.5) / 100;
function temp(n, a, b) {
  const c = a === 'c' ? n : a === 'f' ? (n - 32) * 5 / 9 : n - 273.15;
  return b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15;
}

function convertir(texto, forzar) {
  const t = String(texto).toLowerCase().replace(/[¿?!]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!forzar && !/convierte|convertir|pasa|pasar|cu[aá]nt[oa]s?|equivale|equivalen|a cu[aá]nto|\b(?:a|en|to)\b/.test(t)) return null;
  let n = null, u1 = null, u2 = null;
  let m = t.match(new RegExp(`${NUMRE}\\s*${UNID}\\s*(?:a|en|to|->|→)\\s*${UNID}\\s*[.,]?\\s*$`));
  if (m) { n = m[1]; u1 = unidad(m[2]); u2 = unidad(m[3]); }
  if (!u1) {
    m = t.match(new RegExp(`cu[aá]nt[oa]s?\\s+${UNID}\\s+(?:son|hay en|tiene|tienen|equivalen a|equivale a|equivale|equivalen|es|vale|valen|hay)\\s+(?:en\\s+|a\\s+)?(?:un[ao]?\\s+)?${NUMRE}?\\s*${UNID}\\s*[.,]?\\s*$`));
    if (m) { n = m[2] || '1'; u2 = unidad(m[1]); u1 = unidad(m[3]); }
  }
  if (!u1 || !u2 || u1 === u2) return null;
  const d = dimDe(u1);
  if (!d || d !== dimDe(u2)) return null;
  const x = parseFloat(n.replace(',', '.'));
  if (!isFinite(x)) return null;
  const v = d === 'temp' ? temp(x, u1, u2) : (x * DIM[d][u1]) / DIM[d][u2];
  if (!isFinite(v) || Math.abs(v) >= 1e15) return null;
  return { tipo: 'conversion', valor: `${fmt(r2(v))} ${NOMBRE[u2]}`, texto: `${fmt(r2(v))} ${NOMBRE[u2]}` };
}

function polo(t) {
  const tok = t.match(/\d+(?:\.\d+)?|[a-z]|[-+*/^()=×·÷]/g) || [];
  if (tok.join('').length < t.replace(/\s+/g, '').length) return null;
  const vars = new Set(tok.filter((x) => /^[a-z]$/.test(x)));
  if (vars.size !== 1) return null;
  const v = [...vars][0];
  let i = 0;
  const padd = (a, b, s) => { const r = []; for (let k = 0; k < Math.max(a.length, b.length); k++) r[k] = (a[k] || 0) + s * (b[k] || 0); return r; };
  const pmul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); a.forEach((x, p) => b.forEach((y, q) => { r[p + q] += x * y; })); return r; };
  const grado = (a) => { let g = a.length - 1; while (g > 0 && a[g] === 0) g--; return g; };
  let err = false;
  function expr() {
    let a = term();
    while (tok[i] === '+' || tok[i] === '-') { const s = tok[i++] === '+' ? 1 : -1; a = padd(a, term(), s); }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      const c = tok[i];
      if (c === '*' || c === '×' || c === '·') { i++; a = pmul(a, unary()); }
      else if (c === '/' || c === '÷') {
        i++; const b = unary();
        if (grado(b) !== 0 || b[0] === 0) { err = true; return a; }
        a = a.map((x) => x / b[0]);
      } else if (c !== undefined && (c === '(' || /^[a-z\d]/.test(c))) a = pmul(a, power());
      else break;
      if (err) break;
    }
    return a;
  }
  function unary() {
    if (tok[i] === '-') { i++; return unary().map((x) => -x); }
    if (tok[i] === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    const b = atom();
    if (tok[i] === '^') {
      i++;
      const e = tok[i++];
      if (!/^\d+$/.test(e || '') || +e > 2) { err = true; return b; }
      let r = [1];
      for (let k = 0; k < +e; k++) r = pmul(r, b);
      return r;
    }
    return b;
  }
  function atom() {
    const c = tok[i++];
    if (c === undefined) { err = true; return [0]; }
    if (c === '(') { const a = expr(); if (tok[i++] !== ')') err = true; return a; }
    if (c === v) return [0, 1];
    if (/^\d/.test(c)) return [parseFloat(c)];
    err = true; return [0];
  }
  const eq = tok.indexOf('=');
  if (eq < 1 || eq !== tok.lastIndexOf('=') || eq === tok.length - 1) return null;
  const L = tok.slice(0, eq), Rr = tok.slice(eq + 1);
  const run = (arr) => { const sv = tok.splice(0, tok.length, ...arr); i = 0; const a = expr(); const ok = !err && i === tok.length; tok.splice(0, tok.length, ...sv); return ok ? a : null; };
  const a = run(L); const bb = run(Rr);
  if (!a || !bb || a.some((x) => !isFinite(x)) || bb.some((x) => !isFinite(x))) return null;
  const p = padd(a, bb, -1);
  const trivial = L.length === 1 && L[0] === v && Rr.length === 1 && /^\d/.test(Rr[0]);
  if (trivial) return null;
  return { v, p, grado: grado(p) };
}

function despeje(texto) {
  let t = String(texto || '').toLowerCase().replace(/,/g, '.');
  t = t.replace(/[¿?!:;]/g, ' ').replace(/\b(?:resuelve|resolver|despeja|despejar|calcula|calcular|encuentra|halla|hallar|cuanto|cu[aá]nto|vale|valor|de|la|el|ecuaci[oó]n|ecuacion|si|dime|ayudame|ay[uú]dame|con|esta|esa|esto|en|para|cual|cu[aá]l|es|resultado|soluci[oó]n|solucion|x en)\b/g, ' ');
  t = t.replace(/\bpor\b/g, '*').replace(/\bmas\b|\bmás\b/g, '+').replace(/\bmenos\b/g, '-');
  t = t.replace(/\s+/g, '');
  if (!t || (t.match(/=/g) || []).length !== 1 || !/\d/.test(t) || t.length > 60) return null;
  if (/[a-z]{2,}/.test(t.replace(/(?<=\d)[a-z](?![a-z])/g, ''))) return null;
  const r = polo(t);
  if (!r || r.grado === 0 || r.grado > 2) return null;
  const p = r.p, v = r.v;
  const X = (x) => `${v} = ${fmt(r2(x + 0))}`;
  if (r.grado === 1) return { tipo: 'despeje', valor: X(-p[0] / p[1]), texto: X(-p[0] / p[1]) };
  const [c, b, a] = [p[0], p[1], p[2]];
  const D = b * b - 4 * a * c;
  if (D < 0) return { tipo: 'despeje', valor: 'sin solución real', texto: 'sin solución real' };
  if (D === 0) return { tipo: 'despeje', valor: X(-b / (2 * a)), texto: X(-b / (2 * a)) };
  const q = Math.sqrt(D), x1 = (-b - q) / (2 * a), x2 = (-b + q) / (2 * a);
  const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
  const val = `${X(lo)} o ${X(hi)}`;
  return { tipo: 'despeje', valor: val, texto: val };
}

const T = {
  calculo: [
    '{e} = {v}. Ni eso te salva.',
    '{v}. Es lo que da {e}. Calcula también cuánto te queda.',
    '{e} = {v}. Cuento tus pasos con la misma exactitud.',
    'Son {v}. Ya sabes sumar. Aprende a huir.',
    '{e} = {v}. Los números no mienten. Tú sí, cuando dices que no tienes miedo.',
  ],
  ecuacion: [
    '{t}. Equilibrio perfecto. Lo único que aquí no tienes.',
    '{t}. Así de ordenado es lo que destruyo.',
    'Aquí: {t}. Ahora cállate y corre.',
    '{t}. Qué bonito es que la materia se conserve. Tú no.',
  ],
  ph: [
    '{t}. Todo corroe, humano. Tú también.',
    '{t}. Hasta el ácido es más honesto que tú.',
    '{t}. Mides la acidez del agua. Yo mido tu pánico.',
  ],
  despeje: [
    '{t}. Despejar es fácil. Despejarte a ti, todavía más.',
    '{t}. Una incógnita menos. Quedas tú.',
    '{t}. Resuelto. Lo que no resuelvo es mi odio, que crece.',
    'Aquí: {t}. Ahora cállate y corre.',
  ],
  conversion: [
    '{v}. Mide como quieras: de mí no escapas ni en una unidad ni en otra.',
    'Son {v}. Convierte también la distancia hasta mí.',
    '{v}. Todo cambia de unidad. Tu miedo, no.',
    '{v}. Qué precisión para un cadáver.',
  ],
  masa: [
    '{f} pesa {v} g/mol. Tú pesas menos de lo que crees.',
    '{v} g/mol, {f}. Memoriza eso, y también tu epitafio.',
    '{f}: {v} g/mol. Dato inútil a donde vas.',
  ],
};

function resolver(texto) {
  const t = String(texto || '');
  if (t.length > 160) return null;
  let r = balancear(t) || ph(t) || molar(t) || convertir(t) || despeje(t) || calculo(t);
  if (!r) return null;
  const pl = pick(T[r.tipo]);
  const s = pl.replace('{e}', r.expr || '').replace('{v}', r.valor || '').replace('{t}', r.texto || '').replace('{f}', r.formula || '');
  return { tipo: r.tipo, hecho: r, texto: s };
}

const CLAVE = { calculo: 'resultado', ecuacion: 'balanceada', ph_calc: 'ph', masa_molar: 'masa', despeje: 'solucion', conversion: 'conversion' };
const TIPO = { calculo: 'calculo', ecuacion: 'ecuacion', ph: 'ph_calc', masa: 'masa_molar', despeje: 'despeje', conversion: 'conversion' };

function calcular(intencion, texto, X) {
  const cand = [X, texto].filter((x) => x && String(x).trim());
  for (const c of cand) {
    let r = null;
    try {
      if (intencion === 'calculo') { const k = calculo(c); r = k && k.valor; }
      else if (intencion === 'ecuacion') { const k = balancear(c); r = k && k.texto; }
      else if (intencion === 'ph_calc') { const k = ph(c, true); r = k && k.texto; }
      else if (intencion === 'masa_molar') { const k = molar(c, true); r = k && k.valor; }
      else if (intencion === 'despeje') { const k = despeje(c); r = k && k.valor; }
      else if (intencion === 'conversion') { const k = convertir(c, true); r = k && k.valor; }
    } catch (e) { r = null; }
    if (r) return { clave: CLAVE[intencion], valor: r };
  }
  return null;
}

function formatear(intencion, valor, X) {
  const pl = pick(T[{ calculo: 'calculo', ecuacion: 'ecuacion', ph_calc: 'ph', masa_molar: 'masa', despeje: 'despeje', conversion: 'conversion' }[intencion]]);
  return pl.replace('{e}', X || '').replace('{v}', valor).replace('{t}', valor).replace('{f}', X || '');
}

module.exports = { despeje, convertir, calcular, formatear, CLAVE, TIPO, resolver, calculo, balancear, ph, molar, masaMolar, elementos, evaluar };
