const assert = require('assert');
const EventEmitter = require('events');
const { crearEstructuras } = require('../estructuras');
const bot = new EventEmitter();
const pos = (x, y, z) => ({ x, y, z });
const retirados = [];
Object.assign(bot, {
  entity: { position: pos(0, 64, 0) }, health: 20, food: 20, pvp: null,
  registry: { blocksByName: { chest: { name: 'chest', id: 1 }, spawner: { name: 'spawner', id: 2 }, cobweb: { name: 'cobweb', id: 3 }, rail: { name: 'rail', id: 4 }, tnt: { name: 'tnt', id: 5 } } },
  findBlocks: ({ matching }) => {
    if (matching.includes(1)) return [pos(10, 64, 10), pos(30, 64, 30)];
    if (matching.includes(2)) return [pos(11, 64, 11)];
    if (matching.includes(5)) return [pos(31, 64, 31)];
    return [];
  },
  blockAt: (p) => ({ name: 'chest', position: p }),
  openContainer: async () => ({ containerItems: () => [{ name: 'diamond', type: 1, count: 3 }, { name: 'dirt', type: 2, count: 9 }], withdraw: async (t) => { retirados.push(t); }, close() {} }),
});
const eventos = [];
bot._eventos = { registrar: (t, x) => eventos.push(x) };
const h = { bot, diag: { log() {} }, o: { irCerca: async () => true }, items: () => [], cuenta: () => 0, tiene: () => true, libre: () => true, dormir: async () => {}, VALIOSO: /diamond/, ruta: '/tmp/est_test_' + process.pid + '.json' };
(async () => {
  const e = crearEstructuras(h);
  e.escanear();
  assert.strictEqual(e.candidatos(), 1, 'solo el cofre con spawner sin trampas');
  assert.strictEqual(await e.estructuras(), true);
  assert.deepStrictEqual(retirados, [1]);
  assert.ok(eventos.length === 1);
  assert.strictEqual(await e.estructuras(), 'nada');
  console.log('OK: estructuras');
  process.exit(0);
})().catch((x) => { console.error(x); process.exit(1); });
