const assert = require('assert');
const { crearForja } = require('../forja');
const inv = [];
const it = (name, count = 1, slot) => ({ name, count, slot });
const add = (n, c = 1, slot) => { const e = inv.find((i) => i.name === n); if (e) e.count += c; else inv.push(it(n, c, slot)); };
add('ancient_debris', 4); add('gold_ingot', 4); add('netherite_upgrade_smithing_template', 1); add('diamond_sword', 1, 20); add('smithing_table', 1);
const items = () => inv.filter((i) => i.count > 0);
const cuenta = (re) => items().filter((i) => re.test(i.name)).reduce((s, i) => s + i.count, 0);
const tiene = (re) => cuenta(re) > 0;
const quitar = (n, c) => { const e = inv.find((i) => i.name === n); e.count -= c; };
const bot = {
  inventory: { slots: [] }, entity: { position: { distanceTo: () => 1 } },
  unequip: async () => {}, equip: async () => {},
  placeBlock: async () => {},
  blockAt: () => null,
  moveSlotItem: async (a, b) => { const w = bot._w; const t = w.slots[a]; w.slots[a] = w.slots[b]; w.slots[b] = t; if (w.slots[0] && w.slots[1] && w.slots[2]) w.slots[3] = { name: 'netherite_sword', count: 1 }; },
  openBlock: async () => {
    const w = { slots: new Array(40).fill(null), close() {} };
    w.slots[4] = { name: 'netherite_upgrade_smithing_template', count: 1 };
    w.slots[5] = { name: 'diamond_sword', count: 1 };
    w.slots[6] = { name: 'netherite_ingot', count: 1 };
    bot._w = w; return w;
  },
};
const h = {
  bot, diag: { log() {} }, o: { irCerca: async () => true, equipar() {} }, items, cuenta, tiene,
  bloqueN: () => ({ position: { distanceTo: () => 1 } }), colocar: async () => ({ position: { distanceTo: () => 1 } }),
  craftear: async (n) => { if (n === 'netherite_ingot') { quitar('netherite_scrap', 4); quitar('gold_ingot', 4); add('netherite_ingot'); return true; } return false; },
  cocinar: async (n) => { if (n === 'ancient_debris') { quitar('ancient_debris', 4); add('netherite_scrap', 4); return true; } return false; },
  libre: () => true, dormir: async () => {}, ruta: '/tmp/forja_test.json',
};
(async () => {
  const f = crearForja(h);
  assert.strictEqual(await f.forja(), true);
  assert.strictEqual(cuenta(/^netherite_scrap$/), 4);
  assert.strictEqual(await f.forja(), true);
  assert.strictEqual(cuenta(/^netherite_ingot$/), 1);
  bot.inventory.slots[7] = null;
  const r = await f.forja();
  assert.strictEqual(r, true);
  assert.strictEqual(await f.wart(), 'nada');
  console.log('OK: forja');
})().catch((e) => { console.error(e); process.exit(1); });
