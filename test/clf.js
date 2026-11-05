const assert = require('assert');
const path = require('path');
const { crearClasificador } = require('../slm_clf');
const c = crearClasificador(path.join(__dirname, '..', 'slm', 'chat'));
assert(c.listo(), 'clasificador cargado');
const ref = require('./clf_ref.json');
let mal = 0, dc = 0;
for (const r of ref) {
  const o = c.clasificar(r.u);
  if (o.p !== r.p) mal++;
  dc = Math.max(dc, Math.abs(o.conf - r.conf));
}
assert(mal <= 1, 'prediccion distinta en ' + mal);
assert(dc < 0.02, 'confianza distinta ' + dc);
console.log('clf ok', ref.length, 'dc', dc.toFixed(4));
