const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
try {
  for (const l of fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* sin .env */ }
try {
  for (const l of fs.readFileSync(path.join(raiz, 'iniciar.bat'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*set\s+"?([A-Za-z0-9_]+)=(.*?)"?\s*$/i.exec(l);
    if (m && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch (e) { /* sin iniciar.bat */ }
const { preguntarIA } = require(path.join(raiz, 'openrouter'));
const { ESTILOS, RASGOS, DIRECTIVA, ACCION } = require(path.join(raiz, 'lenguaje'));

const N = Number(process.argv[2]) || 200;
const ESPERA = Number(process.env.SLM_ESPERA) || 6000;
const ARCH = path.join(raiz, 'corpus_lote.json');
let datos = [];
try { datos = JSON.parse(fs.readFileSync(ARCH, 'utf8')); } catch (e) { datos = []; }
const al = (a) => a[Math.floor(Math.random() * a.length)];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpiar = (t) => String(t || '').replace(/\[[A-Z_]+[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  let ok = 0, mal = 0;
  for (let i = 0; i < N; i++) {
    const acc = al(Object.keys(ACCION)), est = al(ESTILOS), vb = al(['v+', 'v0', 'v-']), vida = al(['ok', 'ok', 'bajo']);
    const rs = RASGOS.map(() => (Math.random() < 0.55 ? 0 : +(0.3 + Math.random() * 0.7).toFixed(2)));
    const dom = RASGOS.map((k, j) => [k, rs[j]]).filter((x) => x[1] > 0.35).map((x) => x[0] + ' ' + x[1]).join(',');
    const lenguaje = [`accion_real:${acc} (${ACCION[acc]})`, `estilo:${est} (${DIRECTIVA[est]})`, dom ? 'rasgos_rival:' + dom : '', vb !== 'v0' ? 'ventaja:' + (vb === 'v+' ? '0.5' : '-0.5') : '', vida === 'bajo' ? 'tu vida es baja' : ''].filter(Boolean).join('\n');
    try {
      const r = await preguntarIA(undefined, { nombre: 'Jugador', espontaneo: true, lenguaje });
      const f = limpiar(r);
      if (f.length >= 12 && f.length <= 140) { datos.push({ t: Date.now(), i: [acc, vb, vida, '-'].join('|'), e: est, f, r: 0.5, o: 'lote', rs }); ok++; } else mal++;
    } catch (e) { mal++; console.error('fallo:', String(e.message).slice(0, 120)); if (mal > 8 && ok === 0) break; }
    if ((i + 1) % 10 === 0) { fs.writeFileSync(ARCH, JSON.stringify(datos)); console.log(`${i + 1}/${N} ok ${ok} mal ${mal} total ${datos.length}`); }
    await dormir(ESPERA);
  }
  fs.writeFileSync(ARCH, JSON.stringify(datos));
  console.log(`listo: ${datos.length} en corpus_lote.json`);
})();
