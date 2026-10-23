const CLASES = [
  ['helmet', /_helmet$|^turtle_helmet$/], ['chestplate', /_chestplate$/], ['leggings', /_leggings$/], ['boots', /_boots$/],
  ['sword', /_sword$/], ['axe', /_axe$/], ['pickaxe', /_pickaxe$/], ['shovel', /_shovel$/], ['hoe', /_hoe$/],
  ['bow', /^bow$/], ['crossbow', /^crossbow$/], ['trident', /^trident$/], ['mace', /^mace$/], ['shield', /^shield$/],
  ['rod', /^fishing_rod$/], ['elytra', /^elytra$/],
];
const CATS = {
  helmet: ['armor', 'head_armor', 'durability'], chestplate: ['armor', 'durability'], leggings: ['armor', 'leg_armor', 'durability'], boots: ['armor', 'foot_armor', 'durability'],
  sword: ['sharp_weapon', 'weapon', 'sword', 'fire_aspect', 'durability'], axe: ['sharp_weapon', 'weapon', 'mining', 'durability'],
  pickaxe: ['mining', 'mining_loot', 'durability'], shovel: ['mining', 'mining_loot', 'durability'], hoe: ['mining', 'mining_loot', 'durability'],
  bow: ['bow', 'durability'], crossbow: ['crossbow', 'durability'], trident: ['trident', 'durability'], mace: ['mace', 'weapon', 'durability'],
  shield: ['durability'], rod: ['fishing', 'durability'], elytra: ['durability'],
};
const PREF = {
  helmet: ['protection', 'respiration', 'aqua_affinity', 'unbreaking', 'mending'], chestplate: ['protection', 'unbreaking', 'mending'],
  leggings: ['protection', 'swift_sneak', 'unbreaking', 'mending'], boots: ['protection', 'feather_falling', 'depth_strider', 'soul_speed', 'unbreaking', 'mending'],
  sword: ['sharpness', 'fire_aspect', 'looting', 'sweeping_edge', 'knockback', 'unbreaking', 'mending'], axe: ['sharpness', 'efficiency', 'unbreaking', 'mending'],
  pickaxe: ['efficiency', 'fortune', 'unbreaking', 'mending'], shovel: ['efficiency', 'unbreaking', 'mending'], hoe: ['efficiency', 'fortune', 'unbreaking', 'mending'],
  bow: ['power', 'infinity', 'flame', 'punch', 'unbreaking', 'mending'], crossbow: ['quick_charge', 'piercing', 'unbreaking', 'mending'],
  trident: ['impaling', 'loyalty', 'channeling', 'unbreaking', 'mending'], mace: ['density', 'wind_burst', 'unbreaking', 'mending'],
  shield: ['unbreaking', 'mending'], rod: ['luck_of_the_sea', 'lure', 'unbreaking', 'mending'], elytra: ['unbreaking', 'mending'],
};
const VALOR = { mending: 10, protection: 8, sharpness: 8, efficiency: 7, power: 7, density: 7, unbreaking: 6, infinity: 6, feather_falling: 5, fortune: 5, looting: 4, quick_charge: 5, impaling: 5, loyalty: 4, wind_burst: 5, depth_strider: 4, respiration: 3, aqua_affinity: 3, fire_aspect: 4, sweeping_edge: 3, knockback: 2, soul_speed: 3, swift_sneak: 3, piercing: 3, flame: 3, punch: 2, channeling: 1, lure: 2, luck_of_the_sea: 2 };

const clase = (n) => { const c = CLASES.find((x) => x[1].test(n || '')); return c ? c[0] : null; };

function porId(bot, id) { const r = bot.registry.enchantments; return r && r[id] ? r[id].name : null; }

function leer(bot, item) {
  const out = {};
  if (!item) return out;
  const add = (lista) => {
    for (const e of lista || []) {
      const nombre = e.name || (typeof e.id === 'string' ? e.id.replace('minecraft:', '') : porId(bot, e.id));
      const lvl = e.lvl != null ? e.lvl : (e.level != null ? e.level : 1);
      if (nombre) out[nombre] = Math.max(out[nombre] || 0, Number(lvl) || 1);
    }
  };
  try {
    const cm = item.componentMap;
    if (cm && cm.size) {
      for (const k of ['enchantments', 'stored_enchantments']) {
        const c = cm.get(k);
        if (c && c.data) add(Array.isArray(c.data) ? c.data : c.data.enchantments || c.data.levels || []);
      }
    }
    if (!Object.keys(out).length) {
      const raw = item.enchants;
      add(Array.isArray(raw) ? raw : (raw && raw.enchantments) || []);
    }
  } catch (e) { /* ignorar */ }
  return out;
}

function info(bot, nombre) { return bot.registry.enchantmentsByName && bot.registry.enchantmentsByName[nombre]; }

function aplicable(bot, nombre, itemName) {
  const c = clase(itemName), e = info(bot, nombre);
  return !!(c && e && CATS[c].includes(e.category));
}

function choca(bot, a, b) {
  const x = info(bot, a), y = info(bot, b);
  return a === b ? false : !!((x && x.exclude && x.exclude.includes(b)) || (y && y.exclude && y.exclude.includes(a)));
}

function ideal(bot, itemName) {
  const c = clase(itemName);
  if (!c) return {};
  const out = {};
  for (const n of PREF[c]) {
    const e = info(bot, n);
    if (!e || !aplicable(bot, n, itemName)) continue;
    if (Object.keys(out).some((o) => choca(bot, o, n))) continue;
    out[n] = e.maxLevel;
  }
  return out;
}

function brechas(bot, item) {
  const ya = leer(bot, item), meta = ideal(bot, item.name), r = [];
  for (const [n, lvl] of Object.entries(meta)) {
    const tengo = ya[n] || 0;
    if (tengo >= lvl) continue;
    if (Object.keys(ya).some((o) => o !== n && choca(bot, o, n))) continue;
    r.push({ nombre: n, lvl, tengo, valor: (VALOR[n] || 3) * (lvl - tengo) / lvl });
  }
  return r.sort((a, b) => b.valor - a.valor);
}

function valorEnc(bot, itemName, nombre, nivel) {
  const meta = ideal(bot, itemName), lvl = meta[nombre];
  if (!lvl) return 0;
  return (VALOR[nombre] || 3) * Math.min(1, nivel / lvl);
}

module.exports = { leer, clase, ideal, brechas, valorEnc, aplicable, choca, info, porId, PREF, CATS, VALOR };
