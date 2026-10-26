const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearMemoria } = require('../memoria');
const f = path.join(os.tmpdir(), 'mem_test_' + process.pid + '.json');
const base = (n, esc, armas) => ({ visitas: 3, primera: 1, ultima: 2, muertes: 0, mato: 1, trampas: 0, armas, huyo: 0, obs: { escudo: esc }, n, lugares: {}, pg: 2, pp: 1 });
fs.writeFileSync(f, JSON.stringify({
  a: base(100, 60, { diamond_axe: 10 }), b: base(100, 50, { diamond_axe: 8 }), c: base(100, 70, { diamond_sword: 3 }),
  nuevo: { ...base(5, 0, {}), obs: {} },
}));
const m = crearMemoria(f);
const g = m.global();
assert.ok(g && g.jugadores === 3);
const r = m.modelo('nuevo');
assert.ok(r.escudo >= 40, 'prior global de escudo: ' + r.escudo);
assert.strictEqual(r.clase, 'hacha');
assert.strictEqual(m.modelo('a').escudo, 60);
assert.strictEqual(m.hechos('a').mato, 1);
fs.unlinkSync(f);
console.log('OK: memoria global');
