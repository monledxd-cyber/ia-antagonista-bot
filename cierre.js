const diag = require('./diag');

let actual = null, extraF = null, hecho = false, armado = false;

function guardarTodo() {
  const bot = actual;
  const lista = bot ? [['nn', () => bot._nn && bot._nn.guardar()], ['leng', () => bot._leng && bot._leng.guardar()], ['premio', () => bot._premio && bot._premio.guardar()], ['mapa', () => bot._mapa && bot._mapa.guardar()], ['claves', () => bot._claves && bot._claves.guardar && bot._claves.guardar()], ['autopsia', () => bot._autopsia && bot._autopsia.guardar()]] : [];
  lista.push(['extra', extraF]);
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
