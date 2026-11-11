const mc = '1.21.4';
const reg = require('prismarine-registry')(mc);
const Chunk = require('prismarine-chunk')(reg);
const World = require('prismarine-world')(mc);
const { Vec3 } = require('vec3');
const EventEmitter = require('events');
const assert = require('assert');
const w = new World(() => new Chunk({ minY: -64, worldHeight: 384 })).sync;
const bot = new EventEmitter();
bot.registry = reg; bot.world = w; bot.game = { minY: -64, height: 384 };
bot.entity = { position: new Vec3(8.5, 70, 8.5) };
bot._client = new EventEmitter(); bot.version = mc;
bot.supportFeature = () => false;
require('mineflayer/lib/plugins/blocks.js')(bot, {});
const orig = bot.findBlocks;
const R = require('../bloques_rapido');
const B = reg.blocksByName;
const set = async () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.setColumn(cx, cz, new Chunk({ minY: -64, worldHeight: 384 }));
  const tipos = [B.oak_log, B.stone, B.diamond_ore, B.dirt, B.crafting_table, B.iron_ore];
  for (let i = 0; i < 6000; i++) {
    const p = new Vec3(Math.floor(rnd() * 80 - 40), Math.floor(rnd() * 120 + 20), Math.floor(rnd() * 80 - 40));
    w.setBlockStateId(p, tipos[Math.floor(rnd() * tipos.length)].defaultState);
  }
};
(async () => {
  await set();
  const casos = [[[B.oak_log.id], 16, 1], [[B.oak_log.id, B.diamond_ore.id], 32, 1], [[B.crafting_table.id], 24, 5], [[B.iron_ore.id], 64, 8], [[B.stone.id, B.dirt.id], 20, 20], [[B.emerald_ore.id], 32, 1]];
  const pos = [new Vec3(0.5, 70, 0.5), new Vec3(10.5, 40, -12.5), new Vec3(-20.5, 100, 20.5)];
  for (const p of pos) {
    bot.entity.position = p;
    for (const [m, d, c] of casos) {
      const o = { matching: m, maxDistance: d, count: c };
      const a = orig(o), b = R.buscar(bot, o, R.aplica(o));
      assert.strictEqual(b.length, a.length);
      const da = a.map((v) => v.distanceTo(p.floored())), db = b.map((v) => v.distanceTo(p.floored()));
      assert.deepStrictEqual(db, da);
    }
  }
  const o = { matching: [B.stone.id, B.dirt.id], maxDistance: 32, count: 50 };
  bot.entity.position = pos[0];
  let t = Date.now(); for (let i = 0; i < 20; i++) orig(o); const t1 = Date.now() - t;
  t = Date.now(); for (let i = 0; i < 20; i++) R.buscar(bot, o, R.aplica(o)); const t2 = Date.now() - t;
  console.log('bloques_rapido ok original ' + t1 + ' ms rapido ' + t2 + ' ms');
})().catch((e) => { console.error(e); process.exit(1); });
