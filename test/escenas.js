const assert = require('assert');
const { crearEscenas, ESC, AFIN } = require('../escenas');
const j = { peleas: [{ res: 'gane', dur: 31.4, armas: ['diamond_sword'] }, { res: 'perdi', dur: 12, armas: ['iron_axe'] }], huyo: 3, muertes: 5, mato: 2, dijo: [{ t: Date.now() - 3 * 60000, s: 'te voy a matar' }], ult: { x: 10, y: 64, z: -20, t: Date.now() - 60000 } };
const mem = { crudo: (n) => (n === 'Ana' ? j : null), modelo: () => ({ retira: 0.8, zigzag: 0.2 }) };
for (const k of Object.keys(ESC)) { const s = ESC[k](j, 'Ana', { retira: 0.8 }); assert(typeof s === 'string' && s.length > 20 && !/undefined|NaN|\{/.test(s), k + ': ' + s); }
assert(ESC.huida({ huyo: 0 }, 'x', null) === null && ESC.mato({ mato: 0 }, 'x') === null);
for (const k of Object.values(AFIN).flat()) assert(ESC[k], 'escena inexistente ' + k);
const e = crearEscenas(mem, { prob: 1, espera: 0 });
const s1 = e.componer('Ana', 'amenaza', 'Ana');
assert(s1 && s1.length < 200, s1);
assert(e.componer('Bob', 'amenaza') === null);
const e2 = crearEscenas(mem, { prob: 1, espera: 60000 });
assert(e2.componer('Ana', 'saludo') && e2.componer('Ana', 'saludo') === null);
console.log('escenas ok');
