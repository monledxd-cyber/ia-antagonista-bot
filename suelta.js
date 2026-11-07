const SUELTA = /(te dejo ir|te dejar[eé] ir|puedes irte|te libero|eres libre|est[aá]s libre|te perdono|no te har[eé] nada|no voy a (tocarte|hacerte)|ve en paz|vete en paz|est[aá]s a salvo)/i;
const ult = {};
function planificar(texto, usuario, ahora, rnd) {
  if (!SUELTA.test(String(texto || ''))) return null;
  const t = ahora == null ? Date.now() : ahora;
  if (ult[usuario] && t - ult[usuario] < 300000) return null;
  ult[usuario] = t;
  const r = typeof rnd === 'number' ? rnd : Math.random();
  return { demora: 5000 + Math.round(r * 9000), hasta: 60000 };
}
module.exports = { planificar, SUELTA, _ult: ult };
