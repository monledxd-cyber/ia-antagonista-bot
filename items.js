const fs = require('fs');

// Conocimiento de items: ficha derivada de minecraft-data (tipo, comida, herramientas por bloque, materiales de equipo)
// mas aprendizaje por uso (efectos observados al consumir/usar) persistido en disco.
function crearItems(bot, ruta) {
  const R = bot.registry;
  let datos = {}, sucio = false;
  try { datos = JSON.parse(fs.readFileSync(ruta, 'utf8')) || {}; } catch (e) { datos = {}; }
  const IT = R.itemsByName, BL = R.blocksByName, FO = R.foodsByName || {}, EN = R.entitiesByName || {};
  const cat = (n) => (IT[n] && IT[n].enchantCategories) || [];

  const tipoBase = (n) => {
    const c = cat(n);
    if (c.some((x) => /^(armor|head_armor|leg_armor|foot_armor)$/.test(x))) return 'armadura';
    if (c.some((x) => /^(bow|crossbow|trident)$/.test(x))) return 'distancia';
    if (c.includes('mace') || c.includes('sword') || c.includes('weapon')) return 'arma';
    if (c.includes('mining')) return 'herramienta';
    if (FO[n]) return 'comida';
    if (EN[n] && !BL[n]) return 'lanzable';
    if (BL[n] && EN[n]) return 'explosivo';
    if (BL[n]) return 'bloque';
    return 'material';
  };

  const ingredientes = (r) => {
    const ids = [];
    const mete = (x) => { if (x === null || x === undefined || x < 0) return; ids.push(typeof x === 'object' ? x.id : x); };
    if (r.ingredients) r.ingredients.forEach(mete);
    if (r.inShape) r.inShape.forEach((f) => f.forEach(mete));
    return ids;
  };
  const usadoEn = new Map();
  for (const [res, rs] of Object.entries(R.recipes || {})) for (const r of rs) for (const i of ingredientes(r)) { if (!usadoEn.has(i)) usadoEn.set(i, new Set()); usadoEn.get(i).add(Number(res)); }

  const abundante = (n) => { const b = BL[n]; return !!b && b.hardness !== null && b.hardness <= 3 && !/ore|glass|wool|concrete/.test(n) ? true : false; };
  const reparadores = new Set();
  for (const it of R.itemsArray) if (/^(armadura|arma|herramienta)$/.test(tipoBase(it.name))) for (const x of it.repairWith || []) reparadores.add(x);
  const memoMat = new Map();
  function materialEquipo(n) {
    if (memoMat.has(n)) return memoMat.get(n);
    let r = reparadores.has(n) && !abundante(n);
    const it = IT[n];
    if (it && !abundante(n)) {
      let nivel = new Set([it.id]);
      for (let d = 0; d < 2 && !r; d++) {
        const sig = new Set();
        for (const id of nivel) for (const res of usadoEn.get(id) || []) {
          const rn = R.items[res] && R.items[res].name;
          if (!rn) continue;
          if (/^(armadura|arma|herramienta|distancia|lanzable)$/.test(tipoBase(rn))) { r = true; break; }
          sig.add(res);
        }
        nivel = sig;
      }
    }
    memoMat.set(n, r);
    return r;
  }

  const crudoDe = (n) => {
    if (!FO[n]) return null;
    for (const p of ['cooked_', 'baked_', 'dried_']) if (IT[p + n]) return p + n;
    return null;
  };

  const L = (n) => (datos[n] = datos[n] || { n: 0, hp: 0, food: 0, efx: {}, malo: 0, bueno: 0, fuel: 0, usos: 0 });
  const EF_MAL = /^(poison|wither|hunger|nausea|weakness|blindness|mining_fatigue|slowness|instant_damage|levitation|bad_omen|darkness)$/;
  const EF_BUFF = /^(strength|speed|resistance|fire_resistance|jump_boost|haste|night_vision|water_breathing|invisibility|absorption|regeneration)$/;
  const aprendidoRoles = (n) => {
    const l = datos[n], s = new Set();
    if (!l) return s;
    const efs = Object.keys(l.efx);
    if (efs.some((e) => EF_MAL.test(e)) || (l.n >= 2 && l.hp / l.n <= -1)) s.add('malo');
    if (efs.some((e) => /^(regeneration|instant_health|absorption)$/.test(e)) || (l.n >= 1 && l.hp / l.n >= 2)) s.add('cura');
    if (efs.some((e) => EF_BUFF.test(e) && !/^(regeneration|absorption)$/.test(e))) s.add('buff');
    if (l.n >= 1 && l.food / l.n >= 3 && !s.has('malo')) s.add('comida_ok');
    if (l.fuel > 0) s.add('combustible');
    return s;
  };

  const memoFicha = new Map();
  function ficha(n) {
    if (memoFicha.has(n)) return memoFicha.get(n);
    const it = IT[n];
    const f = { nombre: n, existe: !!it, tipo: it ? tipoBase(n) : 'desconocido', comida: FO[n] ? FO[n].foodPoints : 0, crudo: !!crudoDe(n) && false, cocinado: crudoDe(n), materialEquipo: it ? materialEquipo(n) : false };
    f.crudo = !!f.cocinado;
    memoFicha.set(n, f);
    return f;
  }

  const roles = (n) => {
    const f = ficha(n), s = aprendidoRoles(n);
    s.add(f.tipo);
    if (f.crudo) s.add('crudo');
    if (f.comida >= 5 && !f.crudo) s.add('comida_buena');
    if (f.materialEquipo) s.add('material_equipo');
    if (s.has('comida_ok') && !f.crudo) s.add('comida_buena');
    return s;
  };
  const es = (n, r) => roles(n).has(r);

  const comidaBuena = (n) => es(n, 'comida_buena') && !es(n, 'malo');
  const comidaMala = (n) => !!FO[n] && es(n, 'malo');
  const crudo = (n) => ficha(n).crudo && !es(n, 'malo');
  const conserva = (n) => {
    const r = roles(n);
    if (r.has('malo')) return false;
    return r.has('explosivo') || r.has('armadura') || r.has('arma') || r.has('herramienta') || r.has('distancia') || r.has('comida_buena') || r.has('cura') || r.has('buff') || r.has('combustible') && !/_log$|_planks$/.test(n) || r.has('material_equipo') || r.has('lanzable') || (BL[n] && BL[n].hardness >= 20);
  };
  const valioso = (n) => { const r = roles(n); return !r.has('malo') && (r.has('explosivo') || r.has('material_equipo') || r.has('cura') || r.has('buff') || r.has('lanzable') || r.has('armadura') || r.has('arma') || (BL[n] && BL[n].hardness >= 20)) && !/_log$|_planks$|^(stick)$/.test(n); };

  // Herramientas capaces de romper un bloque (por harvestTools de minecraft-data): regex de nombres de item.
  const herramientasPara = (bloque) => {
    const b = BL[bloque];
    if (!b || !b.harvestTools) return null;
    const nombres = Object.keys(b.harvestTools).map((id) => R.items[id] && R.items[id].name).filter(Boolean);
    return nombres.length ? new RegExp('^(' + nombres.join('|') + ')$') : null;
  };

  // --- aprendizaje por uso ---
  const efectos = () => { const o = {}; try { for (const e of Object.values((bot.entity && bot.entity.effects) || {})) { const d = e && R.effects[e.id]; if (d) o[d.name] = 1; } } catch (x) { /* ignorar */ } return o; };
  const cuenta = (n) => bot.inventory.items().filter((i) => i.name === n).reduce((a, i) => a + i.count, 0);
  const visto = {};
  function observar(n) {
    if (!n || Date.now() - (visto[n] || 0) < 3000) return;
    const r = roles(n);
    if (/^(armadura|arma|herramienta|distancia)$/.test(tipoBase(n)) || n === 'shield') return;
    visto[n] = Date.now();
    const a = { hp: bot.health, food: bot.food, ef: efectos(), c: cuenta(n), pelea: !!(bot.pvp && bot.pvp.target) };
    setTimeout(() => {
      if (!bot.entity) return;
      const ef = efectos(), nuevos = Object.keys(ef).filter((k) => !a.ef[k]);
      const dh = bot.health - a.hp, df = bot.food - a.food, gastado = cuenta(n) < a.c;
      if (!nuevos.length && !df && (!gastado) && Math.abs(dh) < 1) return;
      const l = L(n);
      l.n++; l.usos++;
      if (!a.pelea) l.hp += Math.max(-10, Math.min(10, dh));
      l.food += df;
      for (const k of nuevos) l.efx[k] = (l.efx[k] || 0) + 1;
      sucio = true; memoFicha.delete(n);
    }, 2300);
  }
  const consume0 = bot.consume.bind(bot);
  bot.consume = (...a) => { try { if (bot.heldItem) observar(bot.heldItem.name); } catch (e) { /* ignorar */ } return consume0(...a); };
  const activar0 = bot.activateItem.bind(bot);
  bot.activateItem = (...a) => { try { if (bot.heldItem) observar(bot.heldItem.name); } catch (e) { /* ignorar */ } return activar0(...a); };

  const aprender = (n, k) => { const l = L(n); if (k === 'fuel') l.fuel++; sucio = true; memoFicha.delete(n); };
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(datos)); sucio = false; } catch (e) { /* ignorar */ } };
  const t = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(t); guardar(); });

  const api = { ficha, roles, es, comidaBuena, comidaMala, crudo, conserva, valioso, herramientasPara, aprender, guardar, resumen: () => Object.keys(datos).length };
  bot._items = api;
  return api;
}
module.exports = { crearItems };
