const diag = require('./diag');

function crearAutotest(bot, o) {
  let corriendo = false;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const con = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))]);
  const cuenta = (re) => bot.inventory.items().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);

  async function ejecutar() {
    if (corriendo || !bot.entity) return null;
    corriendo = true; o.ocupar(true);
    const pasos = [];
    const paso = async (n, f) => {
      try { const d = await con(f(), 40_000); pasos.push({ n, ok: d !== false, det: d === true || d === false ? '' : String(d || '') }); }
      catch (e) { pasos.push({ n, ok: false, det: e.message }); }
    };
    try {
      await paso('conexion', async () => `pos ${bot.entity.position.floored()} dim ${bot.game && bot.game.dimension} vida ${bot.health} hambre ${bot.food}`);
      await paso('plugins', async () => (typeof bot.attack === 'function' && !!bot.pvp && !!bot.pathfinder) ? 'attack/pvp/pathfinder ok' : false);
      await paso('ia', async () => { const p = require('./openrouter').estadoProveedores(); return p.activos.length ? 'activos: ' + p.activos.join(',') : false; });
      await paso('mover', async () => {
        const a = bot.entity.position.clone();
        bot.setControlState('forward', true); await dormir(600); bot.setControlState('forward', false);
        return bot.entity.position.distanceTo(a) > 0.3 ? 'se movio' : false;
      });
      await paso('madera', async () => {
        const antes = cuenta(/_log$/);
        const b = bot.findBlock({ maxDistance: 32, matching: (x) => x && /_log$/.test(x.name) });
        if (!b) return 'sin arboles a 32 bloques (no es fallo del bot)';
        const r = await o.recolectar(bot, b.name, 1);
        return (r && r.ok) || cuenta(/_log$/) > antes ? 'recogio ' + b.name : false;
      });
      await paso('craftear', async () => {
        const tr = bot.inventory.items().find((i) => /_log$/.test(i.name));
        if (!tr) return 'sin troncos (omitido)';
        const def = bot.registry.itemsByName[tr.name.replace('_log', '_planks')];
        const rec = bot.recipesFor(def.id, null, 1, null)[0];
        if (!rec) return false;
        const antes = cuenta(/_planks$/);
        await bot.craft(rec, 1, null);
        return cuenta(/_planks$/) > antes ? 'fabrico tablones' : false;
      });
      await paso('colocar', async () => {
        const it = bot.inventory.items().find((i) => /_planks$|^dirt$|^cobblestone$/.test(i.name));
        if (!it) return 'sin bloques (omitido)';
        const p = bot.entity.position.floored();
        const suelo = bot.blockAt(p.offset(1, -1, 0)), aire = bot.blockAt(p.offset(1, 0, 0));
        if (!suelo || !aire || suelo.boundingBox !== 'block' || aire.name !== 'air') return 'sin hueco libre (omitido)';
        await bot.equip(it, 'hand');
        await bot.placeBlock(suelo, new (require('vec3').Vec3)(0, 1, 0));
        const b = bot.blockAt(p.offset(1, 0, 0));
        if (b && b.name !== 'air') { await bot.dig(b); return 'coloco y rompio'; }
        return false;
      });
    } finally {
      corriendo = false; o.ocupar(false);
      diag.estado.autotest = { t: Date.now(), pasos };
      diag.log(pasos.every((x) => x.ok) ? 'info' : 'warn', 'autotest', pasos.map((x) => (x.ok ? 'OK ' : 'FALLA ') + x.n + (x.det ? ' (' + x.det + ')' : '')).join(' | '));
    }
    return pasos;
  }
  return { ejecutar };
}
module.exports = { crearAutotest };
