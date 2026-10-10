const ult = new Map();
function alertar(texto, clave = texto, cooldownMin = 15) {
  const url = process.env.ALERTA_WEBHOOK;
  if (!url || Date.now() - (ult.get(clave) || 0) < cooldownMin * 60_000) return;
  ult.set(clave, Date.now());
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '[AM] ' + String(texto).slice(0, 1800), text: '[AM] ' + String(texto).slice(0, 1800) }) }).catch(() => {});
}
module.exports = { alertar };
