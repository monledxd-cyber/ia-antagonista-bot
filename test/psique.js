const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const EventEmitter = require('events');
const { crearPsique, DIM } = require('../psique');

const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'psi-')), 'p.json');
const nuevo = () => { const b = new EventEmitter(); b.entities = {}; return b; };
const bot = nuevo();
const P = crearPsique(bot, ruta);
const ix = (k) => DIM.indexOf(k);
const v0 = P.vector();
for (let i = 0; i < 6; i++) P.rasgo('Ana', { suplica: 0.9 });
const v1 = P.vector();
assert(v1[ix('desprecio')] > v0[ix('desprecio')] + 0.2, 'suplica debe subir desprecio');
assert(v1[ix('sadismo')] > v0[ix('sadismo')]);
for (let i = 0; i < 4; i++) P.evento('muerte', 1.2);
const v2 = P.vector();
assert(v2[ix('frustracion')] > v1[ix('frustracion')] && v2[ix('dominio')] < v1[ix('dominio')], 'muerte sube frustracion y baja dominio');
assert(P.humanidad('Ana') > 0.3);
const sb = P.sesgos();
for (const v of Object.values(sb)) assert(Math.abs(v) <= 0.12 + 1e-9);
for (let i = 0; i < 400; i++) { P.directo('golpe', 0.7); P.directo('suplica', 0.8, 'Ana'); }
const pr = P.pred();
assert(pr.n > 300 && pr.pe < pr.pb, `la prediccion debe mejorar a la base: ${pr.pe} vs ${pr.pb}`);
const antes = P.sesgoEstilo().slice(), snap = P.snapshot();
for (let i = 0; i < 80; i++) { P.aprenderEstilo('promesa', 1, snap); P.aprenderEstilo('frio', -1, snap); }
const dsp = P.sesgoEstilo();
assert(dsp.every(Number.isFinite) && dsp[7] - dsp[0] > antes[7] - antes[0] + 0.3, 'el estilo premiado debe ganar logit');
P.guardar();
bot.emit('end');
const P2 = crearPsique(nuevo(), ruta);
assert(Math.abs(P2.vector()[ix('desprecio')] - P.vector()[ix('desprecio')]) < 0.05);
console.log('psique ok', P.resumen());
process.exit(0);
