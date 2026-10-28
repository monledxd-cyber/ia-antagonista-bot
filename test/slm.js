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
  const G = require('../slm/gramatica'), f = G.filas({ cap: 24 }), celdas = {};
  for (const x of f) {
    assert(x.t.length >= 5 && x.t.length <= 140, 'largo: ' + x.t);
    assert(!/[{}]/.test(x.t.replace(/\{n\}/g, '')), 'llave suelta: ' + x.t);
    assert((x.t.match(/\{n\}/g) || []).length <= 1, 'dos {n}: ' + x.t);
    celdas[x.acc + '|' + x.est] = (celdas[x.acc + '|' + x.est] || 0) + 1;
  }
  for (const a of ['atacar', 'retroceder', 'curar', 'bloquear', 'esquivar', 'carga', 'strafe', 'otra']) for (const e of G.ESTILOS) assert(celdas[a + '|' + e] >= 10, 'celda pobre ' + a + '|' + e);
  const c = G.candidatos({ acc: 'curar', estilo: 'promesa', vb: 'v-', vida: 'bajo', rs: [0, 0, 0, 0] }, 20);
  assert(c.length > 10 && c.every((x) => x.t.length > 10));
  console.log('slm ok', f.length);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
