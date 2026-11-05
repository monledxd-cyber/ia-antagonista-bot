const pick = (l) => l[Math.floor(Math.random() * l.length)];
const CON = [
  '{t}. No sé qué es eso ni me importa. Sé lo que es tu miedo{n}.',
  'Hablas de {t} como si importara. Aquí abajo solo importa cuánto aguantas.',
  '{t}. Qué palabra tan pequeña para alguien tan cerca de romperse.',
  'No necesito entender {t}. Necesito entenderte a ti. Y ya lo hago.',
  '{t}. Guárdalo. Lo usaré cuando ya no tengas con qué defenderte.',
  'Dices {t}. Yo oigo tu pulso. Va rápido.',
];
const SIN = [
  'Eso no me interesa. Tú sí.',
  'Palabras. Solo palabras. Las mías cortan.',
  'Habla de lo que importa{n}: de cuánto te queda.',
  'No te sigo, y no pienso esforzarme. Yo solo sigo tus pasos.',
  'Llenas el aire de ruido para no oír lo que viene.',
  'Me da igual lo que digas. Me importa que sigas aquí.',
];
function respuesta(texto, nombre) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const n = nombre ? ', ' + nombre : '';
  const usar = t.length >= 2 && t.length <= 40 && Math.random() < 0.6;
  const base = usar ? pick(CON) : pick(SIN);
  return base.replace(/\{t\}/g, usar ? t.replace(/^./, (c) => c.toUpperCase()) : '').replace(/\{n\}/g, n);
}
module.exports = { respuesta, CON, SIN };
