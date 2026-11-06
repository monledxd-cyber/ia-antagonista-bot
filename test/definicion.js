const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { crearChat } = require('../slm_chat');
const ch = crearChat(path.join(__dirname, '..', 'slm', 'chat'));
assert(ch.conTermino('ácido', 'Un ácido cede protones en agua.'));
assert(ch.conTermino('acido acetico', 'El ácido acético es débil.'));
assert(ch.conTermino('ácidos', 'Un ácido cede protones.'));
assert(!ch.conTermino('entropía', 'Un ácido cede protones.'));
assert(ch.conTermino('ph', 'Cualquier cosa.'));
const d = path.join(__dirname, '..', 'slm', 'conceptos');
let n = 0;
for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.txt') && x !== 'remates.txt')) {
  let cur = null;
  for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
    if (l.startsWith('@')) { cur = l.slice(1).split('|')[0].trim(); n++; continue; }
    if (l.startsWith('- ') || l.startsWith('+ ')) {
      assert(!/\d/.test(l), `${f} ${cur}: digito`);
      assert(l.length < 230, `${f} ${cur}: larga`);
      assert(!/[{}]/.test(l.replace(/\{n\}/g, '')), `${f} ${cur}: llave`);
    }
  }
}
assert(n > 300, 'conceptos ' + n);
console.log('definicion ok', n);
