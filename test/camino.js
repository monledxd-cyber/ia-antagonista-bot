const assert = require('assert');
const { Vec3 } = require('vec3');
const { trazado, directo } = require('../camino');
let muro = null, hueco = null;
const bot = {
  entity: { position: new Vec3(0.5, 0, 0.5) },
  blockAt: (v) => {
    let n = 'air';
    if (v.y === -1) n = 'stone';
    if (hueco && v.y === -1 && v.x === hueco) n = 'air';
    if (muro !== null && v.x === muro && v.y >= 0 && v.y <= 1) n = 'stone';
    return { name: n, boundingBox: n === 'air' ? 'empty' : 'block' };
  },
  pathfinder: { setGoal() {} }, lookAt() {}, setControlState() {},
};
assert.strictEqual(trazado(bot, new Vec3(8, 0, 0)), true, 'plano libre');
muro = 4; assert.strictEqual(trazado(bot, new Vec3(8, 0, 0)), false, 'muro'); muro = null;
hueco = 3; assert.strictEqual(trazado(bot, new Vec3(8, 0, 0)), false, 'hueco'); hueco = null;
assert.strictEqual(trazado(bot, new Vec3(8, 3, 0)), false, 'desnivel');
assert.strictEqual(trazado(bot, new Vec3(30, 0, 0)), false, 'lejos');
let adelante = false;
bot.setControlState = (k, v) => { if (k === 'forward') adelante = v; };
const mov = setInterval(() => { if (adelante) bot.entity.position.x += 0.4; }, 100);
(async () => {
  const r = await directo(bot, new Vec3(8, 0, 0), 2);
  assert.strictEqual(r, true, 'llega caminando');
  assert.strictEqual(adelante, false, 'suelta la tecla');
  muro = 4; bot.entity.position.x = 0.5;
  assert.strictEqual(await directo(bot, new Vec3(8, 0, 0), 2), null, 'sin camino directo devuelve null');
  clearInterval(mov);
  console.log('OK: camino');
  process.exit(0);
})();
