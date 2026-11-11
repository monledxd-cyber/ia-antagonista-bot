const Vec3 = require('vec3').Vec3;
const { OctahedronIterator } = require('prismarine-world').iterators;

const cacheEstados = new Map();
function estados(bot, ids) {
  const k = ids.join(',');
  let s = cacheEstados.get(k);
  if (!s) {
    s = new Set();
    for (const id of ids) {
      const b = bot.registry.blocks[id];
      if (!b) continue;
      for (let i = b.minStateId; i <= b.maxStateId; i++) s.add(i);
    }
    cacheEstados.set(k, s);
  }
  return s;
}

function aplica(o) {
  const m = o && o.matching;
  if (o.useExtraInfo) return null;
  const a = Array.isArray(m) ? m : typeof m === 'number' ? [m] : null;
  return a && a.every((x) => typeof x === 'number') ? a : null;
}

function buscar(bot, o, ids) {
  const set = estados(bot, ids);
  const punto = (o.point || bot.entity.position).floored();
  const max = o.maxDistance || 16, cuenta = o.count || 1;
  const inicio = new Vec3(Math.floor(punto.x / 16), Math.floor(punto.y / 16), Math.floor(punto.z / 16));
  const it = new OctahedronIterator(inicio, Math.ceil((max + 8) / 16));
  const vistos = new Set();
  const minY = bot.game.minY, off = Math.abs(minY >> 4), total = bot.game.height >> 4;
  let bl = [], capa = 0, sig = inicio;
  const m2 = max * max;
  while (sig) {
    const col = bot.world.getColumn(sig.x, sig.z);
    const sy = sig.y + off;
    const clave = sig.x + ',' + sig.y + ',' + sig.z;
    if (sy >= 0 && sy < total && col && !vistos.has(clave)) {
      const sec = col.sections[sy];
      vistos.add(clave);
      if (sec) {
        let hay = true;
        if (sec.palette) { hay = false; for (const p of sec.palette) if (set.has(p)) { hay = true; break; } }
        if (hay) {
          const bx = sig.x * 16, by = sy * 16 + minY, bz = sig.z * 16, data = sec.data;
          for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) {
            const base = (y << 8) | (z << 4);
            for (let x = 0; x < 16; x++) {
              if (!set.has(data.get(base | x))) continue;
              const dx = bx + x - punto.x, dy = by + y - punto.y, dz = bz + z - punto.z;
              if (dx * dx + dy * dy + dz * dz <= m2) bl.push(new Vec3(bx + x, by + y, bz + z));
            }
          }
        }
      }
    }
    if (capa !== it.apothem && bl.length >= cuenta) break;
    capa = it.apothem;
    sig = it.next();
  }
  bl.sort((a, b) => a.distanceTo(punto) - b.distanceTo(punto));
  return bl.length > cuenta ? bl.slice(0, cuenta) : bl;
}

function instalar(bot) {
  const orig = bot.findBlocks;
  bot.findBlocks = function (o) {
    const ids = aplica(o);
    if (!ids || process.env.IA_BUSQ_RAPIDA === '0') return orig.call(this, o);
    return buscar(bot, o, ids);
  };
}
module.exports = { instalar, buscar, aplica };
