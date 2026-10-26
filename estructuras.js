const fs = require('fs');

const FIRMAS = {
  spawner: { re: /^spawner$/, min: 1 },
  trial: { re: /^(trial_spawner|vault|copper_bulb|tuff_bricks|chiseled_tuff|copper_grate)$/, min: 2 },
  fortaleza: { re: /^(end_portal_frame|mossy_stone_bricks|cracked_stone_bricks|chiseled_stone_bricks|infested_stone_bricks)$/, min: 3 },
  mina: { re: /^(cobweb|rail|powered_rail)$/, min: 4 },
  ruina: { re: /^(mossy_cobblestone|suspicious_gravel|suspicious_sand|chiseled_sandstone|cut_sandstone)$/, min: 4 },
  barco: { re: /^(dark_oak_planks|spruce_planks|oak_planks)$/, min: 12, agua: true },
};
const PELIGRO = /^(sculk_shrieker|sculk_sensor|sculk_catalyst|reinforced_deepslate|tnt|stone_pressure_plate|oak_pressure_plate|tripwire|tripwire_hook|dispenser)$/;
const EXTRA = /(enchanted_book|saddle|name_tag|music_disc|heavy_core|ominous|trial_key|netherite|amethyst|echo_shard|lapis|redstone|gold_|diamond|emerald|ender_pearl|golden_apple|iron_ingot)/;

function crearEstructuras(h) {
  const { bot, diag, o, items, cuenta, tiene, libre, dormir, VALIOSO, ruta } = h;
  let d = { cand: [], hechos: 0 };
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  let sucio = false, ultEscan = 0;
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const idsDe = (re) => Object.values(bot.registry.blocksByName).filter((b) => re.test(b.name)).map((b) => b.id);
  const todos = Object.entries(FIRMAS).map(([k, v]) => ({ k, ...v, ids: idsDe(v.re) }));
  const idsChest = idsDe(/^(chest|barrel)$/), idsPel = idsDe(PELIGRO);
  const key = (p) => p.x + ',' + p.y + ',' + p.z;

  function escanear() {
    if (!bot.entity || Date.now() - ultEscan < 12_000 || bot._atraso > 250 || (bot.pvp && bot.pvp.target)) return;
    ultEscan = Date.now();
    let cofres = [];
    try { cofres = bot.findBlocks({ matching: idsChest, maxDistance: 40, count: 20 }); } catch (e) { return; }
    if (!cofres.length) return;
    const base = h.base;
    const firmas = {};
    for (const f of todos) { try { firmas[f.k] = f.ids.length ? bot.findBlocks({ matching: f.ids, maxDistance: 46, count: 160 }) : []; } catch (e) { firmas[f.k] = []; } }
    let pel = [];
    try { pel = bot.findBlocks({ matching: idsPel, maxDistance: 46, count: 60 }); } catch (e) { pel = []; }
    for (const p of cofres) {
      if (d.cand.some((c) => key(c) === key(p))) continue;
      if (base && Math.hypot(p.x - base.x, p.z - base.z) < 40) continue;
      let mejor = null, mc = 0;
      for (const f of todos) {
        const n = firmas[f.k].filter((q) => Math.abs(q.x - p.x) <= 8 && Math.abs(q.y - p.y) <= 6 && Math.abs(q.z - p.z) <= 8).length;
        if (n >= f.min && n > mc) { mc = n; mejor = f.k; }
      }
      if (!mejor) continue;
      const peligro = pel.some((q) => Math.abs(q.x - p.x) <= 8 && Math.abs(q.y - p.y) <= 6 && Math.abs(q.z - p.z) <= 8);
      if (peligro && bot._mapa && bot._mapa.marcarPeligro) { try { bot._mapa.marcarPeligro({ x: p.x, y: p.y, z: p.z }, 2, 'zona de trampas/sculk'); } catch (e) { /* ignorar */ } }
      d.cand.push({ x: p.x, y: p.y, z: p.z, tipo: mejor, peligro, vis: false, t: Date.now() });
      sucio = true;
      diag.log('info', 'estructuras', `cofre ${mejor} en ${p.x},${p.y},${p.z}${peligro ? ' (peligro)' : ''}`);
    }
    if (d.cand.length > 80) { d.cand = d.cand.filter((c) => !c.vis).concat(d.cand.filter((c) => c.vis).slice(-20)).slice(-80); sucio = true; }
  }
  const iv = setInterval(() => { try { escanear(); } catch (e) { /* ignorar */ } }, 6000);
  const gt = setInterval(guardar, 60_000);
  [iv, gt].forEach((t) => t.unref && t.unref());
  bot.once('end', () => { clearInterval(iv); clearInterval(gt); guardar(); });

  async function estructuras() {
    if (!libre() || bot.health < 16 || !tiene(/_sword$/) || bot.food < 10) return 'nada';
    const yo = bot.entity.position;
    const lista = d.cand.filter((c) => !c.vis && !c.peligro && Math.hypot(c.x - yo.x, c.z - yo.z) < 110).sort((a, b) => Math.hypot(a.x - yo.x, a.z - yo.z) - Math.hypot(b.x - yo.x, b.z - yo.z)).slice(0, 4);
    if (!lista.length) return 'nada';
    const B = bot._bandits;
    const elegido = B && B.elegir ? B.elegir('estructura', '*', lista.map((c) => ({ k: c.tipo, c }))) : { k: lista[0].tipo, c: lista[0] };
    const c = elegido.c;
    c.vis = true; sucio = true;
    const bloque = bot.blockAt(new (require('vec3').Vec3)(c.x, c.y, c.z));
    if (!(await o.irCerca(bot, { x: c.x, y: c.y, z: c.z }, 45_000))) { guardar(); return false; }
    const b = bot.blockAt(new (require('vec3').Vec3)(c.x, c.y, c.z));
    if (!b || !/^(chest|barrel)$/.test(b.name) || !libre()) { guardar(); return bloque ? false : 'nada'; }
    let valor = 0;
    try {
      const w = await bot.openContainer(b);
      try {
        for (const it of w.containerItems().filter((i) => VALIOSO.test(i.name) || EXTRA.test(i.name)).slice(0, 14)) {
          try { await w.withdraw(it.type, null, it.count); valor += EXTRA.test(it.name) ? 2 : 1; } catch (e) { break; }
        }
      } finally { try { w.close(); } catch (e) { /* ignorar */ } }
    } catch (e) { guardar(); return false; }
    d.hechos++; guardar();
    if (B && B.premiar) { try { B.premiar('estructura', '*', c.tipo, Math.min(1, valor / 8)); } catch (e) { /* ignorar */ } }
    if (bot._premio && valor > 0) bot._premio.evento('ganar_valioso', { k: 'estructura_' + c.tipo, v: Math.min(2, valor * 0.15) });
    if (bot._eventos) bot._eventos.registrar('logro', `saquee un cofre de ${c.tipo} (${valor} pts)`);
    diag.log('info', 'estructuras', `saqueado ${c.tipo}: ${valor} pts`);
    return true;
  }

  const api = { estructuras, escanear, guardar, candidatos: () => d.cand.filter((c) => !c.vis && !c.peligro).length };
  bot._estructuras = api;
  return api;
}
module.exports = { crearEstructuras };
