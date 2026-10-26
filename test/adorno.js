const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearLenguaje } = require('../lenguaje');
const bot = new EventEmitter();
Object.assign(bot, {
  players: {}, entity: null, health: 20, username: 'am',
  _afecto: { resentimiento: () => 8, deshum: () => 3 },
  _memHechos: () => ({ mato: 2, gane: 1, perdi: 0, visitas: 5 }),
  _bandits: { elegir: (d, c, arms) => arms[arms.length - 1], premiar: () => {} },
});
const L = crearLenguaje(bot, path.join(os.tmpdir(), 'len_t.json'), path.join(os.tmpdir(), 'cor_t.json'));
const meta = { nombre: 'Pedro', clave: 'x|v0', acc: 'atacar', estilo: 'local', t: Date.now() };
const f = L.emitido('Pedro', 'No tienes a donde huir.', meta, 'slm');
assert.ok(/Pedro|criatura|carne|cosa|recuerd/i.test(f) && f.length > 20, f);
const g = L.emitido('Pedro', 'No tienes a donde huir.', { ...meta }, 'llm');
assert.strictEqual(g, 'No tienes a donde huir.');
bot.removeAllListeners();
console.log('OK: adorno');
process.exit(0);
