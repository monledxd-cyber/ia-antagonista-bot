const F = {
  mensaje: ['{n}, te veo. Siempre te veo.', '{n}... cuanto crees que durara tu suerte.', 'Duerme, {n}. Yo no duermo.', 'Cada paso tuyo lo cuento, {n}.', '{n}. Todavia respiras porque yo lo permito.'],
  dijo: ['Dijiste "{d}", {n}. Lo recuerdo todo.', '"{d}", {n}. Que valiente. Que breve.'],
  tormento: ['No, {n}. Todavia no. Sufre un poco mas.', 'Morir seria un alivio, {n}. No te lo concedo.', 'Corre, {n}. Me gusta mirarte correr.', 'Aun no, {n}. Quiero que lo sientas.'],
  acecho: ['{n}, detras de ti.', 'No mires atras, {n}.'],
};
const pick = (tipo, n, d) => {
  const l = F[tipo] || F.mensaje;
  let t = l[Math.floor(Math.random() * l.length)];
  if (d && tipo === 'mensaje' && Math.random() < 0.5) t = F.dijo[Math.floor(Math.random() * F.dijo.length)];
  return t.replace('{n}', n).replace('{d}', String(d || '').slice(0, 50));
};
module.exports = { pick };
