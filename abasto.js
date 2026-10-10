// Autoabastecimiento: cuando esta tranquilo (nadie cerca) junta madera, piedra, carbon y hierro, cocina en horno,
// caza comida, y fabrica herramientas, armadura, escudo, cubo, flechas y TNT. Un paso por ciclo; se aborta si aparece alguien.
const { Vec3 } = require('vec3');
const diag = require('./diag');

function crearAbasto(bot, o) {
  const { goals } = o;
  const ON = process.env.IA_ABASTO !== '0';
  const tratos = new Map();
  let activo = false, ultima = 0, fallos = {}, sinHallazgo = 0, ultimoOk = false;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const items = () => bot.inventory.items();
  const cuenta = (re) => items().filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0);
  const tiene = (re) => cuenta(re) > 0;
  const libre = () => o.tranquilo() && !jugadorCerca(bot._modoEquipo > Date.now() ? 14 : 36);
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


  // ===== Mineria real, obsidiana, base con cofre, recuperacion tras morir y prioridades =====
  const fs = require('fs');
  const path = require('path');
  const ARCH_BASE = process.env.IA_BASE || path.join(__dirname, 'base_am.json');
  let base = null, muerte = null, mina = null, sinMenasDesde = 0;
  try { base = JSON.parse(fs.readFileSync(ARCH_BASE, 'utf8')); } catch (e) { base = null; }
  const guardarBase = () => { try { fs.writeFileSync(ARCH_BASE, JSON.stringify(base)); } catch (e) { /* disco de solo lectura */ } };
  bot.on('death', () => { if (bot.entity) muerte = { p: bot.entity.position.clone(), t: Date.now() }; mina = null; });
  const COMIDA = /^(cooked_beef|cooked_porkchop|cooked_mutton|cooked_chicken|cooked_cod|cooked_salmon|bread|apple|golden_apple|carrot|baked_potato)$/;
  const noche = () => bot.time && bot.time.timeOfDay >= 13000 && bot.time.timeOfDay < 23000;
  const enSuperficie = () => bot.entity.position.y > 50;
  const armaduraCompleta = () => [5, 6, 7, 8].every((s) => bot.inventory.slots[s]);
  const distA = (p) => Math.hypot(p.x - bot.entity.position.x, p.y - bot.entity.position.y, p.z - bot.entity.position.z);

  // Camina excavando: un Movements aparte con canDig. El pathfinder ya evita romper bloques pegados a liquidos.
  async function cavar(x, y, z, ms = 25000) {
    const M = new o.Movements(bot);
    M.canDig = true; M.allow1by1towers = false; M.allowParkour = false; M.scafoldingBlocks = [];
    for (const n of ['chest', 'furnace', 'crafting_table', 'torch', 'wall_torch']) { const d = bot.registry.blocksByName[n]; if (d) M.blocksCantBreak.add(d.id); }
    for (const n of ['lava', 'magma_block', 'fire', 'cactus', 'sweet_berry_bush']) { const d = bot.registry.blocksByName[n]; if (d) M.blocksToAvoid.add(d.id); }
    let ult = bot.entity.position.clone(), quieto = Date.now();
    try {
      bot.pathfinder.setMovements(M);
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      const fin = Date.now() + ms;
      while (Date.now() < fin && libre() && bot.health > 10) {
        await dormir(600);
        if (distA({ x, y, z }) <= 2.2) return true;
        if (bot.entity.position.distanceTo(ult) > 0.6) { ult = bot.entity.position.clone(); quieto = Date.now(); }
        else if (Date.now() - quieto > 7000) return false;
      }
      return distA({ x, y, z }) <= 2.5;
    } finally {
      try { bot.pathfinder.setGoal(null); bot.pathfinder.setMovements(bot._movBase || o.base()); } catch (e) { /* ignorar */ }
    }
  }
  async function romper(b) {
    const bl = bot.blockAt(b.position);
    if (!bl || !bot.canDigBlock(bl)) return false;
    try { await o.herramienta(bot, bl); await bot.dig(bl); return true; } catch (e) { return false; }
  }
  const pico = () => items().some((i) => /_pickaxe$/.test(i.name) && /stone|iron|diamond|netherite/.test(i.name));
  const picoHierro = () => items().some((i) => /^(iron|diamond|netherite)_pickaxe$/.test(i.name));
  const regexMenas = () => {
    const q = [];
    if (cuenta(/^(raw_iron|iron_ingot)$/) < 26) q.push('iron');
    if (cuenta(/^coal$/) < 6) q.push('coal');
    if (picoHierro() && cuenta(/^diamond$/) < 6 && !tiene(/^diamond_pickaxe$/)) q.push('diamond');
    else if (picoHierro() && cuenta(/^diamond$/) < 3) q.push('diamond');
    return q.length ? new RegExp('^(deepslate_)?(' + q.join('|') + ')_ore$') : null;
  };
  const antorchas = async () => {
    if (!tiene(/^crafting_table$/) && !bloqueN(/^crafting_table$/, 16) && cuenta(/_planks$/) >= 4) await craftear('crafting_table');
    if (cuenta(/^torch$/) >= 8 || cuenta(/^coal$/) < 1 || cuenta(/^stick$/) < 1) return;
    await craftear('torch', 2);
  };

  // Sesion de mina: baja en diagonal excavando, abre ramas a esa profundidad, recoge menas y regresa a la superficie.
  async function paso_mina() {
    const re = regexMenas();
    if (!re) return 'nada';
    if (!mina) {
      if (!pico() || bot.health < 16 || cuenta(COMIDA) < 3 || !libre()) return 'nada';
      const necesitaDiamante = /diamond/.test(re.source);
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      mina = { fase: 'bajar', d, sup: bot.entity.position.clone(), y: necesitaDiamante ? -50 : 14, legs: 0, t0: Date.now() };
      console.log('[abasto] inicia mina hacia y=' + mina.y);
    }
    const p = bot.entity.position;
    if (Date.now() - mina.t0 > 6 * 60_000 || bot.health < 12 || (cuenta(COMIDA) < 1 && bot.food < 8)) mina.fase = 'subir';
    await antorchas();
    if (mina.fase === 'bajar') {
      if (p.y <= mina.y + 2) { mina.fase = 'rama'; return true; }
      const ok = await cavar(p.x + mina.d[0] * 14, Math.max(mina.y, p.y - 10), p.z + mina.d[1] * 14, 30000);
      if (!ok) { mina.d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)]; if (++mina.legs > 8) mina.fase = 'subir'; }
      return true;
    }
    if (mina.fase === 'rama') {
      const ore = bot.findBlock({ maxDistance: 9, matching: (b) => b && re.test(b.name) });
      if (ore) {
        if (await cavar(ore.position.x, ore.position.y, ore.position.z, 20000)) { await romper(ore); sinMenasDesde = Date.now(); }
        return true;
      }
      if (mina.legs++ >= 7) { mina.fase = 'subir'; return true; }
      if (mina.legs % 2 === 0 && tiene(/^torch$/)) await colocar('torch');
      if (mina.legs % 3 === 0) mina.d = [mina.d[1], mina.d[0]]; // gira para no abrir un solo tunel
      await cavar(p.x + mina.d[0] * 10, p.y, p.z + mina.d[1] * 10, 25000);
      return true;
    }
    // subir
    const ok = await cavar(mina.sup.x, mina.sup.y, mina.sup.z, 40000);
    if (ok || distA(mina.sup) < 4) { console.log('[abasto] fin de mina'); mina = null; }
    else if (Date.now() - mina.t0 > 12 * 60_000) mina = null;
    return true;
  }

  // Obsidiana: agua sobre una fuente de lava, y se pica con pico de diamante.
  async function paso_obsidiana() {
    if (cuenta(/^obsidian$/) >= 6 || !tiene(/^diamond_pickaxe$/) || !tiene(/^water_bucket$/)) return 'nada';
    const lava = bot.findBlock({ maxDistance: 22, matching: (b) => b && b.name === 'lava' && b.metadata === 0 });
    if (!lava) return 'nada';
    if (!(await o.irCerca(bot, lava.position, 15000))) return false;
    const cubo = items().find((i) => i.name === 'water_bucket');
    await bot.equip(cubo, 'hand');
    await bot.lookAt(lava.position.offset(0.5, 0.9, 0.5), true);
    bot.activateItem();
    await dormir(900);
    const ob = bot.blockAt(lava.position);
    if (ob && ob.name === 'obsidian') return romper(ob);
    return false;
  }

  // Base: cofre (y mesa y horno al lado) en el primer sitio comodo; guarda el sobrante.
  async function paso_base() {
    if (base) return 'nada';
    if (cuenta(/_planks$/) < 8 + 4 && cuenta(/_log$/) < 4) return 'nada';
    if (!tiene(/^chest$/)) { if (cuenta(/_planks$/) < 8) await aTablones(); if (!(await craftear('chest'))) return false; }
    const c = await colocar('chest');
    if (!c) return false;
    base = { x: c.position.x, y: c.position.y, z: c.position.z };
    guardarBase();
    if (!bloqueN(/^crafting_table$/, 6)) await mesa();
    console.log('[abasto] base creada en', base.x, base.y, base.z);
    return true;
  }
  const CONSERVAR = /(_sword|_axe|_pickaxe|_shovel|_helmet|_chestplate|_leggings|_boots)$|^(shield|bow|crossbow|arrow|totem_of_undying|ender_pearl|water_bucket|bucket|mace|trident|wind_charge|end_crystal|obsidian|tnt|torch|crafting_table|furnace|chest|golden_apple|enchanted_golden_apple|gunpowder|diamond|iron_ingot|raw_iron|coal|stick|flint|feather)$|^cooked_|^(bread|apple|carrot|baked_potato)$/;
  async function paso_guardar() {
    if (!base) return 'nada';
    const usados = items().length;
    const sobra = items().filter((i) => !CONSERVAR.test(i.name) || (i.name === 'cobblestone' && i.count > 32));
    if (usados < 28 && sobra.length < 8) return 'nada';
    const cofre = bot.blockAt(new Vec3(base.x, base.y, base.z));
    if (!cofre || cofre.name !== 'chest') { base = null; guardarBase(); return false; }
    if (distA(base) > 4 && !(await o.irCerca(bot, cofre.position))) return false;
    const c = await bot.openContainer(cofre);
    try {
      for (const it of sobra) {
        const cant = it.name === 'cobblestone' ? it.count - 32 : it.count;
        if (cant > 0) { try { await c.deposit(it.type, null, cant); } catch (e) { break; } }
      }
    } finally { try { c.close(); } catch (e) { /* ignorar */ } }
    return true;
  }
  async function paso_recuperar() {
    if (!muerte) return 'nada';
    if (Date.now() - muerte.t > 5 * 60_000) { muerte = null; return 'nada'; }
    if (distA(muerte.p) > 3 && !(await cavar(muerte.p.x, muerte.p.y, muerte.p.z, 40000))) { if (Date.now() - muerte.t > 150_000) muerte = null; return false; }
    for (let k = 0; k < 8 && libre(); k++) {
      const drop = Object.values(bot.entities).find((e) => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 14);
      if (!drop) break;
      try { bot.pathfinder.setGoal(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0.6)); } catch (e) { /* ignorar */ }
      await dormir(1600);
    }
    muerte = null;
    return true;
  }
  const irBase = async () => { if (base && distA(base) > 18 && !noche()) await o.irCerca(bot, new Vec3(base.x, base.y, base.z), 20000); };


  // ===== Caza de mobs hostiles por drops y busqueda de items (sueltos y, si IA_SAQUEAR=1, cofres ajenos) =====
  const VALIOSO = /(diamond|iron_ingot|raw_iron|gold_ingot|coal|emerald|ender_pearl|golden_apple|totem_of_undying|obsidian|^tnt$|gunpowder|^string$|^arrow$|^bow$|crossbow|feather|bread|cooked_|^apple$|carrot|baked_potato|bucket|^shield$|_sword$|_pickaxe$|_axe$|_helmet$|_chestplate$|_leggings$|_boots$|^flint$|^stick$|^torch$|wind_charge|^mace$|trident|end_crystal|experience_bottle)/;
  const libreCaza = () => !jugadorCerca(36) && bot.health > 10 && bot.entity;
  const nombreDrop = (e) => { try { const d = e.getDroppedItem && e.getDroppedItem(); return d ? d.name : ''; } catch (x) { return ''; } };
  async function recoger(re, radio = 12) {
    let n = 0;
    for (let k = 0; k < 10 && libreCaza(); k++) {
      const drop = Object.values(bot.entities).filter((e) => e.name === 'item' && e.position.distanceTo(bot.entity.position) < radio && re.test(nombreDrop(e)))
        .sort((p, q) => p.position.distanceTo(bot.entity.position) - q.position.distanceTo(bot.entity.position))[0];
      if (!drop) break;
      try { bot.pathfinder.setGoal(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0.5)); } catch (e) { break; }
      for (let t = 0; t < 8 && bot.entities[drop.id]; t++) await dormir(250);
      n++;
    }
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    return n;
  }
  // Caza un mob: se acerca, golpea y, si "huida" (creeper), retrocede tras cada golpe para que no explote encima.
  async function cazarMob(re, huida) {
    const buscar = () => Object.values(bot.entities).filter((e) => re.test(e.name || '') && e.position.distanceTo(bot.entity.position) < 30)
      .sort((p, q) => p.position.distanceTo(bot.entity.position) - q.position.distanceTo(bot.entity.position))[0];
    const presa = buscar();
    if (!presa || bot.health < 14 || !items().some((i) => /_(sword|axe)$/.test(i.name))) return false;
    const arma = items().filter((i) => /_sword$/.test(i.name)).pop() || items().find((i) => /_axe$/.test(i.name));
    if (arma) await bot.equip(arma, 'hand').catch(() => {});
    const fin = Date.now() + 30_000; let ult = 0;
    while (Date.now() < fin && bot.entities[presa.id] && libreCaza()) {
      const d = presa.position.distanceTo(bot.entity.position);
      if (d > 3) { try { bot.pathfinder.setGoal(new goals.GoalNear(presa.position.x, presa.position.y, presa.position.z, 2)); } catch (e) { break; } }
      else {
        try { bot.pathfinder.setGoal(null); await bot.lookAt(presa.position.offset(0, presa.height / 2, 0), true); } catch (e) { /* ignorar */ }
        if (Date.now() - ult > 650) {
          ult = Date.now(); bot.attack(presa);
          if (huida) { bot.setControlState('back', true); bot.setControlState('sprint', true); await dormir(700); bot.setControlState('back', false); bot.setControlState('sprint', false); }
        }
      }
      await dormir(220);
    }
    await dormir(400);
    await recoger(VALIOSO, 12);
    return true;
  }
  const saqueados = new Set();
  async function saquear() {
    if (process.env.IA_SAQUEAR !== '1') return 'nada';
    const cofre = bot.findBlock({ maxDistance: 24, matching: (b) => b && /^(chest|barrel)$/.test(b.name) && !saqueados.has(b.position.toString()) && !(base && b.position.x === base.x && b.position.y === base.y && b.position.z === base.z) });
    if (!cofre) return 'nada';
    saqueados.add(cofre.position.toString());
    if (!(await o.irCerca(bot, cofre.position))) return false;
    const c = await bot.openContainer(cofre);
    try {
      for (const it of c.containerItems().filter((i) => VALIOSO.test(i.name)).slice(0, 8)) { try { await c.withdraw(it.type, null, it.count); } catch (e) { break; } }
    } finally { try { c.close(); } catch (e) { /* ignorar */ } }
    console.log('[abasto] cofre saqueado en', cofre.position.toString());
    return true;
  }

  // Cada necesidad devuelve: true si avanzo, false si no pudo (se enfria), 'nada' si no aplica.
  const necesidades = [
    ['recuperar', paso_recuperar],
    ['base', paso_base],
    ['guardar', paso_guardar],
    ['botin', async () => {
      const hay = Object.values(bot.entities).some((e) => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 24 && VALIOSO.test(nombreDrop(e)));
      if (hay) return (await recoger(VALIOSO, 24)) > 0;
      return saquear();
    }],
    ['claves', async () => {
      if (!o.claves) return 'nada';
      const pos = bot.entity.position;
      let re = null;
      const m = pico() ? regexMenas() : null;
      if (m) re = m;
      else if (tiene(/^bucket$/) && !tiene(/^water_bucket$/)) re = /^water$/;
      else if (tiene(/^diamond_pickaxe$/) && tiene(/^water_bucket$/) && cuenta(/^obsidian$/) < 6) re = /^lava$/;
      if (!re) return 'nada';
      const c = o.claves.cercano(re, pos, 150, o.peligro);
      if (!c) return 'nada';
      const b = bot.blockAt(new Vec3(c.x, c.y, c.z));
      if (b && !re.test(b.name)) { o.claves.olvidar(c); return 'nada'; }
      if (Math.hypot(c.x - pos.x, c.z - pos.z) < 6 && Math.abs(c.y - pos.y) < 4) { o.claves.olvidar(c); return 'nada'; }
      return cavar(c.x, c.y, c.z, 40000);
    }],
    ['cuerda', async () => {
      if (tiene(/^(bow|crossbow)$/)) return 'nada';
      if (cuenta(/^string$/) >= 3 && cuenta(/^stick$/) >= 3) return craftear('bow');
      if (cuenta(/^string$/) >= 3 && cuenta(/_planks$/) >= 2) return craftear('stick', 1);
      return cazarMob(/^spider$/, false);
    }],
    ['polvora', async () => (cuenta(/^gunpowder$/) >= 10 ? 'nada' : cazarMob(/^creeper$/, true))],
    ['esqueletos', async () => (tiene(/^(bow|crossbow)$/) && cuenta(/^arrow$/) < 16 ? cazarMob(/^skeleton$/, false) : 'nada')],
    ['mina', paso_mina],
    ['obsidiana', paso_obsidiana],
    ['madera', async () => {
      if (cuenta(/_log$|_planks$/) >= (base ? 14 : 24) || (noche() && enSuperficie())) return 'nada';
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
    ['equipo', async () => {
      if (!bloqueN(/^crafting_table$/, 24)) { if (tiene(/^crafting_table$/)) await colocar('crafting_table'); else return 'nada'; }
      await irBase(); await o.mejorar(bot); return true;
    }],
    ['carbon', async () => (cuenta(/^coal$/) >= 6 || !bloqueN(/^(deepslate_)?coal_ore$/, 24)) ? 'nada' : (await o.recolectar(bot, bloqueN(/^(deepslate_)?coal_ore$/, 24).name, 4)).ok],
    ['hierro', async () => {
      if (cuenta(/^(raw_iron|iron_ingot)$/) >= 26) return 'nada';
      const b = bloqueN(/^(deepslate_)?iron_ore$/, 28);
      if (!b) return 'nada';
      return (await o.recolectar(bot, b.name, 6)).ok;
    }],
    ['fundir', async () => tiene(/^raw_iron$/) ? cocinar('raw_iron') : 'nada'],
    ['carne', async () => tiene(/^(beef|porkchop|mutton|chicken|cod|salmon)$/) ? cocinar(items().find((i) => /^(beef|porkchop|mutton|chicken|cod|salmon)$/.test(i.name)).name) : 'nada'],
    ['comida', async () => (cuenta(COMIDA) >= 6 || (noche() && enSuperficie())) ? 'nada' : cazar(/^(cow|pig|sheep|chicken)$/)],
    ['escudo', async () => (tiene(/^shield$/) || !tiene(/^iron_ingot$/) || cuenta(/_planks$/) < 6) ? 'nada' : craftear('shield')],
    ['cubo', async () => {
      if (tiene(/^(bucket|water_bucket)$/) || cuenta(/^iron_ingot$/) < 3) return 'nada';
      return craftear('bucket');
    }],
    ['agua', async () => (tiene(/^bucket$/) && !tiene(/^water_bucket$/) && bloqueN(/^water$/, 24)) ? llenarCubo() : 'nada'],
    ['tnt', async () => {
      if (cuenta(/^tnt$/) >= 12) return 'nada';
      if (cuenta(/^gunpowder$/) >= 5 && cuenta(/^sand$/) >= 4) return craftear('tnt');
      if (cuenta(/^gunpowder$/) >= 5 && bloqueN(/^sand$/, 24)) return (await o.recolectar(bot, 'sand', 4)).ok;
      return 'nada';
    }],
    ['placa', async () => {
      if (cuenta(/^tnt$/) < 2 || tiene(/_pressure_plate$/)) return 'nada';
      const pl = items().find((i) => /_planks$/.test(i.name));
      if (!pl || pl.count < 2) return 'nada';
      return craftear(pl.name.replace('_planks', '_pressure_plate'), 1);
    }],
    ['cama', async () => {
      if (tiene(/_bed$/) || bloqueN(/_bed$/, 48)) return 'nada';
      const lana = items().find((i) => /_wool$/.test(i.name) && i.count >= 3);
      if (lana && cuenta(/_planks$/) >= 3) return craftear(lana.name.replace('_wool', '_bed'), 1);
      if (cuenta(/_planks$/) >= 3 && !noche() && cuenta(/_wool$/) < 3) return cazar(/^sheep$/);
      return 'nada';
    }],
    ['dormir', async () => {
      if (!noche() || bot.isSleeping) return 'nada';
      let cama = bloqueN(/_bed$/, 48);
      if (!cama) {
        const it = items().find((i) => /_bed$/.test(i.name));
        if (!it) return 'nada';
        if (!(await colocar(it.name))) return false;
        cama = bloqueN(/_bed$/, 8);
      }
      if (!cama) return false;
      if (cama.position.distanceTo(bot.entity.position) > 3 && !(await o.irCerca(bot, cama.position))) return false;
      try { await bot.sleep(cama); } catch (e) { return false; }
      const fin = Date.now() + 300_000;
      while (bot.isSleeping && Date.now() < fin) await dormir(2000);
      return true;
    }],
    ['basura', async () => {
      const mantener = { cobblestone: 64, dirt: 32, gravel: 16, andesite: 0, diorite: 0, granite: 0, tuff: 0, netherrack: 0, cobbled_deepslate: 0, rotten_flesh: 0, poisonous_potato: 0, spider_eye: 0, pufferfish: 0 };
      const lleno = items().length >= 32;
      for (const it of items()) {
        if (!(it.name in mantener)) continue;
        const sobra = it.count - mantener[it.name];
        if (sobra > 0 && (lleno || mantener[it.name] === 0 && /rotten|poison|spider|puffer/.test(it.name) || sobra > 64)) { try { await bot.toss(it.type, null, sobra); return true; } catch (e) { return false; } }
      }
      return 'nada';
    }],
    ['cosecha', async () => {
      const b = bot.findBlock({ maxDistance: 28, matching: (x) => x && /^(wheat|carrots|potatoes)$/.test(x.name) && x.metadata === 7 });
      if (!b) return 'nada';
      if (b.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, b.position))) return false;
      const semilla = { wheat: 'wheat_seeds', carrots: 'carrot', potatoes: 'potato' }[b.name];
      try { await bot.dig(b); } catch (e) { return false; }
      const it = items().find((i) => i.name === semilla);
      const suelo = bot.blockAt(b.position.offset(0, -1, 0));
      if (it && suelo && suelo.name === 'farmland') { try { await bot.equip(it, 'hand'); await bot.placeBlock(suelo, new Vec3(0, 1, 0)); } catch (e) { /* sin replantar */ } }
      return true;
    }],
    ['pan', async () => (cuenta(/^wheat$/) >= 3 && cuenta(/^bread$/) < 8) ? craftear('bread', 1) : 'nada'],
    ['comerciar', async () => {
      const yo = bot.entity.position;
      const al = Object.values(bot.entities).filter((e) => (e.name === 'villager' || e.name === 'wandering_trader') && e.position.distanceTo(yo) < 40 && (tratos.get(e.id) || 0) < Date.now())
        .sort((p, q) => p.position.distanceTo(yo) - q.position.distanceTo(yo))[0];
      if (!al) return 'nada';
      tratos.set(al.id, Date.now() + 300_000);
      if (al.position.distanceTo(yo) > 3.2 && !(await o.irCerca(bot, al.position))) return false;
      let v;
      try { v = await bot.openVillager(al); } catch (e) { return false; }
      try {
        if (!v.trades || !v.trades.length) await Promise.race([new Promise((r) => v.once('ready', r)), dormir(5000)]);
        let hecho = false;
        const tiene2 = (n) => cuenta(new RegExp('^' + n + '$'));
        const quiere = (n) => {
          if (/^(diamond_(helmet|chestplate|leggings|boots|sword|axe|pickaxe)|iron_(helmet|chestplate|leggings|boots|sword|pickaxe)|shield|bow|crossbow)$/.test(n)) return tiene2(n) ? 0 : 1;
          const tope = { arrow: 64, bread: 16, cooked_beef: 16, golden_apple: 3, ender_pearl: 4, experience_bottle: 8 }[n];
          return tope ? Math.max(0, tope - tiene2(n)) : 0;
        };
        const vende = { wheat: 20, carrot: 16, potato: 16, coal: 12, paper: 0, string: 6, bone: 16, gold_ingot: 8, rotten_flesh: 0, stick: 16, flint: 8, feather: 8 };
        for (let i = 0; i < v.trades.length; i++) {
          const t = v.trades[i];
          if (t.disabled || !t.firstInput || !t.output) continue;
          const usos = (t.maxTradeuses || 1) - (t.tooluses || 0);
          const a1 = t.firstInput, a2 = t.hasSecondItem ? t.secondaryInput : null;
          let veces = Math.min(usos, Math.floor(tiene2(a1.name) / a1.count));
          if (a2) veces = Math.min(veces, Math.floor(tiene2(a2.name) / a2.count));
          if (veces < 1) continue;
          if (t.output.name === 'emerald') {
            if (!(a1.name in vende) || a2) continue;
            veces = Math.min(veces, Math.floor((tiene2(a1.name) - vende[a1.name]) / a1.count));
          } else {
            if (a1.name !== 'emerald' && !(a2 && a2.name === 'emerald') && !/^(emerald|diamond|iron_ingot)$/.test(a1.name)) continue;
            veces = Math.min(veces, Math.floor(quiere(t.output.name) / t.output.count));
          }
          if (veces < 1) continue;
          try { await bot.trade(v, i, veces); hecho = true; diag.log('info', 'comercio', 'trato ' + t.output.name + ' x' + veces); } catch (e) { diag.log('warn', 'comercio', 'trato fallo: ' + e.message); }
          await dormir(300);
        }
        return hecho ? true : 'nada';
      } finally { try { v.close(); } catch (e) { /* ignorar */ } }
    }],
    ['cana', async () => {
      if (tiene(/^fishing_rod$/) || cuenta(/^stick$/) < 3 || cuenta(/^string$/) < 2) return 'nada';
      return craftear('fishing_rod', 1);
    }],
    ['pescar', async () => {
      if (!tiene(/^fishing_rod$/) || cuenta(COMIDA) >= 10 || (noche() && enSuperficie())) return 'nada';
      const agua = bloqueN(/^water$/, 28);
      if (!agua) return 'nada';
      if (agua.position.distanceTo(bot.entity.position) > 4 && !(await o.irCerca(bot, agua.position))) return false;
      const antes = cuenta(/^(cod|salmon|tropical_fish|pufferfish)$/);
      const fin = Date.now() + 150_000;
      try {
        await bot.equip(items().find((i) => i.name === 'fishing_rod'), 'hand');
        while (Date.now() < fin && libre() && cuenta(/^(cod|salmon)$/) - antes < 3) {
          await bot.lookAt(agua.position.offset(0.5, 0.9, 0.5), true);
          try { await Promise.race([bot.fish(), new Promise((_, rej) => setTimeout(() => rej(new Error('sin picar')), 40_000))]); }
          catch (e) { try { bot.activateItem(); } catch (x) { /* ignorar */ } await dormir(500); }
        }
      } catch (e) { return false; }
      return cuenta(/^(cod|salmon|tropical_fish|pufferfish)$/) > antes;
    }],
    ['flechas', async () => {
      if (!tiene(/^(bow|crossbow)$/) || cuenta(/^arrow$/) >= 24) return 'nada';
      if (cuenta(/^flint$/) >= 1 && cuenta(/^feather$/) >= 1 && cuenta(/^stick$/) >= 1) return craftear('arrow', 1);
      if (cuenta(/^flint$/) < 3 && bloqueN(/^gravel$/, 24)) return (await o.recolectar(bot, 'gravel', 4)).ok;
      if (cuenta(/^feather$/) < 3) return cazar(/^chicken$/);
      if (cuenta(/^arrow$/) < 8) return cazarMob(/^skeleton$/, false);
      return 'nada';
    }],
  ];

  // Prioridades segun el momento: urgencias primero (comida, armadura, flechas si hay jugadores), y de noche nada en superficie.
  function ordenar() {
    const frente = [];
    if (muerte) frente.push('recuperar');
    if (cuenta(COMIDA) < 3) frente.push('comida', 'carne', 'cosecha', 'pan');
    if (noche() && (tiene(/_bed$/) || bloqueN(/_bed$/, 48))) frente.push('dormir');
    if (items().length >= 32) frente.push('basura');
    if (!armaduraCompleta() && cuenta(/^iron_ingot$/) >= 4) frente.push('equipo');
    const hayJugadores = Object.keys(bot.players || {}).length > 1;
    if (hayJugadores && tiene(/^(bow|crossbow)$/) && cuenta(/^arrow$/) < 8) frente.push('flechas');
    if (bot._modoEquipo > Date.now()) frente.push('equipo', 'comerciar', 'botin', 'hierro', 'mina', 'claves', 'carbon', 'piedra', 'madera', 'comida');
    const rank = (n) => { const i = frente.indexOf(n); return i < 0 ? 100 : i; };
    return necesidades.map((x, i) => [x, i]).sort((p, q) => (rank(p[0][0]) - rank(q[0][0])) || (p[1] - q[1])).map((x) => x[0]);
  }

  const intervalo = setInterval(async () => {
    if (!ON || activo || !bot.entity || Date.now() - ultima < (ultimoOk ? 1200 : 6000)) return; // tras un exito sigue enseguida: siempre persigue la siguiente mejora
    if (!libre() || bot.health <= 12) return;
    activo = true; o.ocupar(true); ultimoOk = false;
    try {
      const orden = ordenar();
      diag.estado.metas = orden.filter((x) => (fallos[x[0]] || 0) <= Date.now()).slice(0, 4).map((x) => x[0]); // varias metas a la vista
      for (const [nombre, paso] of orden) {
        if (!libre()) break;
        if ((fallos[nombre] || 0) > Date.now()) continue;
        let r, motivo = 'no pudo completarlo (falta algo o no hay objetivo cerca)';
        try { r = await paso(); } catch (e) { r = false; motivo = 'error: ' + e.message; diag.log('error', 'abasto', nombre + ': ' + e.message); }
        if (r === 'nada') continue;
        if (!r) { fallos[nombre] = Date.now() + 120_000; const p = diag.estado.fallosPaso[nombre] || { n: 0 }; diag.estado.fallosPaso[nombre] = { n: p.n + 1, t: Date.now(), motivo }; diag.log('warn', 'abasto', nombre + ' fallo: ' + motivo); }
        else { ultimoOk = true; delete diag.estado.fallosPaso[nombre]; diag.log('info', 'abasto', 'paso ' + nombre); console.log('[abasto] paso:', nombre); }
        break; // un paso por ciclo
      }
    } finally {
      activo = false; o.ocupar(false); ultima = Date.now();
      try { if (!bot.pvp || !bot.pvp.target) bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      try { o.equipar(); } catch (e) { /* ignorar */ }
    }
  }, 4000);
  bot.once('end', () => clearInterval(intervalo));
  return { activo: () => activo, estado: () => ({ activo, ultima, base, mina: mina && mina.fase, enfriando: Object.keys(fallos).filter((k) => fallos[k] > Date.now()) }) };
}
module.exports = { crearAbasto };
