const diag = require('./diag');

let actual = null, extraF = null, hecho = false, armado = false;

function guardarTodo() {
  const bot = actual;
  const lista = bot ? [['nn', () => bot._nn && bot._nn.guardar()], ['leng', () => bot._leng && bot._leng.guardar()], ['premio', () => bot._premio && bot._premio.guardar()], ['mapa', () => bot._mapa && bot._mapa.guardar()], ['claves', () => bot._claves && bot._claves.guardar && bot._claves.guardar()], ['autopsia', () => bot._autopsia && bot._autopsia.guardar()], ['nnab', () => bot._nnAb && bot._nnAb.guardar()], ['afecto', () => bot._afecto && bot._afecto.guardar()], ['metas', () => bot._metas && bot._metas.guardar()], ['atascos', () => bot._atascos && bot._atascos.guardar()], ['sesion', () => bot._sesion && bot._sesion.guardar()], ['forja', () => bot._forja && bot._forja.guardar()], ['aldeanos', () => bot._aldea && bot._aldea.guardar()], ['eventos', () => bot._eventos && bot._eventos.guardar()], ['estructuras', () => bot._estructuras && bot._estructuras.guardar()], ['psique', () => bot._psique && bot._psique.guardar()]] : [];
  lista.push(['extra', extraF]);
  lista.push(['respaldo', () => require('./respaldo').rotar()]);
  for (const [n, f] of lista) { try { if (f) f(); } catch (e) { diag.log('warn', 'cierre', n + ': ' + String(e && e.message).slice(0, 80)); } }
}

function salir(sig) {
  if (hecho) return;
  hecho = true;
  console.log(`[cierre] ${sig}: guardando`);
  guardarTodo();
  console.log('[cierre] listo');
  if (process.listenerCount(sig) > 1) return;
  process.exit(0);
}

function crearCierre(bot, extra) {
  if (process.env.IA_CIERRE === '0') return;
  actual = bot;
  if (extra) extraF = extra;
  if (armado) return;
  armado = true;
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.prependListener(s, () => salir(s));
}
module.exports = { crearCierre };
