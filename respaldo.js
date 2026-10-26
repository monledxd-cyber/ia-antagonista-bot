const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, process.env.IA_RESPALDOS || 'respaldos');
const RECIENTES = 6, DIAS = 7, CADA = 30 * 60_000;
let rutas = [], iv = null;
const huellas = new Map();

const valido = (f) => { try { const c = fs.readFileSync(f, 'utf8'); if (!c || !c.trim()) return false; JSON.parse(c); return true; } catch (e) { return false; } };
const hash = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const nombre = (r) => path.basename(r, '.json');
const lista = (r) => {
  try { return fs.readdirSync(DIR).filter((x) => x.startsWith(nombre(r) + '.') && x.endsWith('.json')).map((x) => ({ x, m: x.slice(nombre(r).length + 1, -5) })).filter((e) => /^\d{8}T\d{6}$/.test(e.m)).sort((a, b) => (a.m < b.m ? 1 : -1)); } catch (e) { return []; }
};
const sello = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

function podar(r) {
  const l = lista(r), dias = new Set(), borrar = [];
  l.forEach((e, i) => {
    if (i < RECIENTES) return;
    const d = e.m.slice(0, 8);
    if (dias.size < DIAS && !dias.has(d)) { dias.add(d); return; }
    borrar.push(e.x);
  });
  for (const x of borrar) { try { fs.unlinkSync(path.join(DIR, x)); } catch (e) { /* ignorar */ } }
}

function rotar() {
  let n = 0;
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { return 0; }
  for (const r of rutas) {
    try {
      if (!fs.existsSync(r) || !valido(r)) continue;
      const h = hash(r);
      if (huellas.get(r) === h) continue;
      const l = lista(r);
      if (!huellas.has(r) && l.length) { try { if (hash(path.join(DIR, l[0].x)) === h) { huellas.set(r, h); continue; } } catch (e) { /* ignorar */ } }
      fs.copyFileSync(r, path.join(DIR, nombre(r) + '.' + sello() + '.json'));
      huellas.set(r, h);
      podar(r);
      n++;
    } catch (e) { /* ignorar */ }
  }
  return n;
}

function restaurar() {
  let n = 0;
  for (const r of rutas) {
    if (valido(r)) continue;
    const b = lista(r).find((e) => valido(path.join(DIR, e.x)));
    if (!b) continue;
    try {
      const existia = fs.existsSync(r);
      if (existia) fs.copyFileSync(r, r + '.corrupto');
      fs.copyFileSync(path.join(DIR, b.x), r);
      console.log(`[respaldo] ${path.basename(r)} ${existia ? 'corrupto' : 'faltaba'}: restaurado de ${b.m}`);
      n++;
    } catch (e) { /* ignorar */ }
  }
  return n;
}

function iniciar(lst) {
  if (process.env.IA_RESPALDO === '0') return;
  rutas = lst;
  restaurar();
  const n = rotar();
  if (n) console.log(`[respaldo] ${n} archivos respaldados`);
  if (!iv) { iv = setInterval(() => { rotar(); }, CADA); if (iv.unref) iv.unref(); }
}

module.exports = { iniciar, rotar, restaurar, lista, _cfg: (l) => { rutas = l; } };

if (require.main === module) {
  const [cmd, arg, idx] = process.argv.slice(2);
  const base = (a) => path.join(__dirname, a.endsWith('.json') ? a : a + '.json');
  if (cmd === 'listar') {
    let fs2 = [];
    try { fs2 = fs.readdirSync(DIR); } catch (e) { /* vacio */ }
    const grupos = {};
    for (const x of fs2) { const k = x.replace(/\.\d{8}T\d{6}\.json$/, ''); (grupos[k] = grupos[k] || []).push(x); }
    for (const k of Object.keys(grupos).sort()) console.log(k + ': ' + grupos[k].length + ' respaldos, ultimo ' + grupos[k].sort().pop().slice(k.length + 1, -5));
  } else if (cmd === 'restaurar' && arg) {
    const r = base(arg);
    const l = lista(r).filter((e) => valido(path.join(DIR, e.x)));
    const e = l[Number(idx || 0)];
    if (!e) { console.log('sin respaldos validos para ' + arg); process.exit(1); }
    if (fs.existsSync(r)) fs.copyFileSync(r, r + '.antes');
    fs.copyFileSync(path.join(DIR, e.x), r);
    console.log('restaurado ' + path.basename(r) + ' de ' + e.m + ' (el anterior quedo en .antes)');
  } else console.log('uso: node respaldo.js listar | node respaldo.js restaurar <archivo> [n: 0 = el mas reciente]');
}
