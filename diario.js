// Diario propio de AM (persistente): quien es, sus sesiones, muertes y lo que aprendio. Alimenta al LLM y ajusta la conducta.
const fs = require('fs');
const path = require('path');
function crearDiario() {
  const ARCH = process.env.IA_DIARIO || path.join(__dirname, 'diario_am.json');
  let d = { sesiones: 0, inicio: Date.now(), muertes: [], kills: 0, huidas: 0, zonas: [], modoEquipo: 0, hitos: [] };
  try { d = { ...d, ...JSON.parse(fs.readFileSync(ARCH, 'utf8')) }; } catch (e) { /* primera vez */ }
  let sucio = true;
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ARCH, JSON.stringify(d)); sucio = false; } catch (e) { /* solo lectura */ } };
  const t = setInterval(guardar, 30_000); if (t.unref) t.unref();
  d.sesiones++;
  const hace = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 90 ? m + 'min' : Math.round(m / 60) + 'h'; };
  return {
    ARCH,
    muerte: (m) => { d.muertes.push({ t: Date.now(), ...m }); if (d.muertes.length > 30) d.muertes.shift(); sucio = true; },
    zona: (p, causa) => { d.zonas.push({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), causa, t: Date.now() }); if (d.zonas.length > 25) d.zonas.shift(); sucio = true; },
    peligro: (p, r = 12) => d.zonas.some((z) => Math.hypot(z.x - p.x, z.y - p.y, z.z - p.z) < r),
    kill: () => { d.kills++; d.ultKill = Date.now(); sucio = true; },
    ultKill: () => d.ultKill || 0,
    contadores: () => ({ muertes: d.muertes.length, kills: d.kills, huidas: d.huidas, ultimaCausa: (d.muertes[d.muertes.length - 1] || {}).causa || (d.muertes[d.muertes.length - 1] || {}).arma || '' }),
    huida: () => { d.huidas++; sucio = true; },
    equipo: () => { d.modoEquipo++; sucio = true; },
    hito: (txt) => { if (d.hitos.includes(txt)) return; d.hitos.push(txt); if (d.hitos.length > 12) d.hitos.shift(); sucio = true; },
    // muertes recientes a manos de jugadores (para endurecer la prudencia)
    muertesRecientes: (min = 30) => d.muertes.filter((m) => Date.now() - m.t < min * 60000 && m.por === 'jugador').length,
    // Linea de autoconocimiento para el prompt
    resumen: () => {
      const causas = {};
      for (const m of d.muertes) { const k = m.por === 'jugador' ? (m.arma || 'jugador') : (m.causa || '?'); causas[k] = (causas[k] || 0) + 1; }
      const top = Object.entries(causas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}x${v}`).join(',');
      const u = d.muertes[d.muertes.length - 1];
      return `soy AM (antagonista); sesion ${d.sesiones}; muertes ${d.muertes.length}${top ? ' (' + top + ')' : ''}${u ? ', ultima hace ' + hace(u.t) : ''}; kills ${d.kills}; retiradas ${d.modoEquipo}` + (d.hitos.length ? '; logros: ' + d.hitos.slice(-4).join(',') : '');
    },
    guardar,
    detener: () => { clearInterval(t); guardar(); },
  };
}
module.exports = { crearDiario };
