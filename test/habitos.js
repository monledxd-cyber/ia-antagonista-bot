const { crearHabitos } = require('../habitos');
const { crearMemoria } = require('../memoria');
const { crearBandits } = require('../bandits');
const os = require('os'), path = require('path'), assert = require('assert');
const mem = crearMemoria(path.join(os.tmpdir(), 'hab_test_' + process.pid + '.json'));
const bot = { username: 'am', entity: { position: { x: 0, y: 0, z: 0, distanceTo: (o) => Math.hypot(o.x, o.z) } }, entities: {}, pvp: { target: null }, once() {} };
const mk = (nom, x, z, hp) => ({ type: 'player', username: nom, position: { x, y: 0, z, distanceTo: (o) => Math.hypot(x - o.x, z - o.z) }, metadata: { 9: hp } });
const h = crearHabitos(bot, mem, { ms: 1e9 });
function correr(nom, f, hp, n) {
  let t = 1000;
  for (let i = 0; i < n; i++) { t += 250; const [x, z] = f(i); const e = mk(nom, x, z, typeof hp === 'function' ? hp(i) : hp); bot.entities = { 1: e }; bot.pvp.target = e; h.tick(t); }
  bot.entities = {}; h.tick(t + 250);
}
for (let k = 0; k < 3; k++) {
  correr('zig', (i) => [4, (i % 4 < 2 ? 1 : -1) * 1.0 * ((i % 2) + 1) * 0 + (Math.floor(i / 2) % 2 ? 1 : -1) * (i % 2 ? 0.4 : 0.1) + i * 0], 20, 40);
  correr('zig', (i) => [4, Math.floor(i / 2) % 2 ? 0 : 1.2 * (i % 2 + 1)], 20, 40);
  correr('rec', (i) => [3 + i * 0.35, 0], (i) => 5, 24);
  correr('fir', (i) => [Math.max(1.5, 8 - i * 0.4), 0], (i) => 5, 24);
}
const z = mem.modelo('zig'), r = mem.modelo('rec'), f = mem.modelo('fir');
console.log('zig', z && z.zigzag, 'rec', r && r.retira, 'fir', f && f.retira);
assert(r && r.retira >= 0.7, 'retira detectada');
assert(f && f.retira <= 0.3, 'el que avanza no retira');
assert(z && z.zigzag > (f.zigzag || 0), 'zigzag mayor que quien va recto');
const b = crearBandits(path.join(os.tmpdir(), 'hab_b_' + process.pid + '.json'));
b.perfilIniciar('x|espada', 'espada|d|sup', { retira: 0.8, zigzag: 0.6 });
console.log('habitos ok');
process.exit(0);
