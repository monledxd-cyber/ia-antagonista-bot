const REP = /(?<![a-záéíóú])(otra vez|de nuevo|repite|rep[ií]telo|expl[ií]camelo|no (?:lo )?entend[ií]|no entiendo|con otras palabras|m[aá]s f[aá]cil|expl[ií]came mejor)(?![a-záéíóú])/i;
const SIRVE = /^(?:y\s+)?para qu[eé] sirve(?:\s+(?:eso|esa|ese|esto))?\s*\??$/i;
const COMO = /^(?:y\s+)?(?:c[oó]mo funciona|c[oó]mo es|c[oó]mo as[ií])(?:\s+(?:eso|esa|ese|esto))?\s*\??$/i;
const ESO = /^(?:y\s+)?(?:eso|esa|ese|esto|qu[eé] es eso|qu[eé] significa eso)\s*\??$/i;
function reescribir(texto, previo, ahora) {
  if (!previo || !previo.X || (ahora || Date.now()) - previo.t > 300000) return null;
  const t = String(texto || '').trim();
  if (!t || t.split(/\s+/).length > 6) return null;
  if (SIRVE.test(t)) return `para qué sirve ${previo.X}`;
  if (COMO.test(t)) return `cómo funciona ${previo.X}`;
  if (ESO.test(t) && /\?/.test(t)) return `qué es ${previo.X}`;
  if (REP.test(t)) return `explícame qué es ${previo.X}`;
  return null;
}
module.exports = { reescribir };
