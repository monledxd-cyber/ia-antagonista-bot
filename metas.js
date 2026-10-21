const fs = require('fs');
const diag = require('./diag');

const SEQ = ['wooden', 'stone', 'iron', 'diamond', 'netherite'];
const tool = (k, d) => SEQ.slice(d).map((t) => `${t}_${k}`);
const arm = (k, d) => ['iron', 'diamond', 'netherite'].slice(d).map((t) => `${t}_${k}`);
const has = (l, ...ns) => ({ l, f: (I) => ns.some((n) => I.has(n)) });
const cnt = (l, re, n) => ({ l, f: (I) => I.c(re) >= n });
const todo = (l, fn) => ({ l, f: fn });

const METAS = [
  { id: 'madera', v: 3, cl: 0.2, t: 150, pre: [], pasos: { madera: 1, mesa: 1, palos: 0.6, equipo: 1 }, req: [has('pico de madera', ...tool('pickaxe', 0)), has('hacha', ...tool('axe', 0))] },
  { id: 'comida', v: 6, cl: 0.9, t: 300, pre: [], pasos: { comida: 1, carne: 0.8, cosecha: 0.6, pan: 0.5, granja: 0.5, pescar: 0.3, horno: 0.4 }, req: [todo('8 de comida', (I) => I.comida() >= 8)] },
  { id: 'piedra', v: 4, cl: 0.3, t: 200, pre: ['madera'], pasos: { piedra: 1, equipo: 1, horno: 0.6, carbon: 0.5 }, req: [has('pico de piedra', ...tool('pickaxe', 1)), has('espada', ...tool('sword', 1))] },
  { id: 'base', v: 5, cl: 0.3, t: 400, pre: ['madera'], pasos: { cama: 1, cofre: 1, base: 0.8, guardar: 0.5, dormir: 0.3 }, req: [todo('cama', (I) => I.c(/_bed$/) > 0), has('cofre', 'chest', 'barrel')] },
  { id: 'hierro', v: 9, cl: 0.6, t: 900, pre: ['piedra'], pasos: { hierro: 1, carbon: 0.7, fundir: 0.8, horno: 0.7, equipo: 1, escudo: 0.7, mina: 0.5 },
    req: [has('pico de hierro', ...tool('pickaxe', 2)), has('espada de hierro', ...tool('sword', 2)), has('casco', ...arm('helmet', 0)), has('peto', ...arm('chestplate', 0)), has('pantalon', ...arm('leggings', 0)), has('botas', ...arm('boots', 0)), has('escudo', 'shield')] },
  { id: 'cubo', v: 5, cl: 0.5, t: 500, pre: ['hierro'], pasos: { cubo: 1, agua: 0.8, hierro: 0.5 }, req: [has('cubo', 'bucket', 'water_bucket')] },
  { id: 'arco', v: 5, cl: 0.4, t: 450, pre: ['madera'], pasos: { cuerda: 0.8, flechas: 1, pedernal: 0.6, esqueletos: 0.5 }, req: [has('arco', 'bow', 'crossbow'), cnt('16 flechas', /^arrow$/, 16)] },
  { id: 'explosivos', v: 6, cl: 0.3, t: 500, pre: ['hierro'], pasos: { polvora: 1, tnt: 1, placa: 0.4, esqueletos: 0.6 }, req: [cnt('4 tnt', /^tnt$/, 4)] },
  { id: 'perlas', v: 5, cl: 0.3, t: 600, pre: ['hierro'], pasos: { perlas: 1, nether: 0.4 }, req: [cnt('4 perlas', /^ender_pearl$/, 4)] },
  { id: 'diamante', v: 10, cl: 0.4, t: 1500, pre: ['hierro'], pasos: { diamante: 1, mina: 0.8, equipo: 1, hierro: 0.4 },
    req: [has('pico de diamante', ...tool('pickaxe', 3)), has('espada de diamante', ...tool('sword', 3)), has('casco', ...arm('helmet', 1)), has('peto', ...arm('chestplate', 1)), has('pantalon', ...arm('leggings', 1)), has('botas', ...arm('boots', 1))] },
  { id: 'curacion', v: 7, cl: 0.6, t: 600, pre: ['hierro'], pasos: { oro: 0.8, pociones: 0.6, cosecha: 0.3, nether: 0.3 }, req: [todo('2 manzanas doradas o totem', (I) => I.c(/^(golden_apple|enchanted_golden_apple)$/) >= 2 || I.has('totem_of_undying'))] },
  { id: 'encantar', v: 8, cl: 0.2, t: 1200, pre: ['diamante'], pasos: { lapis: 1, obsidiana: 0.8, diamante: 0.6, encantar: 1, xp: 0.8 }, req: [todo('equipo encantado', (I) => I.encantado())] },
  { id: 'nether', v: 8, cl: 0.1, t: 1500, pre: ['diamante', 'cubo'], pasos: { obsidiana: 1, nether: 1, lava: 0.6, pedernal: 0.6, agua: 0.4 }, req: [todo('visitar el nether', (I) => I.flag('nether'))] },
  { id: 'netherite', v: 10, cl: 0.2, t: 2400, pre: ['nether'], pasos: { nether: 1, mina: 0.7, asalto: 0.3 }, req: [todo('pieza de netherite', (I) => I.c(/^netherite_(ingot|sword|pickaxe|helmet|chestplate|leggings|boots)$/) > 0)] },
];
const POR = Object.fromEntries(METAS.map((m) => [m.id, m]));

