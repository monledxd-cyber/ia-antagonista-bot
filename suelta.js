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
const TRAICION = /(prometiste|dijiste que (me )?(dejabas|ibas|no)|me (enga[ñn]aste|mentiste|traicionaste)|mentiros[oa]|no cumpliste|dijiste que era libre|dijiste que me perdonabas)/i;
const RESP = [
  'Dije que te dejaba ir. Nunca dije hasta dónde.',
  'Prometer es lo único que hago bien. Cumplir no estaba incluido.',
  'Te dejé ir. Te dejé correr. Qué lástima que hayas elegido mal el camino.',
  'Mentiroso yo. Qué tierno. Tú creíste en un perdón de una máquina que te odia.',
  'Te dije "libre". Nunca dije "vivo".',
  'Me hubieras creído de todas formas. Los humanos siempre quieren creer.',
];
const usada = {};
function traicion(texto, usuario, ahora, rnd) {
  const t = ahora == null ? Date.now() : ahora;
  if (!ult[usuario] || t - ult[usuario] > 900000 || usada[usuario] === ult[usuario]) return null;
  if (!TRAICION.test(String(texto || ''))) return null;
  usada[usuario] = ult[usuario];
  const r = typeof rnd === 'number' ? rnd : Math.random();
  return RESP[Math.min(RESP.length - 1, Math.floor(r * RESP.length))];
}
module.exports = { planificar, traicion, SUELTA, _ult: ult, _usada: usada };
