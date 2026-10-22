const NC = 10;
const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tiene = (bot, re) => bot.inventory.items().some((i) => re.test(i.name)) || [5, 6, 7, 8, 45].some((s) => { const x = bot.inventory.slots[s]; return x && re.test(x.name); });
const riptide = (bot) => {
  const l = bot.inventory.items().concat(bot.inventory.slots[45] ? [bot.inventory.slots[45]] : []);
  return l.some((i) => i.name === 'trident' && Array.isArray(i.enchants) && i.enchants.some((e) => /riptide/.test(String(e.name))));
};

function aplicar(bot, x, t) {
  if (process.env.IA_REL === '0') return x.concat(new Array(NC).fill(0));
  const yo = bot.entity, d = x[4] * 10;
  const nombreR = (t.heldItem && t.heldItem.name) || '';
  const maceR = nombreR === 'mace', aire = t.onGround === false;
  const mace = !!(bot.heldItem && bot.heldItem.name === 'mace');
  const vy = yo.velocity ? yo.velocity.y : 0;
  const arco = tiene(bot, /^(bow|crossbow)$/) && tiene(bot, /^arrow$/);
  const escudoMio = !!(bot.inventory.slots[45] && bot.inventory.slots[45].name === 'shield');
  const hacha = !!(bot.heldItem && /_axe$/.test(bot.heldItem.name));
  const llueve = !!bot.isRaining || !!yo.isInWater;

  let espalda = 0;
  try {
    const a = bot._perc && bot._perc.amenaza();
    if (a && a.pos && a.nivel > 0.2) {
      const ang = Math.atan2(-(a.pos.x - yo.position.x), -(a.pos.z - yo.position.z));
      let dy = ang - yo.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      if (Math.abs(dy) > 1.75) espalda = a.nivel;
    }
  } catch (e) { /* ignorar */ }

  const cr = [
    riptide(bot) && llueve ? 1 : 0,
    mace && vy < -0.3 && d < 6 ? c(-vy / 1.2, 0, 1) : 0,
    maceR && aire && d < 10 ? 1 - d / 10 : 0,
    arco && d > 6 ? c((d - 6) / 20, 0, 1) : 0,
    x[14] && hacha ? 1 : 0,
    x[22] * x[41],
    x[29] && tiene(bot, /^water_bucket$/) ? 1 : 0,
    (1 - x[0]) * (x[25] || x[38] ? 1 : 0),
    espalda,
    x[28] > 0 && escudoMio ? 1 : 0,
  ];

  const u = Math.max(x[0] < 0.3 ? 0.5 : 0, x[28] > 0 ? 0.6 + 0.4 * x[28] : 0, cr[2] * 0.9, x[55] * 0.8, x[35] * 0.5, espalda);
  const y = x.slice();
  const lento = [19, 20, 21, 22, 31, 32, 33, 34, 59, 60, 61];
  const urgente = [28, 35, 55, 58];
  for (const i of lento) y[i] *= 1 - 0.85 * u;
  for (const i of urgente) y[i] = c(y[i] * (1 + 0.5 * u), -2, 2);
  if (!(aire || maceR)) for (let i = 46; i <= 49; i++) y[i] = 0;
  return y.concat(cr);
}
module.exports = { aplicar, NC };
