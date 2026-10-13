const { Vec3 } = require('vec3');
const diag = require('./diag');

// Nado: si el pathfinder no avanza en el agua (flota quieto), sale por la orilla mas cercana con control directo.
function crearNado(bot) {
  let hist = [], activo = false, metaPrev = null, orilla = null, ult = 0, desde = 0;
  const agua = (b) => !!b && (b.name === 'water' || b.name === 'bubble_column' || (b.getProperties && b.getProperties().waterlogged === true));
  const libreB = (b) => !!b && (b.boundingBox === 'empty') && !agua(b);
  const solido = (b) => !!b && b.boundingBox === 'block' && !agua(b);

  function superficie(p) {
    let y = Math.floor(p.y);
    for (let k = 0; k < 20; k++) { const b = bot.blockAt(new Vec3(Math.floor(p.x), y + 1, Math.floor(p.z))); if (!agua(b)) return y; y++; }
    return y;
  }
  // Orilla mas cercana: bloque solido con aire encima, a lo sumo 1 sobre la superficie. Prefiere la direccion de la meta.
  function buscarOrilla(meta) {
    const p = bot.entity.position, sy = superficie(p);
    let mejor = null, mp = 1e9;
    for (let dx = -24; dx <= 24; dx++) for (let dz = -24; dz <= 24; dz++) {
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
      for (let y = sy + 1; y >= sy - 1; y--) {
        const b = bot.blockAt(new Vec3(x, y, z));
        if (!solido(b)) continue;
        const a1 = bot.blockAt(new Vec3(x, y + 1, z)), a2 = bot.blockAt(new Vec3(x, y + 2, z));
        if (!libreB(a1) || !libreB(a2)) break;
        const d = Math.hypot(dx, dz) + (meta ? Math.hypot(x - meta.x, z - meta.z) * 0.25 : 0);
        if (d < mp) { mp = d; mejor = new Vec3(x + 0.5, y + 1, z + 0.5); }
        break;
      }
    }
    return mejor;
  }

  const soltar = () => { for (const k of ['forward', 'sprint', 'jump']) { try { bot.setControlState(k, false); } catch (e) { /* ignorar */ } } };

  const it = setInterval(() => {
    if (!bot.entity || bot.health === undefined || bot.vehicle) return;
    const ahora = Date.now(), p = bot.entity.position, enAgua = !!bot.entity.isInWater;
    if (!enAgua) {
      if (activo) { activo = false; soltar(); if (metaPrev) { try { bot.pathfinder.setGoal(metaPrev, true); } catch (e) { /* ignorar */ } } metaPrev = null; orilla = null; }
      hist = [];
      desde = 0;
      return;
    }
    if (!desde) desde = ahora;
    hist.push({ t: ahora, p: p.clone() });
    while (hist.length && ahora - hist[0].t > 2500) hist.shift();
    const o2 = bot.oxygenLevel;
    const falta = typeof o2 === 'number' && o2 < 8;
    const g = bot.pathfinder && bot.pathfinder.goal;
    const quieto = hist.length > 6 && Math.hypot(p.x - hist[0].p.x, p.z - hist[0].p.z) < 0.9 && ahora - hist[0].t > 2000;
    const sinMeta = !g && ahora - desde > 1500;
    if (!activo && (quieto || sinMeta || falta) && ahora - ult > 600) {
      activo = true; metaPrev = g || null; ult = ahora;
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      orilla = buscarOrilla(g && g.x !== undefined ? { x: g.x, z: g.z } : null);
      diag.log('info', 'nado', orilla ? 'sale a la orilla ' + orilla.floored() : 'sin orilla visible');
    }
    if (!activo) return;
    if (!orilla || ahora - ult > 4000) { ult = ahora; orilla = buscarOrilla(metaPrev && metaPrev.x !== undefined ? { x: metaPrev.x, z: metaPrev.z } : null) || orilla; }
    const dest = orilla || p.offset(Math.cos(bot.entity.yaw), 0, Math.sin(bot.entity.yaw));
    const dx = dest.x - p.x, dz = dest.z - p.z, dh = Math.hypot(dx, dz), dy = dest.y - p.y;
    try { bot.look(Math.atan2(-dx, -dz), falta ? 0.9 : (dy > 0.6 ? 0.35 : 0), true); } catch (e) { /* ignorar */ }
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);
    bot.setControlState('jump', falta || dy > -0.4 || dh < 2.5);
  }, 150);
  bot.once('end', () => clearInterval(it));
  bot._nado = { activo: () => activo };
  return { buscarOrilla };
}
module.exports = { crearNado };
