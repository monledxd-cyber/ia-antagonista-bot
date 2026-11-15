const { Vec3 } = require('vec3');

function simbolo(b) {
  if (!b) return '?';
  const n = b.name;
  if (n === 'air' || n === 'cave_air' || n === 'void_air') return '.';
  if (n === 'water') return '~';
  if (n === 'lava') return 'L';
  if (n === 'bedrock') return 'B';
  if (/_log$|_wood$/.test(n)) return 'T';
  if (/_leaves$/.test(n)) return 'l';
  if (/glass|barrier/.test(n)) return 'g';
  return b.boundingBox === 'block' ? '#' : ',';
}

function mapa(bot, r = 8) {
  const p = bot.entity.position.floored();
  const capas = [];
  for (const dy of [2, 1, 0, -1]) {
    const filas = [];
    for (let dz = -r; dz <= r; dz++) {
      let f = '';
      for (let dx = -r; dx <= r; dx++) f += dx === 0 && dz === 0 && dy === 0 ? '@' : simbolo(bot.blockAt(new Vec3(p.x + dx, p.y + dy, p.z + dz)));
      filas.push(f);
    }
    capas.push('y' + (dy >= 0 ? '+' : '') + dy + '\n' + filas.join('\n'));
  }
  const ent = {};
  for (const e of Object.values(bot.entities)) {
    if (!e || e === bot.entity || !e.position || e.position.distanceTo(bot.entity.position) > 16) continue;
    const k = e.name || e.type || '?';
    ent[k] = (ent[k] || 0) + 1;
  }
  const modo = String((bot.game && bot.game.gameMode) || '?');
  return `pos ${p.x} ${p.y} ${p.z} modo ${modo} entidades ${JSON.stringify(ent)}\n# solido . aire ~ agua L lava T tronco l hoja , otro ? sin cargar @ bot\n` + capas.join('\n\n');
}
module.exports = { mapa, simbolo };
