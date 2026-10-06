// Memoria entre sesiones: un JSON por jugador (visitas, muertes, arma favorita, trampas sufridas). Se resume en una linea para la IA.
const fs = require('fs');
const path = require('path');

function crearMemoria(ruta) {
  const ARCHIVO = ruta || process.env.IA_MEMORIA || path.join(__dirname, 'memoria_jugadores.json');
  let datos = {};
  try { datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) || {}; } catch (e) { datos = {}; }
  let sucio = false;
  const get = (n) => (datos[n] = datos[n] || { visitas: 0, primera: Date.now(), ultima: Date.now(), muertes: 0, mato: 0, trampas: 0, armas: {}, huyo: 0 });
  const guardar = () => {
    if (!sucio) return;
    try { fs.writeFileSync(ARCHIVO, JSON.stringify(datos)); sucio = false; } catch (e) { /* disco de solo lectura */ }
  };
  const timer = setInterval(guardar, 30_000);
  if (timer.unref) timer.unref();
  const marca = (n, campo, inc = 1) => { const j = get(n); j[campo] = (j[campo] || 0) + inc; j.ultima = Date.now(); sucio = true; };
  const dias = (t) => Math.max(0, Math.round((Date.now() - t) / 86400000));
  return {
    entra: (n) => { marca(n, 'visitas'); },
    murio: (n) => marca(n, 'muertes'),
    mato: (n) => marca(n, 'mato'),
    trampa: (n) => marca(n, 'trampas'),
    huyo: (n) => marca(n, 'huyo'),
    arma: (n, item) => { if (!item) return; const a = get(n).armas; a[item] = (a[item] || 0) + 1; sucio = true; },
    resumen: (n) => {
      const j = datos[n];
      if (!j) return '';
      const arma = Object.entries(j.armas).sort((a, b) => b[1] - a[1])[0];
      return `${j.visitas} visitas, visto hace ${dias(j.ultima)}d; murio ${j.muertes}x, me mato ${j.mato}x, ${j.trampas} trampas sufridas` + (arma ? `; usa ${arma[0]}` : '');
    },
    guardar,
    detener: () => { clearInterval(timer); guardar(); },
  };
}
module.exports = { crearMemoria };
