// Diagnostico: registro de eventos + reglas que explican en claro POR QUE algo no funciona. Lo muestra /panel.
const eventos = [];
const estado = { inicio: Date.now(), conexion: { estado: 'iniciando', caidas: 0, ultimoMotivo: null, ultimaCaida: null, ultimoKick: null, ultimoSpawn: null },
  ia: { ultimoError: null, ultimoOk: null, errores: {} }, trampas: { sinOP: false, motivo: null }, vida: { ultima: null, ultimoDano: null, atacante: null },
  fallosPaso: {}, erroresCodigo: [] };
function log(nivel, modulo, msg) {
  eventos.push({ t: Date.now(), nivel, modulo, msg: String(msg).slice(0, 400) });
  if (eventos.length > 300) eventos.shift();
}
const hace = (t) => { if (!t) return '-'; const s = Math.round((Date.now() - t) / 1000); return s < 90 ? s + ' s' : (s < 5400 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'); };

function diagnosticar(extra = {}) {
  const r = [];
  const add = (gravedad, causa, solucion) => r.push({ gravedad, causa, solucion });
  const c = estado.conexion, m = String(c.ultimoMotivo || '') + ' ' + String(c.ultimoKick || '');
  if (c.estado !== 'conectado') {
    if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/.test(m)) add('alta', 'No llega al servidor (' + m.trim().slice(0, 60) + ')', 'Aternos apagado o el puerto cambio: enciende el servidor y actualiza MC_PORT (Aternos cambia el puerto cada vez).');
    else if (/throttl/i.test(m)) add('alta', 'El servidor rechaza reconexiones muy seguidas (throttle)', 'Espera 1-2 min sin reiniciar; el bot ya reintenta con pausas.');
    else if (/whitelist|not white/i.test(m)) add('alta', 'No esta en la whitelist', 'Agrega ' + (extra.usuario || 'el usuario del bot') + ' con /whitelist add.');
    else if (/banned/i.test(m)) add('alta', 'El bot esta baneado', 'Quita el ban con /pardon.');
    else add('media', 'Desconectado: ' + (m.trim().slice(0, 80) || 'motivo desconocido'), 'Mira los eventos de abajo.');
  }
  if (/spam|too fast|demasiados/i.test(m)) add('alta', 'Lo expulsaron por spam de chat/comandos', 'Baja el ritmo: IA_VOLUNTAD_MS mas alto o IA_TRAMPAS=0.');
  if (/timed out|keepalive|Timeout/i.test(m)) add('media', 'Se cayo por timeout (la conexion o el proceso se atasco)', 'En Render gratis el proceso se duerme/CPU limitada; usa un plan sin suspension o corre en tu PC.');
  if (c.ultimaCaida && estado.vida.ultimoDano && Math.abs(c.ultimaCaida - estado.vida.ultimoDano) < 8000 && (estado.vida.ultima ?? 20) <= 8)
    add('alta', 'Se cayo justo despues de recibir dano con poca vida (hp ' + estado.vida.ultima + ', atacante: ' + (estado.vida.atacante || '?') + ')', 'Motivo registrado: "' + String(c.ultimoMotivo || c.ultimoKick || '?').slice(0, 80) + '". Si es un kick del servidor/anticheat, mira ultimoKick; si es "socketClosed" sin kick, el proceso probablemente crasheo: revisa "Errores de codigo".');
  const e = estado.ia.errores;
  for (const k of Object.keys(e)) {
    const msg = { 401: 'API key invalida o vencida', 402: 'sin creditos', 404: 'modelo inexistente', 429: 'demasiadas peticiones' }[k.split(':')[1]];
    if (msg && Date.now() - e[k].t < 30 * 60_000) add('alta', 'IA ' + k.split(':')[0] + ' ' + k.split(':')[1] + ': ' + msg + ' (' + e[k].n + ' veces)', 'Revisa la clave/creditos en las variables de entorno; sin IA solo funcionan los reflejos.');
  }
  if (estado.ia.ultimoError && /presupuesto/.test(estado.ia.ultimoError.msg) && Date.now() - estado.ia.ultimoError.t < 20 * 60_000) add('media', 'Se agoto el presupuesto de llamadas a la IA por hora', 'Sube IA_MAX_LLM_HORA o espera; lo espontaneo se calla primero.');
  if (estado.trampas.sinOP) add('alta', 'Las trampas y los comandos no funcionan: el bot no tiene OP', 'En la consola de Aternos: /op ' + (extra.usuario || 'usuario_del_bot'));
  const fp = Object.entries(estado.fallosPaso).filter(([, v]) => Date.now() - v.t < 10 * 60_000);
  for (const [k, v] of fp) add('baja', 'Autoabastecimiento: "' + k + '" falla (' + v.n + 'x): ' + v.motivo, 'Normalmente falta algo (herramienta, materiales, mena cercana); se reintenta solo cada 2 min.');
  if (estado.erroresCodigo.length && Date.now() - estado.erroresCodigo[estado.erroresCodigo.length - 1].t < 30 * 60_000)
    add('alta', 'Hubo errores de codigo capturados (' + estado.erroresCodigo.length + '): ' + estado.erroresCodigo[estado.erroresCodigo.length - 1].msg.slice(0, 100), 'Copia el stack de "Errores de codigo" y pasamelo.');
  if (process.env.RENDER) add('baja', 'Corre en Render: el disco es efimero', 'Memoria de jugadores, base y planos aprendidos se pierden en cada reinicio; en tu PC si persisten.');
  if (!r.length) add('ok', 'No se detecta ningun problema conocido', '');
  return r;
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function html(extra) {
  const dx = diagnosticar(extra);
  const col = { alta: '#e5484d', media: '#f5a524', baja: '#8b949e', ok: '#3fb950' };
  const fila = (k, v) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`;
  const c = estado.conexion;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Panel AM</title>
<style>body{font:14px system-ui;background:#0d1117;color:#e6edf3;margin:0;padding:16px;max-width:980px;margin:auto}h2{margin:22px 0 8px;font-size:16px}table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #21262d;vertical-align:top}.c{border-left:4px solid;padding:8px 12px;margin:6px 0;background:#161b22;border-radius:4px}.s{color:#8b949e;font-size:12px}.e{color:#e5484d}.w{color:#f5a524}pre{white-space:pre-wrap;background:#161b22;padding:8px;border-radius:4px;font-size:12px}</style>
<h1>Panel AM <span class=s>${esc(extra.version || '')}</span></h1>
<h2>Que esta pasando (diagnostico)</h2>
${dx.map((d) => `<div class=c style="border-color:${col[d.gravedad]}"><b>${esc(d.causa)}</b>${d.solucion ? `<div class=s>Que hacer: ${esc(d.solucion)}</div>` : ''}</div>`).join('')}
<h2>Estado</h2><table>
${fila('Conexion', c.estado + ' | caidas: ' + c.caidas + ' | ultima hace ' + hace(c.ultimaCaida))}
${fila('Ultimo motivo de caida', c.ultimoMotivo || '-')}${fila('Ultimo kick', c.ultimoKick || '-')}
${fila('Proceso activo hace', hace(estado.inicio))}
${fila('Vida / ultimo dano', (estado.vida.ultima ?? '-') + ' / hace ' + hace(estado.vida.ultimoDano) + (estado.vida.atacante ? ' por ' + estado.vida.atacante : ''))}
${Object.entries(extra.estado || {}).map(([k, v]) => fila(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('')}</table>
<h2>Errores de codigo</h2>${estado.erroresCodigo.length ? estado.erroresCodigo.slice(-3).map((x) => `<pre>${esc(new Date(x.t).toISOString() + '\n' + x.msg)}</pre>`).join('') : '<div class=s>ninguno</div>'}
<h2>Ultimos eventos</h2><table>${eventos.slice(-80).reverse().map((x) => `<tr><td class=s>${new Date(x.t).toISOString().slice(11, 19)}</td><td class="${x.nivel === 'error' ? 'e' : x.nivel === 'warn' ? 'w' : 's'}">${esc(x.modulo)}</td><td>${esc(x.msg)}</td></tr>`).join('')}</table>`;
}
module.exports = { log, estado, diagnosticar, html, eventos };
