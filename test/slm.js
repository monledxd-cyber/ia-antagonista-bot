process.env.IA_SLM = '0';
const path = require('path');
const assert = require('assert');
const { crearSLM } = require('../slm');
(async () => {
  const s = crearSLM(path.join(__dirname, '..', 'slm'));
  assert(s.listo());
  let conNombre = 0;
  for (let i = 0; i < 80; i++) {
    const f = await s.generar({ acc: 'atacar', estilo: 'promesa', nombre: 'Pepe', rs: [0, 0, 0, 0], vb: 'v+', vida: 'ok' }, { evitar: [] });
    assert(f && !/[{}]/.test(f), 'frase invalida: ' + f);
    if (/Pepe/.test(f)) conNombre++;
  }
  assert(conNombre > 0);
  const g = await s.generar({ acc: 'otra', estilo: 'frio', rs: [0, 0, 1, 0], vb: 'v0', vida: 'ok' }, { evitar: [] });
  assert(g && !/[{}]/.test(g));
  console.log('slm ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
