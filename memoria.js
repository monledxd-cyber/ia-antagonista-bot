// Memoria entre sesiones: un JSON por jugador (visitas, muertes, arma favorita, trampas sufridas). Se resume en una linea para la IA.
const fs = require('fs');
const path = require('path');

function crearMemoria(ruta) {
  const ARCHIVO = ruta || process.env.IA_MEMORIA || path.join(__dirname, 'memoria_jugadores.json');
  let datos = {};
  try { datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) || {}; } catch (e) { datos = {}; }
  let sucio = false;
  const get = (n) => (datos[n] = datos[n] || { visitas: 0, primera: Date.now(), ultima: Date.now(), muertes: 0, mato: 0, trampas: 0, armas: {}, huyo: 0, obs: {}, n: 0, lugares: {} });
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
    // Observacion periodica del jugador: tags = ['escudo','arco','sprint','agachado','elytra',...], pos = {x,z}
    observa: (n, tags, pos) => {
      const j = get(n); j.n = (j.n || 0) + 1; j.ultima = Date.now(); sucio = true;
      for (const t of tags) j.obs[t] = (j.obs[t] || 0) + 1;
      if (pos) { const k = Math.floor(pos.x / 32) + ',' + Math.floor(pos.z / 32); j.lugares[k] = (j.lugares[k] || 0) + 1; }
    },
    // Porcentajes de cada tendencia (solo con datos suficientes): { escudo, arco, sprint, agachado, elytra, armaMain }
    perfil: (n) => {
      const j = datos[n];
      if (!j || !(j.n > 20)) return null;
      const r = {};
      for (const k of ['escudo', 'arco', 'sprint', 'agachado', 'elytra']) r[k] = Math.round(100 * (j.obs[k] || 0) / j.n);
      const arma = Object.entries(j.armas).sort((a, b) => b[1] - a[1])[0];
      r.arma = arma ? arma[0] : null;
      return r;
    },
    resumen: (n) => {
      const j = datos[n];
      if (!j) return '';
      const arma = Object.entries(j.armas).sort((a, b) => b[1] - a[1])[0];
      const pct = (k) => (j.n > 20 ? Math.round(100 * (j.obs[k] || 0) / j.n) : 0);
      const tend = ['escudo', 'arco', 'elytra', 'agachado', 'sprint'].filter((k) => pct(k) >= 15).map((k) => `${k}${pct(k)}%`).join(',');
      const base = Object.entries(j.lugares || {}).sort((a, b) => b[1] - a[1])[0];
      const zona = base && base[1] > 20 ? ` zona_habitual=${base[0].split(',').map((v) => v * 32 + 16).join(',')}(x,z)` : '';
      return `${j.visitas} visitas, visto hace ${dias(j.ultima)}d; murio ${j.muertes}x, me mato ${j.mato}x, ${j.trampas} trampas sufridas` + (arma ? `; usa ${arma[0]}` : '') + (tend ? `; tendencias ${tend}` : '') + zona;
    },
    guardar,
    detener: () => { clearInterval(timer); guardar(); },
  };
}
module.exports = { crearMemoria };