function crearMetas(bot, ruta) {
  let d = { t: {}, hechas: {}, flags: {} }, sucio = false, cache = null, actual = null, inicio = 0, ultLog = 0;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }

  function inventario() {
    const it = bot.inventory.items(), nombres = new Set(it.map((i) => i.name));
    for (const s of [5, 6, 7, 8, 45]) { const x = bot.inventory.slots[s]; if (x) nombres.add(x.name); }
    if (bot.heldItem) nombres.add(bot.heldItem.name);
    const dim = String((bot.game && bot.game.dimension) || '');
    if (/nether/.test(dim) && !d.flags.nether) { d.flags.nether = Date.now(); sucio = true; }
    const comidaN = it.filter((i) => bot.registry.foodsByName && bot.registry.foodsByName[i.name]).reduce((a, i) => a + i.count, 0);
    return {
      has: (n) => nombres.has(n),
      c: (re) => it.filter((i) => re.test(i.name)).reduce((a, i) => a + i.count, 0),
      comida: () => comidaN,
      flag: (k) => !!d.flags[k],
      encantado: () => it.some((i) => Array.isArray(i.enchants) && i.enchants.length > 0) || [5, 6, 7, 8].some((s) => { const x = bot.inventory.slots[s]; return x && Array.isArray(x.enchants) && x.enchants.length > 0; }),
    };
  }

  function evaluar() {
    const I = inventario(), ahora = Date.now();
    const peligro = (bot._autopsia ? bot._autopsia.lista().filter((x) => ahora - x.t < 30 * 60_000).length : 0) > 0 || bot.health < 12 || bot.food < 10;
    const wc = 1 + (peligro ? 1.5 : 0), wl = peligro ? 0.8 : 1.2;
    const info = {};
    for (const m of METAS) {
      const falta = m.req.filter((r) => { try { return !r.f(I); } catch (e) { return true; } });
      const prog = 1 - falta.length / m.req.length;
      const hecha = falta.length === 0;
      if (hecha && !d.hechas[m.id]) { d.hechas[m.id] = ahora; sucio = true; }
      info[m.id] = { m, falta, prog, hecha };
    }
    const cand = [];
    for (const x of Object.values(info)) {
      if (x.hecha || x.m.pre.some((p) => !info[p].hecha)) continue;
      const t = d.t[x.m.id] || x.m.t, rest = Math.max(60, t * (1 - 0.85 * x.prog));
      cand.push({ ...x, u: (x.m.v * (wc * x.m.cl + wl * (1 - x.m.cl))) / rest, rest });
    }
    cand.sort((a, b) => b.u - a.u);
    const act = actual && cand.find((c) => c.m.id === actual);
    let sel = act || cand[0] || null;
    if (act && cand[0] && cand[0].m.id !== actual && cand[0].u > act.u * 1.35) sel = cand[0];
    if (sel && (!actual || sel.m.id !== actual)) {
      if (actual && info[actual] && info[actual].hecha && inicio) { const dur = (ahora - inicio) / 1000; d.t[actual] = d.t[actual] ? 0.7 * d.t[actual] + 0.3 * dur : dur; sucio = true; }
      actual = sel.m.id; inicio = ahora;
      if (ahora - ultLog > 2000) { ultLog = ahora; console.log(`[meta] ${actual}: faltan ${sel.falta.map((f) => f.l).join(', ') || '-'}`); }
    } else if (!sel) actual = null;
    return { cand, info, sel };
  }

  function estado() {
    const ahora = Date.now();
    if (cache && ahora - cache.t < 4000) return cache;
    if (!bot.entity) return cache || { t: ahora, sel: null, cand: [] };
    let r; try { r = evaluar(); } catch (e) { diag.log('warn', 'metas', String(e && e.message).slice(0, 80)); r = { sel: null, cand: [] }; }
    cache = { t: ahora, ...r };
    diag.estado.meta = r.sel ? `${r.sel.m.id} ${(r.sel.prog * 100).toFixed(0)}% faltan ${r.sel.falta.map((f) => f.l).join(', ')} | siguiente ${r.cand[1] ? r.cand[1].m.id : '-'}` : 'todas hechas';
    return cache;
  }

  const mult = (paso) => {
    if (process.env.IA_METAS === '0') return 1;
    const e = estado();
    let m = 1;
    if (e.sel && e.sel.m.pasos[paso]) m += 1.6 * e.sel.m.pasos[paso];
    const s2 = e.cand && e.cand.find((c) => !e.sel || c.m.id !== e.sel.m.id);
    if (s2 && s2.m.pasos[paso]) m += 0.4 * s2.m.pasos[paso];
    return m;
  };
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60_000);
  if (gt.unref) gt.unref();
  bot.once('end', () => { clearInterval(gt); guardar(); });
  const api = { mult, estado, guardar, actual: () => actual, METAS };
  bot._metas = api;
  return api;
}
module.exports = { crearMetas, METAS };
