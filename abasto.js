// Autoabastecimiento: cuando esta tranquilo (nadie cerca) junta madera, piedra, carbon y hierro, cocina en horno,
// caza comida, y fabrica herramientas, armadura, escudo, cubo, flechas y TNT. Un paso por ciclo; se aborta si aparece alguien.
const { Vec3 } = require('vec3');

function crearAbasto(bot, o) {
  const { goals } = o;
  const ON = process.env.IA_ABASTO !== '0';
  let activo = false, ultima = 0, fallos = {}, sinHallazgo = 0;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const items = () => bot.inventory.items();
  const cuenta = (re) => items().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
  const tiene = (re) => cuenta(re) > 0;
  const libre = () => o.tranquilo() && !jugadorCerca(36);
  function jugadorCerca(r) {
    return Object.values(bot.entities).some((e) => e.type === 'player' && e.username !== bot.username && e.position.distanceTo(bot.entity.position) < r);
  }
  const bloqueN = (re, d = 24) => bot.findBlock({ maxDistance: d, matching: (b) => b && re.test(b.name) });

  async function colocar(nombre) {
    const it = items().find((i) => i.name === nombre);
    if (!it) return null;
    const p = bot.entity.position.floored();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const pos = p.offset(dx, 0, dz), suelo = bot.blockAt(pos.offset(0, -1, 0)), aire = bot.blockAt(pos);
      if (suelo && aire && suelo.boundingBox === 'block' && aire.name === 'air') {
        try {
          await bot.equip(it, 'hand');
          await bot.placeBlock(suelo, new Vec3(0, 1, 0));
          return bot.blockAt(pos);
        } catch (e) { /* prueba otra celda */ }
      }
    }
    return null;
  }

  // Fabrica con las recetas de minecraft-data; la mesa solo se exige si la receta la pide.
  async function craftear(nombre, n = 1) {
    const def = bot.registry.itemsByName[nombre];
    if (!def) return false;
    let mesa = bloqueN(/^crafting_table$/, 16);
    let rec = bot.recipesFor(def.id, null, n, mesa || null)[0];
    if (!rec) return false;
    if (rec.requiresTable) {
      if (!mesa) return false;
      if (mesa.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, mesa.position))) return false;
    }
    try { await bot.craft(rec, n, rec.requiresTable ? mesa : null); return true; } catch (e) { return false; }
  }
  async function aTablones() {
    const tr = items().find((i) => /_log$/.test(i.name));
    if (!tr) return false;
    return craftear(tr.name.replace('_log', '_planks'), 1);
  }

  async function mesa() {
    if (bloqueN(/^crafting_table$/, 16)) return true;
    if (!tiene(/_planks$/) && !(await aTablones())) return false;
    if (cuenta(/_planks$/) < 4 && !(await aTablones())) return false;
    if (!tiene(/^crafting_table$/) && !(await craftear('crafting_table'))) return false;
    return !!(await colocar('crafting_table'));
  }

  // Cocina/funde: horno colocado cerca, combustible y entrada; espera y recoge.
  async function cocinar(entrada) {
    const n = cuenta(new RegExp('^' + entrada + '$'));
    if (!n) return false;
    let horno = bloqueN(/^furnace$/, 16);
    if (!horno) {
      if (!tiene(/^furnace$/)) { if (cuenta(/^cobblestone$/) < 8 || !(await craftear('furnace'))) return false; }
      horno = await colocar('furnace');
      if (!horno) return false;
    }
    if (horno.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, horno.position))) return false;
    const fuel = items().find((i) => i.name === 'coal' || i.name === 'charcoal') || items().find((i) => /_planks$/.test(i.name)) || items().find((i) => /_log$/.test(i.name));
    if (!fuel) return false;
    const f = await bot.openFurnace(horno);
    try {
      const cant = Math.min(n, 16);
      await f.putFuel(fuel.type, null, Math.min(fuel.count, /coal|charcoal/.test(fuel.name) ? 2 : 6));
      await f.putInput(bot.registry.itemsByName[entrada].id, null, cant);
      const limite = Date.now() + cant * 10_500 + 3000;
      while (Date.now() < limite && libre()) {
        await dormir(2000);
        if (f.outputItem()) { try { await f.takeOutput(); } catch (e) { /* sigue */ } }
        const ent = f.inputItem();
        if (!ent && !f.outputItem()) break;
      }
      if (f.outputItem()) await f.takeOutput().catch(() => {});
    } finally { try { f.close(); } catch (e) { /* ignorar */ } }
    return true;
  }

  async function cazar(re) {
    const presa = Object.values(bot.entities).filter((e) => re.test(e.name || '') && e.position.distanceTo(bot.entity.position) < 32)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
    if (!presa) return false;
    const arma = items().find((i) => /_sword$/.test(i.name)) || items().find((i) => /_axe$/.test(i.name));
    if (arma) await bot.equip(arma, 'hand').catch(() => {});
    const fin = Date.now() + 25_000;
    while (Date.now() < fin && bot.entities[presa.id] && libre()) {
      const d = presa.position.distanceTo(bot.entity.position);
      if (d > 2.8) { try { bot.pathfinder.setGoal(new goals.GoalNear(presa.position.x, presa.position.y, presa.position.z, 2)); } catch (e) { /* ignorar */ } }
      else { try { bot.pathfinder.setGoal(null); await bot.lookAt(presa.position.offset(0, presa.height / 2, 0), true); bot.attack(presa); } catch (e) { /* ignorar */ } }
      await dormir(450);
    }
    // recoge lo que soltaron
    await dormir(500);
    const drop = Object.values(bot.entities).find((e) => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 8);
    if (drop) { try { bot.pathfinder.setGoal(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0.5)); await dormir(1500); } catch (e) { /* ignorar */ } }
    return true;
  }

  async function llenarCubo() {
    const cubo = items().find((i) => i.name === 'bucket');
    const agua = bloqueN(/^water$/, 24);
    if (!cubo || !agua) return false;
    if (!(await o.irCerca(bot, agua.position))) return false;
    await bot.equip(cubo, 'hand');
    await bot.lookAt(agua.position.offset(0.5, 0.5, 0.5), true);
    bot.activateItem();
    await dormir(500);
    return !!items().find((i) => i.name === 'water_bucket');
  }

  async function explorar() {
    const p = bot.entity.position, a = Math.random() * Math.PI * 2;
    try { bot.pathfinder.setGoal(new goals.GoalNear(p.x + Math.cos(a) * 35, p.y, p.z + Math.sin(a) * 35, 3)); } catch (e) { /* ignorar */ }
    await dormir(9000);
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
  }

  // Cada necesidad devuelve: true si avanzo, false si no pudo (se enfria), 'nada' si no aplica.
  const necesidades = [
    ['madera', async () => {
      if (cuenta(/_log$|_planks$/) >= 12) return 'nada';
      const b = bloqueN(/_log$/, 24);
      if (!b) return explorar().then(() => false);
      return (await o.recolectar(bot, b.name, 5)).ok;
    }],
    ['mesa', async () => (bloqueN(/^crafting_table$/, 24) || cuenta(/_log$|_planks$/) < 6) ? 'nada' : mesa()],
    ['palos', async () => (cuenta(/^stick$/) >= 4 || cuenta(/_planks$/) < 2) ? 'nada' : craftear('stick', 1)],
    ['piedra', async () => {
      if (cuenta(/^cobblestone$/) >= 24 || !bloqueN(/^stone$/, 24)) return 'nada';
      return (await o.recolectar(bot, 'stone', 8)).ok;
    }],
    ['equipo', async () => { if (!bloqueN(/^crafting_table$/, 24)) return 'nada'; await o.mejorar(bot); return true; }],
    ['carbon', async () => (cuenta(/^coal$/) >= 6 || !bloqueN(/^(deepslate_)?coal_ore$/, 24)) ? 'nada' : (await o.recolectar(bot, bloqueN(/^(deepslate_)?coal_ore$/, 24).name, 4)).ok],
    ['hierro', async () => {
      if (cuenta(/^(raw_iron|iron_ingot)$/) >= 26) return 'nada';
      const b = bloqueN(/^(deepslate_)?iron_ore$/, 28);
      if (!b) { if (++sinHallazgo % 3 === 0) return explorar().then(() => true); return 'nada'; }
      return (await o.recolectar(bot, b.name, 6)).ok;
    }],
    ['fundir', async () => tiene(/^raw_iron$/) ? cocinar('raw_iron') : 'nada'],
    ['carne', async () => tiene(/^(beef|porkchop|mutton|chicken)$/) ? cocinar(items().find((i) => /^(beef|porkchop|mutton|chicken)$/.test(i.name)).name) : 'nada'],
    ['comida', async () => (cuenta(/^(cooked_beef|cooked_porkchop|cooked_mutton|cooked_chicken|bread|apple|golden_apple|carrot)$/) >= 6) ? 'nada' : cazar(/^(cow|pig|sheep|chicken)$/)],
    ['escudo', async () => (tiene(/^shield$/) || !tiene(/^iron_ingot$/) || cuenta(/_planks$/) < 6) ? 'nada' : craftear('shield')],
    ['cubo', async () => {
      if (tiene(/^(bucket|water_bucket)$/) || cuenta(/^iron_ingot$/) < 3) return 'nada';
      return craftear('bucket');
    }],
    ['agua', async () => (tiene(/^bucket$/) && !tiene(/^water_bucket$/) && bloqueN(/^water$/, 24)) ? llenarCubo() : 'nada'],
    ['tnt', async () => {
      if (cuenta(/^tnt$/) >= 8) return 'nada';
      if (cuenta(/^gunpowder$/) >= 5 && cuenta(/^sand$/) >= 4) return craftear('tnt');
      if (cuenta(/^gunpowder$/) >= 5 && bloqueN(/^sand$/, 24)) return (await o.recolectar(bot, 'sand', 4)).ok;
      return 'nada';
    }],
    ['flechas', async () => {
      if (!tiene(/^(bow|crossbow)$/) || cuenta(/^arrow$/) >= 24) return 'nada';
      if (cuenta(/^flint$/) >= 1 && cuenta(/^feather$/) >= 1 && cuenta(/^stick$/) >= 1) return craftear('arrow', 1);
      if (cuenta(/^flint$/) < 3 && bloqueN(/^gravel$/, 24)) return (await o.recolectar(bot, 'gravel', 4)).ok;
      if (cuenta(/^feather$/) < 3) return cazar(/^chicken$/);
      return 'nada';
    }],
  ];

  const intervalo = setInterval(async () => {
    if (!ON || activo || !bot.entity || Date.now() - ultima < 8000) return;
    if (!libre() || bot.health <= 12) return;
    activo = true; o.ocupar(true);
    try {
      for (const [nombre, paso] of necesidades) {
        if (!libre()) break;
        if ((fallos[nombre] || 0) > Date.now()) continue;
        let r;
        try { r = await paso(); } catch (e) { r = false; }
        if (r === 'nada') continue;
        if (!r) fallos[nombre] = Date.now() + 120_000; else { console.log('[abasto] paso:', nombre); }
        break; // un paso por ciclo
      }
    } finally {
      activo = false; o.ocupar(false); ultima = Date.now();
      try { if (!bot.pvp || !bot.pvp.target) bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      try { o.equipar(); } catch (e) { /* ignorar */ }
    }
  }, 4000);
  bot.once('end', () => clearInterval(intervalo));
  return { activo: () => activo, estado: () => ({ activo, ultima, enfriando: Object.keys(fallos).filter((k) => fallos[k] > Date.now()) }) };
}
module.exports = { crearAbasto };
