const assert = require('assert');
const f = require('../fuera');
for (let i = 0; i < 60; i++) {
  const s = f.respuesta(i % 2 ? 'uvas' : 'esto es una frase bastante larga que no se repite en la respuesta', i % 3 ? 'Ana' : null);
  assert(s.length > 15 && s.length < 200 && !/[{}]|undefined/.test(s), s);
  assert(!/^\./.test(s) && !/\s,/.test(s), s);
}
console.log('fuera ok');
