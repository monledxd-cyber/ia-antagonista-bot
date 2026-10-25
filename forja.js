const fs = require('fs');
const { Vec3 } = require('vec3');

function crearForja(h) {
  const { bot, diag, o, items, cuenta, tiene, bloqueN, colocar, craftear, cocinar, libre, dormir, ruta } = h;
  let granja = [];
  let ultLog = 0;
  try { granja = JSON.parse(fs.readFileSync(ruta, 'utf8')) || []; } catch (e) { granja = []; }
  const guardar = () => { try { fs.writeFileSync(ruta, JSON.stringify(granja)); } catch (e) { /* ignorar */ } };
  const log = (m) => { diag.log('info', 'forja', m); };

  const PIEZAS = [/_sword$/, /_chestplate$/, /_leggings$/, /_helmet$/, /_boots$/, /_pickaxe$/, /_axe$/];
  const DEST = { 5: 'head', 6: 'torso', 7: 'legs', 8: 'feet' };
  const mejorables = () => items().filter((i) => /^diamond_(sword|chestplate|leggings|helmet|boots|pickaxe|axe)$/.test(i.name))
    .concat([5, 6, 7, 8].map((s) => bot.inventory.slots[s]).filter((i) => i && /^diamond_/.test(i.name)));
  const pendientes = () => mejorables().length;

  const lingotes = () => cuenta(/^netherite_ingot$/);
  const scrap = () => cuenta(/^netherite_scrap$/);
  const plantillas = () => cuenta(/^netherite_upgrade_smithing_template$/);
  const oroLingotes = () => cuenta(/^gold_ingot$/);

  async function fundir() {
    if (!tiene(/^ancient_debris$/)) return 'nada';
    return cocinar('ancient_debris');
  }

  async function hacerLingote() {
    if (scrap() < 4) return 'nada';
    if (oroLingotes() < 4) {
      if (cuenta(/^gold_block$/) >= 1 && await craftear('gold_ingot', 1)) return true;
      return 'nada';
    }
    return craftear('netherite_ingot', 1);
  }

  async function duplicarPlantilla() {
    if (plantillas() < 1 || plantillas() >= Math.min(3, pendientes())) return 'nada';
    if (cuenta(/^diamond$/) < 7 || cuenta(/^netherrack$/) < 1) return 'nada';
    return craftear('netherite_upgrade_smithing_template', 1);
  }

  async function abrirHerreria(mesa) {
    const w = await bot.openBlock(mesa);
    w.inventoryStart = 4; w.inventoryEnd = 40; w.craftingResultSlot = 3;
    await dormir(400);
    return w;
  }
  const slotInv = (w, re) => w.slots.findIndex((s, i) => i >= 4 && s && re.test(s.name));
  const mover = async (desde, hasta) => { await bot.moveSlotItem(desde, hasta); await dormir(150); };

  async function mejorar() {
    if (lingotes() < 1 || plantillas() < 1) return 'nada';
    const c = mejorables().sort((a, b) => PIEZAS.findIndex((r) => r.test(a.name)) - PIEZAS.findIndex((r) => r.test(b.name)))[0];
    if (!c) return 'nada';
    let mesa = bloqueN(/^smithing_table$/, 24);
    if (!mesa) {
      if (!tiene(/^smithing_table$/) && !(await craftear('smithing_table', 1))) return 'nada';
      mesa = await colocar('smithing_table');
      if (!mesa) return false;
    }
    if (mesa.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, mesa.position))) return false;
    const dest = DEST[c.slot];
    if (dest) { try { await bot.unequip(dest); } catch (e) { return false; } }
    const base = items().find((i) => i.name === c.name);
    if (!base) return false;
    let w = null, ok = false;
    try {
      w = await abrirHerreria(mesa);
      const t = slotInv(w, /^netherite_upgrade_smithing_template$/), b = slotInv(w, new RegExp('^' + c.name + '$')), a = slotInv(w, /^netherite_ingot$/);
      if (t < 0 || b < 0 || a < 0) return false;
      await mover(t, 0); await mover(b, 1); await mover(a, 2);
      for (let k = 0; k < 12 && !w.slots[3]; k++) await dormir(250);
      if (w.slots[3] && /^netherite_/.test(w.slots[3].name)) {
        const libreSlot = w.slots.findIndex((x, i) => i >= 4 && !x);
        if (libreSlot >= 0) { await mover(3, libreSlot); ok = true; }
      }
      for (const s of [0, 1, 2]) {
        if (!w.slots[s]) continue;
        const libreSlot = w.slots.findIndex((x, i) => i >= 4 && !x);
        if (libreSlot >= 0) { try { await mover(s, libreSlot); } catch (e) { /* ignorar */ } }
      }
    } catch (e) {
      diag.log('warn', 'forja', 'herreria: ' + String(e && e.message).slice(0, 80));
    } finally { try { if (w) w.close(); } catch (e) { /* ignorar */ } }
    try { o.equipar(); } catch (e) { /* ignorar */ }
    if (ok) { log('mejoro ' + c.name + ' a netherite'); if (bot._premio) bot._premio.evento('netherite', { k: c.name, v: 1 }); }
    return ok;
  }

  async function forja() {
    if (!libre()) return 'nada';
    for (const f of [fundir, hacerLingote, duplicarPlantilla, mejorar]) {
      const r = await f();
      if (r === true) return true;
      if (r === false) return false;
    }
    return 'nada';
  }

  const bloqueWart = (p) => bot.blockAt(new Vec3(p.x, p.y + 1, p.z));

  async function sembrar() {
    const w = items().find((i) => i.name === 'nether_wart');
    if (!w || !tiene(/^soul_sand$/) || granja.length >= 6) return false;
    const antes = cuenta(/^soul_sand$/);
    const s = await colocar('soul_sand');
    if (!s || cuenta(/^soul_sand$/) >= antes) return false;
    const sp = s.position.clone();
    try {
      await bot.equip(items().find((i) => i.name === 'nether_wart'), 'hand');
      await bot.placeBlock(bot.blockAt(sp), new Vec3(0, 1, 0));
      granja.push({ x: sp.x, y: sp.y, z: sp.z });
      guardar();
      log('sembro nether wart');
      return true;
    } catch (e) { return false; }
  }

  async function cosechar() {
    let hecho = false;
    for (const p of granja.slice()) {
      if (!libre()) break;
      const suelo = bot.blockAt(new Vec3(p.x, p.y, p.z));
      if (!suelo) continue;
      if (suelo.name !== 'soul_sand') { granja = granja.filter((q) => q !== p); guardar(); continue; }
      if (suelo.position.distanceTo(bot.entity.position) > 40) continue;
      const b = bloqueWart(p);
      if (!b) continue;
      if (b.name === 'nether_wart') {
        let edad = 0;
        try { edad = b.getProperties().age; } catch (e) { edad = 0; }
        if (edad < 3) continue;
        if (b.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, b.position))) continue;
        try { await bot.dig(bot.blockAt(b.position)); hecho = true; } catch (e) { continue; }
        await dormir(500);
      }
      const b2 = bloqueWart(p);
      if (b2 && b2.name === 'air') {
        const w = items().find((i) => i.name === 'nether_wart');
        if (w) {
          try { if (b2.position.distanceTo(bot.entity.position) > 3.5) await o.irCerca(bot, b2.position); await bot.equip(w, 'hand'); await bot.placeBlock(bot.blockAt(new Vec3(p.x, p.y, p.z)), new Vec3(0, 1, 0)); hecho = true; } catch (e) { /* ignorar */ }
        }
      }
    }
    return hecho;
  }

  async function wart() {
    if (!libre()) return 'nada';
    if (granja.length) { const r = await cosechar(); if (r) return true; }
    if (granja.length < 4 && tiene(/^soul_sand$/) && tiene(/^nether_wart$/)) return sembrar();
    return 'nada';
  }

  const api = {
    forja, wart, guardar, granja: () => granja.length,
    demanda: () => ({ debris: Math.max(0, 8 - (cuenta(/^ancient_debris$/) + scrap() + 4 * lingotes())), plantilla: plantillas() < 1 && pendientes() > 0 }),
    pendientes,
  };
  bot._forja = api;
  return api;
}
module.exports = { crearForja };
