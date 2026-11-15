const assert = require('assert');
const { mapa } = require('../entorno');
const bot = {
  entity: { position: { x: 0.5, y: 52, z: 4.5, floored() { return { x: 0, y: 52, z: 4 }; }, distanceTo: () => 0 } },
  entities: { 1: { name: 'shulker', position: { distanceTo: () => 3 } } },
  game: { gameMode: 'survival' },
  blockAt: (v) => { const n = v.y < 52 || v.x === -3 ? 'stone' : 'air'; return { name: n, boundingBox: n === 'air' ? 'empty' : 'block' }; },
};
const t = mapa(bot);
assert.ok(/modo survival/.test(t) && /shulker/.test(t) && /@/.test(t) && /#{3}/.test(t));
require('../diag').estado.entorno = t;
assert.ok(require('../diag').html({}).includes('Entorno'));
console.log('OK: entorno');
process.exit(0);
