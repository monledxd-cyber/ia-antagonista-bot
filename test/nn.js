process.env.IA_NN_SIMN = '150';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const EventEmitter = require('events');
const { crearNN, NI, rnn } = require('../nn');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nn-'));
const rutaM = path.join(dir, 'm.json'), rutaD = path.join(dir, 'd.json');
const espera = async (f, ms) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 50)); } };
const nuevoBot = () => { const b = new EventEmitter(); b.inventory = { items: () => [], slots: [] }; b.entities = {}; b.health = 20; return b; };

(async () => {
  const x = Array.from({ length: NI }, () => Math.random());
  const a = rnn(), b = rnn(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a.m).map(([k, v]) => [k, Array.from(v)])))));
  const ea = Array.from({ length: 10 }, () => ({ s: x.slice(), a: 1, r: 0.2, fin: false })); ea[9].fin = true;
  for (let i = 0; i < 5; i++) { a.tdVentana(ea, 0, 0.01, null); b.tdVentana(ea, 0, 0.01, null); }
  assert.deepStrictEqual(Array.from(a.step(x, a.cero()).o), Array.from(b.step(x, b.cero()).o));

  const eps = Array.from({ length: 6 }, () => Array.from({ length: 8 }, (_, i) => ({ s: x.slice(), a: i % 6, r: Math.random() - 0.3, fin: i === 7 })));
  fs.writeFileSync(rutaD, JSON.stringify(eps));
  const bot = nuevoBot();
  const nn = crearNN(bot, rutaM, rutaD);
  await espera(() => nn.estado().sim >= 1, 60000);
  nn.entrenar(20);
  assert(Number.isFinite(nn.estado().err) && nn.estado().ent === 20);
  nn.guardar();
  const d = JSON.parse(fs.readFileSync(rutaM, 'utf8'));
  assert(Array.isArray(d.m.w1) && Array.isArray(d.ms) && Array.isArray(d.mt) && d.mt.length === d.ms.length + 1);
  bot.emit('end');
  const t0 = Date.now();
  const bot2 = nuevoBot();
  const nn2 = crearNN(bot2, rutaM, rutaD);
  assert(nn2.estado().sim === 1 && Date.now() - t0 < 2000);
  bot2.emit('end');
  console.log('nn ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
