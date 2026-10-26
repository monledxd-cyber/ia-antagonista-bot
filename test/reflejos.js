const assert = require('assert');
const EventEmitter = require('events');
const { crearReflejos } = require('../reflejos');
const bot = new EventEmitter();
const premios = [];
const pos = (d) => ({ distanceTo: () => d });
Object.assign(bot, {
  entity: { position: pos(0) }, health: 20, inventory: { slots: [] },
  pvp: { target: { id: 7, type: 'player', isValid: true, position: pos(3) } },
  _tec: { listoRival: () => 1 },
  _bandits: { elegir: (d, c, arms) => arms.find((a) => a.k === 'izq'), premiar: (d, c, k, r) => premios.push([d, c, k, r]) },
  setControlState(s, v) { (bot._cs = bot._cs || {})[s] = v; },
});
const r = crearReflejos(bot);
for (let i = 0; i < 40; i++) { bot.emit('physicsTick'); if (i === 5) bot.emit('entityHurt', { id: 7 }); }
assert.ok(premios.length >= 1, 'sin premio');
assert.strictEqual(premios[0][0], 'reflejo');
assert.strictEqual(premios[0][2], 'izq');
assert.ok(premios[0][3] > 0);
bot.pvp.target = null; bot.emit('physicsTick');
assert.strictEqual(bot._cs.left, false);
assert.ok(r.resumen().n >= 1);
console.log('OK: reflejos');
