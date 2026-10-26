const fs = require('fs');

function crearEventos(bot, ruta) {
  let lista = [], sucio = false;
  try { lista = JSON.parse(fs.readFileSync(ruta, 'utf8')) || []; } catch (e) { lista = []; }
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'hace un momento' : m < 90 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} dias`; };
  function registrar(tipo, texto, nombre) {
    lista.push({ t: Date.now(), tipo, texto, n: nombre || null });
    if (lista.length > 150) lista.shift();
    sucio = true;
  }
  const recientes = (o) => {
    o = o || {};
    let l = lista.slice();
    if (o.nombre) l = l.filter((e) => e.n === o.nombre);
    if (o.tipo) l = l.filter((e) => e.tipo === o.tipo);
    return l.slice(-(o.max || 3)).reverse();
  };
  const resumen = (nombre, max) => recientes({ nombre, max: max || 3 }).map((e) => `${hace(e.t)}: ${e.texto}`).join(' | ');
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(lista)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60_000);
  if (gt.unref) gt.unref();
  bot.once('end', () => { clearInterval(gt); guardar(); });
  const api = { registrar, recientes, resumen, guardar };
  bot._eventos = api;
  return api;
}
module.exports = { crearEventos };
