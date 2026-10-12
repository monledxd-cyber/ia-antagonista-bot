const { Vec3 } = require('vec3');

// Expedicion al Nether: construye el portal, busca la fortaleza, caza blazes, recoge nether wart y vuelve.
function crearNether(h) {
  const { bot, goals, diag, items, cuenta, tiene, libre, dormir } = h;
  const dim = () => String((bot.game && bot.game.dimension) || '');
  const enNether = () => /nether/.test(dim());
  const enOver = () => !/nether|end/.test(dim());
  let activo = false, fase = '', portalN = null, ultIntento = 0, t0 = 0;
  const estado = (f) => { fase = f; diag.estado.nether = f; diag.log('info', 'nether', f); };
  const conTope = (p, ms) => Promise.race([p, dormir(ms)]);
  const ir = async (x, y, z, r = 2, ms = 30_000) => { try { await conTope(bot.pathfinder.goto(new goals.GoalNear(x, y, z, r)), ms); } catch (e) { /* ignorar */ } try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ } };

  const comida = () => cuenta(/^(cooked_[a-z_]+|bread|baked_potato|apple|carrot|golden_carrot)$/);
  const equipoOk = () => [5, 6, 7, 8].every((s) => bot.inventory.slots[s]);
  const quiere = () => enOver() && !activo && Date.now() - ultIntento > 15 * 60_000 && tiene(/^(iron|diamond|netherite)_pickaxe$/) && tiene(/_sword$/) && equipoOk() && tiene(/^flint_and_steel$/) && comida() >= 6 && cuenta(/^(cobblestone|dirt|netherrack|cobbled_deepslate)$/) >= 24 && bot.health >= 18 && !(cuenta(/^blaze_rod$/) >= 3 && cuenta(/^nether_wart$/) >= 3);
  const listo = () => quiere() && cuenta(/^obsidian$/) >= 10;

  async function poner(nombre, ref, cara) {
    const it = items().find((i) => i.name === nombre);
    if (!it) throw new Error('sin ' + nombre);
    const b = bot.blockAt(ref);
    if (!b || b.boundingBox !== 'block') throw new Error('sin referencia');
    if (b.position.distanceTo(bot.entity.position) > 4.2) await ir(ref.x, ref.y, ref.z + 2, 1, 8000);
    await bot.equip(it, 'hand');
    await bot.placeBlock(b, cara);
  }

  function sitio() {
    const c = bot.entity.position.floored();
    for (let r = 2; r <= 10; r++) for (let a = 0; a < 360; a += 45) {
      const x0 = c.x + Math.round(Math.cos((a * Math.PI) / 180) * r), z0 = c.z + Math.round(Math.sin((a * Math.PI) / 180) * r), y0 = c.y;
      let ok = true;
      for (let dx = 0; dx <= 3 && ok; dx++) {
        const s = bot.blockAt(new Vec3(x0 + dx, y0 - 1, z0));
        if (!s || s.boundingBox !== 'block') ok = false;
        for (let dy = 0; dy <= 4 && ok; dy++) for (let dz = -1; dz <= 2 && ok; dz++) { const b = bot.blockAt(new Vec3(x0 + dx, y0 + dy, z0 + dz)); if (!b || b.boundingBox !== 'empty') ok = false; }
      }
      if (ok) return new Vec3(x0, y0, z0);
    }
    return null;
  }

  async function construir() {
    estado('construyendo portal');
    const s = sitio();
    if (!s) return null;
    const P = (x, y, z) => s.offset(x, y, z), U = new Vec3(0, 1, 0), E = new Vec3(1, 0, 0);
    await ir(s.x + 1.5, s.y, s.z + 2.5, 1, 12_000);
    await poner('cobblestone', P(0, -1, 0), U); await poner('cobblestone', P(3, -1, 0), U);
    await poner('obsidian', P(1, -1, 0), U); await poner('obsidian', P(2, -1, 0), U);
    for (const x of [0, 3]) for (let y = 1; y <= 3; y++) await poner('obsidian', P(x, y - 1, 0), U);
    await poner('cobblestone', P(0, 3, 0), U); await poner('cobblestone', P(3, 3, 0), U);
    await poner('obsidian', P(0, 4, 0), E); await poner('obsidian', P(1, 4, 0), E);
    return s;
  }

  async function encender(s) {
    const fyl = items().find((i) => i.name === 'flint_and_steel');
    await bot.equip(fyl, 'hand');
    await ir(s.x + 1.5, s.y, s.z + 2.5, 1, 8000);
    await bot.activateBlock(bot.blockAt(s.offset(1, 0, 0)), new Vec3(0, 1, 0));
    await dormir(1200);
    return !!bot.findBlock({ matching: (b) => b && b.name === 'nether_portal', maxDistance: 8 });
  }

  async function entrar(p) {
    estado('entrando al portal');
    try { bot.pathfinder.setGoal(new goals.GoalBlock(p.x, p.y, p.z)); } catch (e) { /* ignorar */ }
    for (let k = 0; k < 40 && !enNether(); k++) await dormir(500);
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    if (!enNether()) return false;
    await dormir(1500);
    portalN = bot.entity.position.clone();
    return true;
  }

  function endurecer() {
    try {
      const m = bot.pathfinder.movements;
      for (const n of ['magma_block', 'soul_fire', 'campfire', 'soul_campfire', 'sweet_berry_bush', 'wither_rose', 'cactus']) if (bot.registry.blocksByName[n]) m.blocksToAvoid.add(bot.registry.blocksByName[n].id);
    } catch (e) { /* ignorar */ }
  }

  const mob = (re, r) => Object.values(bot.entities).filter((e) => re.test(e.name || '') && e.position.distanceTo(bot.entity.position) < r).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
  const seguro = () => bot.health >= 9 && bot.food >= 6 && !mob(/^piglin_brute$/, 18) && !(bot.health < 13 && mob(/^ghast$/, 32)) && Date.now() - t0 < 20 * 60_000 && bot.entity.position.y > 5;

  async function volver() {
    estado('volviendo');
    if (portalN) await ir(portalN.x, portalN.y, portalN.z, 1, 40_000);
    for (let k = 0; k < 20 && enNether(); k++) {
      const p = bot.findBlock({ matching: (b) => b && b.name === 'nether_portal', maxDistance: 48 });
      if (p) { try { bot.pathfinder.setGoal(new goals.GoalBlock(p.position.x, p.position.y, p.position.z)); } catch (e) { /* ignorar */ } }
      await dormir(1500);
    }
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    return !enNether();
  }

  async function recogerBlaze() {
    for (let k = 0; k < 6; k++) {
      const it = Object.values(bot.entities).find((e) => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 20 && (() => { try { const d = e.getDroppedItem && e.getDroppedItem(); return d && /blaze_rod|nether_wart/.test(d.name); } catch (x) { return false; } })());
      if (!it) return;
      await ir(it.position.x, it.position.y, it.position.z, 0.6, 8000);
    }
  }
  async function pelearBlazes() {
    const fin = Date.now() + 60_000;
    while (Date.now() < fin && activo && seguro() && cuenta(/^blaze_rod$/) < 4) {
      const b = mob(/^blaze$/, 24);
      if (!b) { await dormir(1500); continue; }
      const arma = items().find((i) => /_sword$/.test(i.name)); if (arma) await bot.equip(arma, 'hand').catch(() => {});
      const d = b.position.distanceTo(bot.entity.position);
      if (d > 3) { try { bot.pathfinder.setGoal(new goals.GoalNear(b.position.x, b.position.y, b.position.z, 2)); } catch (e) { /* ignorar */ } }
      else { try { bot.pathfinder.setGoal(null); await bot.lookAt(b.position.offset(0, b.height / 2, 0), true); bot.attack(b); } catch (e) { /* ignorar */ } }
      await dormir(350);
    }
    await recogerBlaze();
  }
  async function wart() {
    for (let k = 0; k < 4 && cuenta(/^nether_wart$/) < 6; k++) {
      const w = bot.findBlock({ matching: (b) => b && b.name === 'nether_wart', maxDistance: 40 });
      if (!w) return;
      await ir(w.position.x, w.position.y, w.position.z, 2, 15_000);
      try { await bot.dig(bot.blockAt(w.position)); } catch (e) { /* ignorar */ }
      await recogerBlaze();
    }
  }

  async function explorar() {
    estado('buscando fortaleza');
    let rumbo = Math.random() * Math.PI * 2;
    while (activo && seguro() && !(cuenta(/^blaze_rod$/) >= 4 && cuenta(/^nether_wart$/) >= 3)) {
      const f = bot.findBlock({ matching: (b) => b && /^(nether_bricks|nether_brick_fence|nether_brick_stairs)$/.test(b.name), maxDistance: 100 });
      if (f) {
        estado('en la fortaleza');
        await ir(f.position.x, f.position.y + 1, f.position.z, 3, 40_000);
        const sp = bot.findBlock({ matching: (b) => b && b.name === 'spawner', maxDistance: 40 });
        if (sp) { await ir(sp.position.x, sp.position.y, sp.position.z, 6, 30_000); await pelearBlazes(); }
        await wart();
        if (!sp) await ir(f.position.x + (Math.random() - 0.5) * 30, f.position.y, f.position.z + (Math.random() - 0.5) * 30, 3, 25_000);
      } else {
        rumbo += (Math.random() - 0.5) * 1.2;
        const p = bot.entity.position;
        await ir(p.x + Math.cos(rumbo) * 40, p.y, p.z + Math.sin(rumbo) * 40, 4, 30_000);
      }
    }
  }

  const reflejo = setInterval(() => {
    if (!activo || !enNether() || !bot.entity) return;
    const e = mob(/^(blaze|magma_cube|wither_skeleton|hoglin|piglin_brute|skeleton|zoglin)$/, 3.4);
    if (e) { try { bot.lookAt(e.position.offset(0, e.height / 2, 0), true); bot.attack(e); } catch (x) { /* ignorar */ } }
  }, 450);
  bot.once('end', () => clearInterval(reflejo));

  async function expedicion() {
    if (activo) return 'nada';
    if (enNether()) { activo = true; try { endurecer(); return await volver(); } finally { activo = false; } }
    if (!listo() || !libre()) return 'nada';
    activo = true; ultIntento = Date.now(); t0 = Date.now();
    const rods0 = cuenta(/^blaze_rod$/), wart0 = cuenta(/^nether_wart$/);
    try {
      let s = null;
      const existente = bot.findBlock({ matching: (b) => b && b.name === 'nether_portal', maxDistance: 32 });
      let dentro = null;
      if (existente) dentro = existente.position;
      else {
        s = await construir();
        if (!s) { estado('sin sitio para el portal'); return false; }
        if (!(await encender(s))) { estado('no encendio'); return false; }
        dentro = s.offset(1, 1, 0);
      }
      if (!(await entrar(dentro))) return false;
      endurecer();
      await explorar();
      await volver();
      estado('expedicion terminada');
      return cuenta(/^blaze_rod$/) > rods0 || cuenta(/^nether_wart$/) > wart0 || true;
    } catch (e) {
      diag.log('error', 'nether', e.message);
      if (enNether()) await volver().catch(() => {});
      return false;
    } finally { activo = false; try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ } }
  }

  bot.on('spawn', () => { if (!activo && enNether()) setTimeout(() => { expedicion().catch(() => {}); }, 3000); });
  return { expedicion, quiere, listo, enNether };
}
module.exports = { crearNether };
