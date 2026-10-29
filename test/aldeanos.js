require('fs').rmSync('/tmp/aldea_test.json', { force: true });
const assert = require('assert');
const { crearAldeanos } = require('../aldeanos');
const inv = [{ name: 'emerald', count: 40 }, { name: 'lectern', count: 1 }];
const items = () => inv;
const cuenta = (re) => inv.filter((i) => re.test(i.name)).reduce((s, i) => s + i.count, 0);
const tiene = (re) => cuenta(re) > 0;
const pos = { distanceTo: () => 2 };
let abiertos = 0, comprados = 0;
const libroFalso = (mending) => ({ name: 'enchanted_book', components: [{ type: 'stored_enchantments', data: { enchantments: [{ id: mending ? 'M' : 'X', level: 1 }] } }], _m: mending });
const bot = {
  entity: { position: pos }, inventory: { slots: [] }, registry: {},
  entities: { 1: { id: 1, name: 'villager', position: pos, isValid: true } },
  blockAt: () => ({ name: 'lectern', position: pos }), dig: async () => {}, findBlocks: () => [],
  openVillager: async () => { abiertos++; return { trades: [{ output: libroFalso(abiertos >= 2), firstInput: { name: 'emerald', count: 20 }, disabled: false }], close() {}, once() {} }; },
  trade: async () => { comprados++; },
};
const h = { bot, diag: { log() {} }, o: { irCerca: async () => true }, items, cuenta, tiene, colocar: async () => ({ position: pos }), craftear: async () => true, libre: () => true, dormir: async () => {}, ruta: '/tmp/aldea_test.json' };
require('../encantos').leer = (b, it) => (it && it._m ? { mending: 1 } : {});
(async () => {
  const a = crearAldeanos(h);
  const r = await a.aldea();
  assert.strictEqual(r, true);
  assert.strictEqual(comprados, 1);
  assert.ok(abiertos >= 2);
  console.log('OK: aldeanos');
})().catch((e) => { console.error(e); process.exit(1); });
