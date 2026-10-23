const Vec3 = require('vec3');
const E = require('./encantos');

const ANILLO = [];
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && !(dx === 0 && dz === 2)) ANILLO.push([dx, dz]);
const TIER = (n) => (/netherite/.test(n) ? 5 : /diamond/.test(n) ? 4 : /iron/.test(n) ? 3 : /chainmail|golden|stone|turtle/.test(n) ? 2 : /leather|wooden/.test(n) ? 1 : 3);
const PESO = { sword: 1, chestplate: 0.9, helmet: 0.8, leggings: 0.8, boots: 0.8, mace: 0.7, pickaxe: 0.6, axe: 0.6, bow: 0.6, crossbow: 0.5, trident: 0.5, shield: 0.4, elytra: 0.4, shovel: 0.2, hoe: 0.2, rod: 0.2 };
const DEST = { 5: 'head', 6: 'torso', 7: 'legs', 8: 'feet' };
const CONSTRUIR_PLANKS = /_planks$/;

function crearEncantador(h) {
  const { bot, diag, o, items, cuenta, tiene, bloqueN, colocar, craftear, libre, dormir, cazar } = h;
  const L = (it) => E.leer(bot, it);
  let ultLog = 0;

  function gear() {
    const r = [];
    for (const i of items()) { const c = E.clase(i.name); if (c) r.push(i); }
    for (const s of [5, 6, 7, 8, 45]) { const x = bot.inventory.slots[s]; if (x && E.clase(x.name)) r.push(x); }
    return r;
  }
  const prio = (i) => TIER(i.name) * (PESO[E.clase(i.name)] || 0.3);
  const pendientes = () => gear().map((i) => ({ i, g: E.brechas(bot, i) })).filter((x) => x.g.length).sort((a, b) => prio(b.i) * b.g.reduce((s, y) => s + y.valor, 0) - prio(a.i) * a.g.reduce((s, y) => s + y.valor, 0));

  function poder(mesa) {
    if (!mesa) return 0;
    let n = 0;
    for (const [dx, dz] of ANILLO) for (const dy of [0, 1]) { const b = bot.blockAt(mesa.position.offset(dx, dy, dz)); if (b && b.name === 'bookshelf') n++; }
    return Math.min(15, n);
  }

  function resumen() {
    const mesa = bloqueN(/^enchanting_table$/, 48), p = pendientes();
    diag.estado.enc = `mesa ${mesa ? 'si' : 'no'} poder ${poder(mesa)} libros ${cuenta(/^enchanted_book$/)} brechas ${p.slice(0, 3).map((x) => x.i.name + ':' + x.g.slice(0, 2).map((y) => y.nombre).join('/')).join(' ')}`;
  }

  async function abrirMesa() {
    let mesa = bloqueN(/^enchanting_table$/, 24);
    if (!mesa) { if (!tiene(/^enchanting_table$/)) return null; mesa = await colocar('enchanting_table'); if (!mesa) return null; }
    if (mesa.position.distanceTo(bot.entity.position) > 3.5 && !(await o.irCerca(bot, mesa.position))) return null;
    return mesa;
  }

  const nombreClue = (e) => (e && e.expected && e.expected.enchant >= 0 ? E.porId(bot, e.expected.enchant) : null);

  async function sobreMesa(mesa, objeto, lapis, umbral, filtro) {
    const t = await bot.openEnchantmentTable(mesa);
    try {
      await t.putTargetItem(objeto);
      await t.putLapis(lapis);
      for (let k = 0; k < 10; k++) { await dormir(300); if (t.enchantments && t.enchantments[0] && t.enchantments[0].level > 0) break; }
      const nivel = (bot.experience && bot.experience.level) || 0;
      let mejor = null;
      (t.enchantments || []).forEach((e, i) => {
        if (!e || e.level <= 0 || e.level > nivel || i + 1 > lapis.count) return;
        const nm = nombreClue(e), v = filtro(nm, e.expected ? e.expected.level : 1) + 0.7 * i + e.level / 15;
        if (!mejor || v > mejor.v) mejor = { i, v, nm, level: e.level };
      });
      if (!mejor || mejor.v < umbral) { try { await t.takeTargetItem(); } catch (e) { /* ignorar */ } return null; }
      await t.enchant(mejor.i);
      await dormir(400);
      try { await t.takeTargetItem(); } catch (e) { /* ignorar */ }
      return mejor;
    } finally { try { t.close(); } catch (e) { /* ignorar */ } }
  }

  async function sacarDeEquipo(c) {
    if (!DEST[c.slot]) return c;
    try { await bot.unequip(DEST[c.slot]); } catch (e) { return null; }
    return items().find((i) => i.name === c.name) || null;
  }

  async function encantar() {
    resumen();
    const nivel = (bot.experience && bot.experience.level) || 0;
    const lapis = items().find((i) => i.name === 'lapis_lazuli');
    if (nivel < 2 || !lapis) return 'nada';
    const mesa0 = bloqueN(/^enchanting_table$/, 24);
    const p = poder(mesa0);
    const cand = gear().filter((i) => !Object.keys(L(i)).length && (TIER(i.name) < 4 || p >= 8 || i.name === 'bow' || i.name === 'crossbow' || i.name === 'trident')).sort((a, b) => prio(b) - prio(a))[0];
    if (!cand) return 'nada';
    const mesa = await abrirMesa();
    if (!mesa) return mesa0 ? false : 'nada';
    const obj = await sacarDeEquipo(cand);
    if (!obj) return false;
    const nm = obj.name;
    const r = await sobreMesa(mesa, obj, lapis, TIER(nm) >= 4 ? 4 : 1.5, (n, lv) => (n ? E.valorEnc(bot, nm, n, lv) : 0));
    try { o.equipar(); } catch (e) { /* ignorar */ }
    if (!r) return 'nada';
    const fin = items().concat([5, 6, 7, 8, 45].map((s) => bot.inventory.slots[s]).filter((x) => x)).find((x) => x.name === nm);
    diag.log('info', 'abasto', `encanto ${nm} (nivel ${r.level}) -> ${JSON.stringify(fin ? L(fin) : {})}`);
    return true;
  }

  async function libros() {
    const nivel = (bot.experience && bot.experience.level) || 0;
    const lapis = items().find((i) => i.name === 'lapis_lazuli');
    const libro = items().find((i) => i.name === 'book');
    if (!libro || !lapis || lapis.count < 3 || nivel < 15) return 'nada';
    const mesa0 = bloqueN(/^enchanting_table$/, 24);
    if (!mesa0 || poder(mesa0) < 8) return 'nada';
    const pend = pendientes();
    if (!pend.length) return 'nada';
    const buscados = {};
    for (const x of pend.slice(0, 6)) for (const y of x.g) { const e = E.info(bot, y.nombre); if (e && !e.treasureOnly && e.discoverable) buscados[y.nombre] = Math.max(buscados[y.nombre] || 0, y.valor); }
    if (!Object.keys(buscados).length) return 'nada';
    const mesa = await abrirMesa();
    if (!mesa) return false;
    const r = await sobreMesa(mesa, libro, lapis, 4, (n) => (n && buscados[n] ? buscados[n] : 0));
    if (!r) return 'nada';
    diag.log('info', 'abasto', 'libro encantado (' + (r.nm || '?') + ')');
    return true;
  }

  async function cuero() {
    const mesa = bloqueN(/^enchanting_table$/, 48);
    if (!mesa || poder(mesa) >= 15 || cuenta(/^leather$/) >= 3 || cuenta(/^book$/) >= 3) return 'nada';
    if (cuenta(/_planks$/) < 6) return 'nada';
    return cazar(/^cow$/);
  }

  async function azucar() {
    const mesa = bloqueN(/^enchanting_table$/, 48);
    if (!mesa || poder(mesa) >= 15 || cuenta(/^(sugar_cane|paper)$/) >= 3 || cuenta(/^book$/) >= 3) return 'nada';
    const b = bloqueN(/^sugar_cane$/, 48);
    if (!b) return 'nada';
    if (b.position.distanceTo(bot.entity.position) > 3 && !(await o.irCerca(bot, b.position))) return false;
    return (await o.recolectar(bot, 'sugar_cane', 6, Math.ceil(b.position.distanceTo(bot.entity.position)) + 10)).ok;
  }

  async function estanterias() {
    const mesa = bloqueN(/^enchanting_table$/, 32);
    if (!mesa) return 'nada';
    const p = poder(mesa);
    if (p >= 15) return 'nada';
    if (!tiene(/^bookshelf$/)) {
      if (cuenta(/^paper$/) < 3 && cuenta(/^sugar_cane$/) >= 3) await craftear('paper', 1);
      if (cuenta(/^book$/) < 3 && cuenta(/^paper$/) >= 3 && tiene(/^leather$/)) await craftear('book', 1);
      if (cuenta(/^book$/) >= 3 && cuenta(/_planks$/) >= 6) await craftear('bookshelf', 1);
    }
    if (!tiene(/^bookshelf$/)) return 'nada';
    if (mesa.position.distanceTo(bot.entity.position) > 4 && !(await o.irCerca(bot, mesa.position))) return false;
    let puestos = 0;
    for (const [dx, dz] of ANILLO) {
      if (!tiene(/^bookshelf$/) || puestos >= 4 || !libre()) break;
      const celda = mesa.position.offset(dx, 0, dz), b = bot.blockAt(celda), suelo = bot.blockAt(celda.offset(0, -1, 0));
      if (!b || b.name !== 'air' || !suelo || suelo.boundingBox !== 'block') continue;
      if (celda.distanceTo(bot.entity.position) > 4.2 && !(await o.irCerca(bot, celda))) continue;
      try {
        await bot.equip(items().find((i) => i.name === 'bookshelf'), 'hand');
        await bot.placeBlock(suelo, new Vec3(0, 1, 0));
        puestos++;
      } catch (e) { /* prueba otra celda */ }
    }
    return puestos > 0 ? true : false;
  }

  async function unir() {
    const libros = items().filter((i) => i.name === 'enchanted_book');
    const nivel = (bot.experience && bot.experience.level) || 0;
    if (!libros.length || nivel < 5) return 'nada';
    let yq = bloqueN(/^(chipped_|damaged_)?anvil$/, 24);
    if (!yq) {
      if (!tiene(/^anvil$/) && cuenta(/^iron_ingot$/) >= 40) { if (cuenta(/^iron_block$/) < 3) await craftear('iron_block', 3); await craftear('anvil', 1); }
      if (!tiene(/^anvil$/)) return 'nada';
      yq = await colocar('anvil');
      if (!yq) return false;
    }
    let plan = null;
    for (const x of pendientes()) {
      if (x.i.name === 'enchanted_book') continue;
      const ya = L(x.i);
      for (const lb of libros) {
        let mejor = 0;
        for (const [n, l] of Object.entries(L(lb))) {
          if (!E.aplicable(bot, n, x.i.name) || (ya[n] || 0) >= l) continue;
          if (Object.keys(ya).some((k) => k !== n && E.choca(bot, k, n))) continue;
          mejor = Math.max(mejor, (E.VALOR[n] || 3) * Math.min(1, l / (E.info(bot, n).maxLevel || 1)));
        }
        if (mejor >= 3 && (!plan || mejor > plan.v)) plan = { it: x.i, lb, v: mejor };
      }
      if (plan) break;
    }
    if (!plan) return 'nada';
    if (yq.position.distanceTo(bot.entity.position) > 3 && !(await o.irCerca(bot, yq.position))) return false;
    let it = await sacarDeEquipo(plan.it);
    if (!it) return false;
    let w;
    try {
      w = await bot.openAnvil(yq);
      await w.combine(it, items().find((i) => i === plan.lb || (i.name === 'enchanted_book' && i.slot === plan.lb.slot)) || plan.lb);
      diag.log('info', 'abasto', 'yunque: ' + it.name + ' + libro');
      return true;
    } catch (e) { diag.log('warn', 'abasto', 'yunque fallo: ' + String(e && e.message).slice(0, 80)); return false; } finally { try { if (w) w.close(); } catch (e) { /* ignorar */ } try { o.equipar(); } catch (e) { /* ignorar */ } }
  }

  function quiereLibro(item) {
    try {
      const m = L(item);
      const pend = pendientes();
      let v = 0;
      for (const [n, l] of Object.entries(m)) for (const x of pend.slice(0, 8)) {
        const g = x.g.find((y) => y.nombre === n);
        if (g && l > g.tengo) v = Math.max(v, (E.VALOR[n] || 3) * Math.min(1, l / g.lvl));
      }
      return v >= 5;
    } catch (e) { return false; }
  }

  const api = { encantar, libros, cuero, azucar, estanterias, unir, quiereLibro, poder: () => poder(bloqueN(/^enchanting_table$/, 48)), pendientes, resumen };
  bot._enc = api;
  return api;
}
module.exports = { crearEncantador };
