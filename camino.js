const MALO = /^(lava|magma_block|cactus|fire|soul_fire|campfire|soul_campfire|sweet_berry_bush|wither_rose|powder_snow|cobweb|water)$/;
const vacio = (b) => b && b.boundingBox === 'empty' && !MALO.test(b.name);
const solido = (b) => b && b.boundingBox === 'block' && !MALO.test(b.name);

function trazado(bot, pos, radio = 2) {
  const yo = bot.entity.position;
  const dx = pos.x + 0.5 - yo.x, dz = pos.z + 0.5 - yo.z, d = Math.hypot(dx, dz);
  if (d > 14 || Math.abs(pos.y - yo.y) > 1.6) return false;
  const y = Math.floor(yo.y + 0.01);
  const pasos = Math.max(1, Math.ceil((d - radio) / 0.5));
  for (let i = 1; i <= pasos; i++) {
    const t = Math.min(d - radio, i * 0.5) / d, x = Math.floor(yo.x + dx * t), z = Math.floor(yo.z + dz * t);
    const V = require('vec3').Vec3;
    if (!vacio(bot.blockAt(new V(x, y, z))) || !vacio(bot.blockAt(new V(x, y + 1, z))) || !solido(bot.blockAt(new V(x, y - 1, z)))) return false;
  }
  return true;
}

function directo(bot, pos, radio = 2) {
  return new Promise((resolve) => {
    if (!trazado(bot, pos, radio)) return resolve(null);
    const centro = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
    const c = centro(pos), t0 = Date.now();
    let ult = bot.entity.position.clone(), tUlt = t0;
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    const fin = (v) => { clearInterval(it); try { bot.setControlState('forward', false); bot.setControlState('sprint', false); } catch (e) { /* ignorar */ } resolve(v); };
    const it = setInterval(() => {
      try {
        if (!bot.entity) return fin(null);
        const p = bot.entity.position, d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d <= radio + 0.2) return fin(true);
        if (Date.now() - t0 > 1500 + d * 450) return fin(null);
        const ahora = Date.now();
        if (ahora - tUlt > 800) { if (p.distanceTo(ult) < 0.15) return fin(null); ult = p.clone(); tUlt = ahora; }
        bot.lookAt({ x: c.x, y: p.y + 1.6, z: c.z }, true);
        bot.setControlState('forward', true);
        bot.setControlState('sprint', d > 4);
      } catch (e) { fin(null); }
    }, 100);
  });
}
module.exports = { trazado, directo };
