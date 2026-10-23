const { ignorado } = require('./modo');
// Pasos extra del abasto: encantar equipo, preparar pociones y asaltar bases de jugadores ausentes.
function crearExtras(h) {
  const { bot, goals, diag, o, items, cuenta, tiene, bloqueN, colocar, craftear, cocinar, libre, dormir, memoria, VALIOSO, buscarVar } = h;
  const ya = new Set();
  const asaltado = new Map();

  const textoItem = (i) => { try { return ((i.components ? JSON.stringify(i.components) : '') + (i.nbt ? JSON.stringify(i.nbt) : '') + ' ' + (i.displayName || '')).toLowerCase(); } catch (e) { return ''; } };
  const tienePoc = (re) => items().filter((i) => i.name === 'potion' && re.test(textoItem(i)));
  const enchantada = (i) => { try { return ya.has(i.name) || Object.keys(require('./encantos').leer(bot, i)).length > 0; } catch (e) { return false; } };
  const PRIO = [/_sword$/, /_chestplate$/, /_helmet$/, /_leggings$/, /_boots$/, /_pickaxe$/, /^bow$|^crossbow$/, /_axe$/, /^trident$/];
  const TIER = (n) => ['netherite', 'diamond', 'iron', 'golden', 'stone', 'leather', 'wooden', 'chainmail'].findIndex((t) => n.startsWith(t + '_')) + 1 || 9;
  const DEST = { 5: 'head', 6: 'torso', 7: 'legs', 8: 'feet' };

  async function encantar() {
    const nivel = (bot.experience && bot.experience.level) || 0;
    const lapis = items().find((i) => i.name === 'lapis_lazuli');
    if (nivel < 2 || !lapis) return 'nada';
    let cand = null;
    for (const re of PRIO) {
      const l = items().filter((i) => re.test(i.name) && !enchantada(i) && TIER(i.name) <= 3).sort((a, b) => TIER(a.name) - TIER(b.name));
      if (l.length) { cand = l[0]; break; }
    }
    if (!cand) return 'nada';
    let mesa = bloqueN(/^enchanting_table$/, 24);
    if (!mesa) { if (!tiene(/^enchanting_table$/)) return 'nada'; mesa = await colocar('enchanting_table'); if (!mesa) return false; }
    if (mesa.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, mesa.position))) return false;
    if (DEST[cand.slot]) { try { await bot.unequip(DEST[cand.slot]); } catch (e) { return false; } cand = items().find((i) => i.name === cand.name) || cand; }
    const t = await bot.openEnchantmentTable(mesa);
    try {
      await t.putTargetItem(cand);
      await t.putLapis(lapis);
      let op = null;
      for (let k = 0; k < 8 && !op; k++) {
        await dormir(300);
        const e = (t.enchantments || []).map((x, i) => ({ i, l: x.level })).filter((x) => x.l > 0 && x.l <= nivel && x.i + 1 <= lapis.count).sort((a, b) => b.l - a.l)[0];
        if (e) op = e;
      }
      if (!op) { try { await t.takeTargetItem(); } catch (e) { /* ignorar */ } return false; }
      await t.enchant(op.i);
      await dormir(400);
      try { await t.takeTargetItem(); } catch (e) { /* ignorar */ }
      ya.add(cand.name);
      diag.log('info', 'abasto', `encanto ${cand.name} (nivel ${op.l})`);
    } finally { try { t.close(); } catch (e) { /* ignorar */ } }
    try { o.equipar(); } catch (e) { /* ignorar */ }
    return true;
  }

  async function lapis() {
    const nivel = (bot.experience && bot.experience.level) || 0;
    if (nivel < 4 || cuenta(/^lapis_lazuli$/) >= 3 || !tiene(/^(stone|iron|diamond|netherite)_pickaxe$/)) return 'nada';
    if (!tiene(/^enchanting_table$/) && !bloqueN(/^enchanting_table$/, 48)) return 'nada';
    const b = buscarVar('lapis', /^(deepslate_)?lapis_ore$/, 32);
    if (!b) return 'nada';
    return (await o.recolectar(bot, b.name, 4)).ok;
  }

  // ---- Pociones ----
  async function botellas() {
    if (tienePoc(/water/).filter((i) => !/awkward/.test(textoItem(i))).length >= 3) return true;
    if (cuenta(/^glass_bottle$/) < 3) {
      if (cuenta(/^glass$/) < 3) { if (cuenta(/^sand$/) < 3) return false; if (!(await cocinar('sand'))) return false; }
      if (cuenta(/^glass$/) >= 3 && !(await craftear('glass_bottle', 1))) return false;
    }
    const agua = bloqueN(/^water$/, 24);
    if (!agua) return false;
    if (agua.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, agua.position))) return false;
    for (let k = 0; k < 3; k++) {
      const b = items().find((i) => i.name === 'glass_bottle');
      if (!b) break;
      try { await bot.equip(b, 'hand'); await bot.lookAt(agua.position.offset(0.5, 0.9, 0.5), true); bot.activateItem(); await dormir(450); } catch (e) { break; }
    }
    return tienePoc(/water/).length >= 3;
  }

  const slotInv = (w, re) => w.slots.findIndex((s, i) => i >= 5 && s && re(s));
  async function mover(w, desde, hasta) { await bot.moveSlotItem(desde, hasta); await dormir(120); }
  async function esperar(w, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin && libre()) { await dormir(1000); if (!w.slots[3]) return true; }
    return !w.slots[3];
  }
  async function sacar(w) {
    for (let s = 0; s < 3; s++) {
      if (!w.slots[s]) continue;
      const libreSlot = w.slots.findIndex((x, i) => i >= 5 && !x);
      if (libreSlot < 0) break;
      try { await mover(w, s, libreSlot); } catch (e) { break; }
    }
  }

  async function pociones() {
    let stand = bloqueN(/^brewing_stand$/, 24);
    const tengoStand = tiene(/^brewing_stand$/);
    if (!stand && !tengoStand) return 'nada';
    const wart = cuenta(/^nether_wart$/), polvo = cuenta(/^blaze_powder$/);
    const opciones = [
      ['healing', () => tiene(/^glistering_melon_slice$/), 'glistering_melon_slice'],
      ['strength', () => polvo >= 2, 'blaze_powder'],
      ['swiftness', () => tiene(/^sugar$/), 'sugar'],
      ['fire_resistance', () => tiene(/^magma_cream$/), 'magma_cream'],
    ].filter((x) => x[1]() && cuenta(/^potion$/) < 12);
    if (stand) {
      // puede haber pociones olvidadas dentro
      if (stand.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, stand.position))) return false;
    }
    if (!opciones.length || wart < 1 || polvo < 1) return 'nada';
    if (!(await botellas())) return false;
    if (!stand) { stand = await colocar('brewing_stand'); if (!stand) return false; }
    if (stand.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, stand.position))) return false;
    const [nombre, , ing] = opciones[Math.floor(Math.random() * opciones.length)];
    const w = await bot.openContainer(stand);
    try {
      await sacar(w);
      const botes = [];
      for (let k = 0; k < 3; k++) { const s = slotInv(w, (x) => x.name === 'potion' && /water/.test(textoItem(x)) && !/awkward/.test(textoItem(x))); if (s < 0) break; await mover(w, s, k); botes.push(k); }
      if (botes.length < 3) { await sacar(w); return false; }
      if (!w.slots[4]) { const s = slotInv(w, (x) => x.name === 'blaze_powder'); if (s >= 0) await mover(w, s, 4); }
      let s = slotInv(w, (x) => x.name === 'nether_wart');
      if (s < 0) { await sacar(w); return false; }
      await mover(w, s, 3);
      if (!(await esperar(w, 26_000))) return false;
      s = slotInv(w, (x) => x.name === ing);
      if (s < 0) { await sacar(w); return false; }
      await mover(w, s, 3);
      if (!(await esperar(w, 26_000))) return false;
      await sacar(w);
    } finally { try { w.close(); } catch (e) { /* ignorar */ } }
    diag.log('info', 'abasto', 'preparo pociones de ' + nombre);
    return true;
  }

  // ---- Asalto a la base de un jugador ausente ----
  const esAlmacen = (b) => b && /^(chest|barrel|trapped_chest)$/.test(b.name);
  const esVida = (b) => b && /^(chest|barrel|furnace|blast_furnace|smoker|crafting_table|enchanting_table|brewing_stand|anvil|_bed)$|_bed$/.test(b.name);

  async function asalto() {
    if (process.env.IA_ASALTO === '0' || bot.health < 16 || !tiene(/_(sword|axe|pickaxe)$/)) return 'nada';
    const ahora = Date.now();
    const nombres = Object.keys(bot.players || {}).filter((n) => n !== bot.username && !ignorado(bot, n) && (asaltado.get(n) || 0) < ahora);
    const vistos = new Set(Object.values(bot.entities).filter((e) => e.type === 'player').map((e) => e.username));
    const c = nombres.filter((n) => !vistos.has(n) && (memoria.zonaHabitual(n) || memoria.ultimo(n))).map((n) => { const v = memoria.vec(n); return { n, p: v.rencor + v.obsesion + v.desprecio * 0.5 }; }).filter((x) => x.p >= 3).sort((a, b) => b.p - a.p)[0];
    if (!c) return 'nada';
    asaltado.set(c.n, ahora + 12 * 60_000);
    const z = memoria.zonaHabitual(c.n), u = memoria.ultimo(c.n);
    const dest = z || u;
    diag.log('info', 'abasto', 'asalto: va hacia la zona de ' + c.n);
    try {
      await Promise.race([bot.pathfinder.goto(new goals.GoalNear(dest.x, u && u.y ? u.y : bot.entity.position.y, dest.z, 8)), dormir(120_000)]);
    } catch (e) { /* ignorar */ }
    try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    if (!libre()) return true;
    const pos = bot.findBlocks({ matching: (b) => esVida(b), maxDistance: 32, count: 60 }).map((p) => bot.blockAt(p)).filter((b) => b && !(h.base && b.position.x === h.base.x && b.position.y === h.base.y && b.position.z === h.base.z));
    if (pos.length < 3) { diag.log('info', 'abasto', 'asalto: sin base a la vista'); return true; }
    if (bot._stats) bot._stats.sumar('sadismo', 1);
    const cofres = pos.filter(esAlmacen).slice(0, 5);
    let botin = 0;
    for (const cb of cofres) {
      if (!libre()) return true;
      try {
        if (cb.position.distanceTo(bot.entity.position) > 3.5) { try { await Promise.race([bot.pathfinder.goto(new goals.GoalNear(cb.position.x, cb.position.y, cb.position.z, 2)), dormir(25_000)]); } catch (e) { continue; } }
        const w = await bot.openContainer(bot.blockAt(cb.position));
        try { for (const it of w.containerItems().filter((i) => VALIOSO.test(i.name)).slice(0, 10)) { try { await w.withdraw(it.type, null, it.count); botin++; } catch (e) { break; } } }
        finally { try { w.close(); } catch (e) { /* ignorar */ } }
      } catch (e) { /* siguiente */ }
    }
    diag.log('info', 'abasto', `asalto a ${c.n}: ${cofres.length} cofres, ${botin} pilas`);
    // destruccion final con TNT: solo con sadismo alto
    const sad = bot._sadismo ? bot._sadismo() : 1;
    if (cuenta(/^tnt$/) >= 3 && tiene(/^flint_and_steel$/) && sad > 1.15 && Math.random() < 0.5 && libre()) {
      let ultimo = null;
      for (let k = 0; k < 3; k++) { const t = await colocar('tnt'); if (t) ultimo = t; }
      if (ultimo) {
        try {
          const f = items().find((i) => i.name === 'flint_and_steel');
          await bot.equip(f, 'hand'); await bot.activateBlock(ultimo);
          const p = bot.entity.position, a = Math.random() * Math.PI * 2;
          bot.pathfinder.setGoal(new goals.GoalXZ(Math.round(p.x + Math.cos(a) * 20), Math.round(p.z + Math.sin(a) * 20)));
          diag.log('info', 'abasto', 'asalto: tnt encendido');
          await dormir(7000);
        } catch (e) { /* ignorar */ }
      }
    }
    return true;
  }

  return { encantar, lapis, pociones, asalto };
}
module.exports = { crearExtras };
