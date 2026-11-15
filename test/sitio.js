const assert = require('assert');
const { crearSitio } = require('../sitio');
// Mundo sintetico: suelo plano y=0 (solido en y<=-1... bloque en y=-1), lava junto al origen, bosque y agua a +30 x, nada al oeste.
const mundo = (x, y, z) => {
  if (y === -1 || y === -2) return 'stone';
  if (x >= -3 && x <= 3 && z >= -3 && z <= 3 && y === -1) return 'lava';
  if (x >= 28 && x <= 36 && z >= -6 && z <= 6 && y >= 0 && y <= 4 && (x + z) % 3 === 0) return 'oak_log';
  if (x >= 28 && x <= 36 && z >= 8 && z <= 14 && y === -1) return 'water';
  return 'air';
};
const bot = {
  username: 'am', entity: { position: { x: 0, y: 0, z: 0, distanceTo: () => 0 } }, entities: {},
  blockAt: (v) => { const n = mundo(v.x, v.y, v.z); return { name: n, boundingBox: n === 'air' || n === 'water' || n === 'lava' ? 'empty' : 'block', position: v }; },
  once() {},
};
const s = crearSitio(bot, '/tmp/sitio_test.json');
const origen = s.valor({ x: 0, y: 0, z: 0, floor() {} });
const m = s.mejor({ x: 0, y: 0, z: 0 }, 40);
assert.ok(m, 'hay candidato');
assert.ok(m.pos.x >= 14, 'prefiere el lado con madera y agua, no el origen con lava: ' + JSON.stringify(m.pos));
assert.ok(m.valor > origen, 'valor mayor que el origen');
// Aprendizaje: castigar un sitio con muchos recursos baja su valor y baja el peso de madera
const w0 = s.pesos()[0], v0 = s.valor(m.pos);
for (let i = 0; i < 6; i++) s.resultado(m.pos, -1);
assert.ok(s.valor(m.pos) < v0 - 0.5, 'castigo baja el valor');
assert.ok(s.pesos()[0] < w0, 'baja el peso de madera');
console.log('OK: sitio', JSON.stringify(m.pos), m.valor.toFixed(2), '->', s.valor(m.pos).toFixed(2));
const cosas = [[-20, 0, 2], [-21, 0, 2], [-20, 0, 4], [-22, 0, 3]].map((a) => ({ x: a[0], y: a[1], z: a[2] }));
const bot2 = Object.assign({}, bot, {
  registry: { blocksByName: { chest: { id: 1, name: 'chest' }, crafting_table: { id: 2, name: 'crafting_table' }, stone: { id: 3, name: 'stone' } } },
  findBlocks: () => cosas,
});
const s2 = crearSitio(bot2, '/tmp/sitio_test2.json');
const m2 = s2.mejor({ x: 0, y: 0, z: 0 }, 40);
assert.ok(m2.pos.x <= -14, 'se queda donde tiene sus cosas: ' + JSON.stringify(m2.pos));
console.log('OK: sitio con cosas', JSON.stringify(m2.pos));
process.exit(0);
