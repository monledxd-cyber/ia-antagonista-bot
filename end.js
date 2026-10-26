// Expedicion al End (opt-in con IA_END=1): localiza la fortaleza con ojos de ender, activa el portal y pelea contra el dragon.
function crearEnd(h) {
  const { bot, goals, diag, items, cuenta, tiene, libre, dormir, craftear } = h;
  const dim = () => String((bot.game && bot.game.dimension) || '');
  const enEnd = () => /the_end/.test(dim());
  const enOver = () => !/nether|the_end/.test(dim());
  let activo = false, ultIntento = 0, dragonMuerto = false;
  const estado = (f) => { diag.estado.end = f; diag.log('info', 'end', f); };
  const conTope = (p, ms) => Promise.race([p, dormir(ms)]);
  const ir = async (x, y, z, r = 2, ms = 30_000) => { try { await conTope(bot.pathfinder.goto(new goals.GoalNear(x, y, z, r)), ms); } catch (e) { /* ignorar */ } try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ } };
  const irXZ = async (x, z, ms = 40_000) => { try { await conTope(bot.pathfinder.goto(new goals.GoalXZ(Math.round(x), Math.round(z))), ms); } catch (e) { /* ignorar */ } try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ } };

  const equipoOk = () => [5, 6, 7, 8].every((s) => bot.inventory.slots[s]);
  const quiere = () => process.env.IA_END === '1' && enOver() && !activo && Date.now() - ultIntento > 30 * 60_000 && (cuenta(/^ender_eye$/) >= 12 || (cuenta(/^ender_pearl$/) >= 12 && cuenta(/^blaze_powder$/) >= 12)) &&
    tiene(/^bow$/) && cuenta(/^arrow$/) >= 32 && tiene(/^water_bucket$/) && cuenta(/^(cobblestone|dirt|netherrack|cobbled_deepslate)$/) >= 64 && cuenta(/^(cooked_[a-z_]+|bread|baked_potato|golden_apple)$/) >= 10 && equipoOk() && tiene(/_sword$/) && bot.health >= 20;

  async function ojos() {
    while (cuenta(/^ender_eye$/) < 12 && cuenta(/^ender_pearl$/) >= 1 && cuenta(/^blaze_powder$/) >= 1) { if (!(await craftear('ender_eye', 1))) break; }
    return cuenta(/^ender_eye$/) >= 12;
  }

  const ojoVolador = () => Object.values(bot.entities).find((e) => e.name === 'eye_of_ender' && e.position.distanceTo(bot.entity.position) < 40);
  async function localizar() {
    estado('buscando la fortaleza');
    for (let k = 0; k < 12 && activo; k++) {
      const ojo = items().find((i) => i.name === 'ender_eye');
      if (!ojo) return false;
      const p0 = bot.entity.position.clone();
      await bot.equip(ojo, 'hand'); bot.activateItem();
      let e = null; for (let t = 0; t < 12 && !e; t++) { await dormir(150); e = ojoVolador(); }
      if (!e) continue;
      await dormir(1500);
      const e2 = bot.entities[e.id] || e;
      const dx = e2.position.x - p0.x, dz = e2.position.z - p0.z, d = Math.hypot(dx, dz);
      if (d < 3) return true; // el ojo cae: la fortaleza esta casi debajo
      await irXZ(p0.x + (dx / d) * 80, p0.z + (dz / d) * 80, 60_000);
    }
    return false;
  }

  const frames = () => bot.findBlocks({ matching: (b) => b && b.name === 'end_portal_frame', maxDistance: 40, count: 16 });
  async function bajar() {
    estado('cavando hacia la fortaleza');
    const t0 = Date.now();
    while (activo && Date.now() - t0 < 120_000 && libre() && bot.entity.position.y > 8) {
      if (frames().length) return true;
      const p = bot.entity.position.floored();
      const b1 = bot.blockAt(p.offset(0, -1, 0)), b2 = bot.blockAt(p.offset(0, -2, 0));
      if (!b1 || !b2 || /lava|water/.test(b2.name) || /lava/.test(b1.name)) { await irXZ(p.x + (Math.random() - 0.5) * 8, p.z + (Math.random() - 0.5) * 8, 8000); continue; }
      try { await bot.dig(b1); } catch (e) { /* ignorar */ }
      await dormir(250);
    }
    return frames().length > 0;
  }

  async function activarPortal() {
    estado('colocando ojos');
    for (const pos of frames()) {
      const b = bot.blockAt(pos);
      let conOjo = false;
      try { conOjo = !!(b.getProperties && b.getProperties().eye); } catch (e) { /* ignorar */ }
      if (conOjo || !tiene(/^ender_eye$/)) continue;
      await ir(pos.x, pos.y, pos.z, 2, 15_000);
      try { await bot.equip(items().find((i) => i.name === 'ender_eye'), 'hand'); await bot.activateBlock(bot.blockAt(pos)); } catch (e) { /* ignorar */ }
      await dormir(250);
    }
    const portal = bot.findBlock({ matching: (b) => b && b.name === 'end_portal', maxDistance: 20 });
    return portal ? portal.position : null;
  }

  async function pelea() {
    estado('pelea del dragon');
    const t0 = Date.now(); let ultTiro = 0;
    const arco = () => items().find((i) => i.name === 'bow');
    while (enEnd() && Date.now() - t0 < 12 * 60_000 && !dragonMuerto && bot.health > 0) {
      const d = Object.values(bot.entities).find((e) => e.name === 'ender_dragon');
      const cr = Object.values(bot.entities).filter((e) => e.name === 'end_crystal' && e.position.distanceTo(bot.entity.position) < 60).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
      if (cr && arco() && cuenta(/^arrow$/) > 0 && Date.now() - ultTiro > 1200 && bot._disparar) { ultTiro = Date.now(); try { await bot._disparar(cr, arco()); } catch (e) { /* ignorar */ } }
      else if (d && d.position.distanceTo(bot.entity.position) < 9) {
        const espada = items().find((i) => /_sword$/.test(i.name)); if (espada) await bot.equip(espada, 'hand').catch(() => {});
        try { if (bot.pvp) bot.pvp.attack(d); } catch (e) { /* ignorar */ }
      } else if (!cr && bot.pvp && bot.pvp.target) { try { bot.pvp.stop(); } catch (e) { /* ignorar */ } }
      await dormir(300);
    }
    return dragonMuerto;
  }


  const BOTIN = /^(elytra|diamond|iron_ingot|gold_ingot|emerald|ender_pearl|enchanted_|[a-z_]*shulker|saddle|dragon_head|netherite_|[a-z_]*_horse_armor|beetroot|name_tag|golden_apple|diamond_[a-z]+|iron_[a-z]+|gold_[a-z]+)/;
  async function irGateway() {
    const g = bot.findBlock({ matching: (b) => b && b.name === 'end_gateway', maxDistance: 140 });
    if (!g) return false;
    const origen = bot.entity.position.clone();
    for (let k = 0; k < 4 && cuenta(/^ender_pearl$/) >= 1 && enEnd(); k++) {
      const a = Math.random() * Math.PI * 2, r = 9 + k * 2;
      await ir(g.position.x + Math.cos(a) * r, g.position.y, g.position.z + Math.sin(a) * r, 2, 25_000);
      const p = bot.entity.position, dist = Math.hypot(g.position.x - p.x, g.position.z - p.z);
      try {
        await bot.equip(items().find((i) => i.name === 'ender_pearl'), 'hand');
        await bot.lookAt(g.position.offset(0.5, 0.5 + dist * 0.08, 0.5), true);
        bot.activateItem(); await dormir(300); try { bot.deactivateItem(); } catch (x) { /* ignorar */ }
      } catch (x) { continue; }
      await dormir(3500);
      if (bot.entity.position.distanceTo(origen) > 300) return true;
    }
    return false;
  }
  async function saquearCiudad() {
    const t0 = Date.now(); let botin = 0;
    const visitados = new Set();
    while (enEnd() && Date.now() - t0 < 10 * 60_000 && bot.health >= 10) {
      const nave = bot.findBlock({ matching: (b) => b && /^dragon_(wall_)?head$/.test(b.name), maxDistance: 100 });
      const ciudad = nave || bot.findBlock({ matching: (b) => b && /^(purpur_block|purpur_pillar|end_stone_bricks)$/.test(b.name), maxDistance: 128 });
      if (!ciudad) { const p = bot.entity.position, a = Math.random() * Math.PI * 2; await irXZ(p.x + Math.cos(a) * 60, p.z + Math.sin(a) * 60, 40_000); continue; }
      await ir(ciudad.position.x, ciudad.position.y + 1, ciudad.position.z, 3, 40_000);
      if (nave) {
        for (const f of Object.values(bot.entities).filter((x) => /item_frame/.test(x.name || '') && x.position.distanceTo(bot.entity.position) < 16)) {
          if (f.position.distanceTo(bot.entity.position) > 3) await ir(f.position.x, f.position.y, f.position.z, 2, 8000);
          try { await bot.lookAt(f.position, true); bot.attack(f); } catch (x) { /* ignorar */ }
          await dormir(400);
        }
        for (let k = 0; k < 6; k++) {
          const it = Object.values(bot.entities).find((x) => x.name === 'item' && x.position.distanceTo(bot.entity.position) < 20);
          if (!it) break;
          await ir(it.position.x, it.position.y, it.position.z, 0.6, 6000);
        }
        if (tiene(/^elytra$/)) { estado('elytra conseguida'); return true; }
      }
      for (const p of bot.findBlocks({ matching: bot.registry.blocksByName.chest.id, maxDistance: 48, count: 8 }).filter((q) => !visitados.has(q.toString())).slice(0, 4)) {
        if (bot.health < 10) break;
        visitados.add(p.toString());
        await ir(p.x, p.y, p.z, 2, 20_000);
        const b = bot.blockAt(p);
        if (!b || b.name !== 'chest') continue;
        try {
          const w = await bot.openContainer(b);
          try { for (const i of w.containerItems().filter((x) => BOTIN.test(x.name)).slice(0, 12)) { try { await w.withdraw(i.type, null, i.count); botin++; } catch (x) { break; } } }
          finally { try { w.close(); } catch (x) { /* ignorar */ } }
        } catch (x) { /* siguiente */ }
      }
      if (tiene(/^elytra$/)) return true;
      if (!nave) { const p = bot.entity.position, a = Math.random() * Math.PI * 2; await irXZ(p.x + Math.cos(a) * 40, p.z + Math.sin(a) * 40, 30_000); }
    }
    return botin > 0;
  }
  async function ciudadEnd() {
    if (process.env.IA_END_CIUDAD !== '1' || !dragonMuerto || bot.health < 18 || cuenta(/^ender_pearl$/) < 1) return false;
    estado('rumbo a las islas exteriores');
    if (!(await irGateway())) return false;
    estado('buscando ciudad del End');
    const ok = await saquearCiudad();
    const g = bot.findBlock({ matching: (b) => b && b.name === 'end_gateway', maxDistance: 140 });
    if (g && enEnd()) { try { bot.pathfinder.setGoal(new goals.GoalBlock(g.position.x, g.position.y, g.position.z)); } catch (x) { /* ignorar */ } await dormir(8000); try { bot.pathfinder.setGoal(null); } catch (x) { /* ignorar */ } }
    return ok;
  }

  bot.on('entityDead', (e) => { if (e && e.name === 'ender_dragon') dragonMuerto = true; });

  async function expedicion() {
    if (activo) return 'nada';
    if (!quiere() || !libre()) return 'nada';
    activo = true; ultIntento = Date.now(); dragonMuerto = false;
    try {
      if (!(await ojos())) return false;
      if (!(await localizar())) return false;
      if (!(await bajar())) return false;
      const portal = await activarPortal();
      if (!portal) return false;
      estado('entrando al End');
      await ir(portal.x, portal.y, portal.z, 0, 10_000);
      for (let k = 0; k < 20 && !enEnd(); k++) { try { bot.pathfinder.setGoal(new goals.GoalBlock(portal.x, portal.y, portal.z)); } catch (e) { /* ignorar */ } await dormir(500); }
      if (!enEnd()) return false;
      await dormir(2000);
      const ok = await pelea();
      estado(ok ? 'dragon derrotado' : 'pelea terminada sin victoria');
      if (ok) { try { await ciudadEnd(); } catch (x) { diag.log('error', 'end', 'ciudad: ' + x.message); } }
      await irXZ(0, 0, 40_000);
      return true;
    } catch (e) { diag.log('error', 'end', e.message); return false; } finally { activo = false; }
  }
  return { expedicion, quiere };
}
module.exports = { crearEnd };
