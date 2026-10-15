const path = require('path');
const { crearSLM } = require(path.join(__dirname, '..', 'slm'));
const s = crearSLM(__dirname);
(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  console.log('modelo listo:', s.listo());
  const casos = [['atacar', 'frio'], ['curar', 'susurro'], ['esquivar', 'promesa'], ['otra', 'libre']];
  for (const [acc, estilo] of casos) {
    const t = Date.now();
    const f = await s.generar({ acc, estilo, rs: [0, 0, 0, 0], vb: 'v0', vida: 'ok' }, { limite: 60000 });
    console.log(`${acc}/${estilo} ${Date.now() - t} ms:`, f === null ? 'SIN FRASE -> ' + s.motivo() : f);
  }
  process.exit(0);
})();
