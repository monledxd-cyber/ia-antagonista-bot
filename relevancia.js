const NC = 16;
const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const ENC = require('./encantos');
function nivelEnc(bot, it, re) {
  const m = ENC.leer(bot, it);
  return Object.entries(m).filter(([n]) => re.test(n)).reduce((a, [, l]) => Math.max(a, l), 0);
}

function aplicar(bot, x, t) {
  if (process.env.IA_REL === '0') return x.concat(new Array(NC).fill(0));
  const yo = bot.entity, S = bot.inventory.slots, it = bot.inventory.items();
  const todos = it.concat([5, 6, 7, 8, 45].map((s) => S[s]).filter((i) => i));
  const dim = String((bot.game && bot.game.dimension) || '');
  const mano = bot.heldItem;
  const prot = [5, 6, 7, 8].reduce((a, s) => a + nivelEnc(bot, S[s], /protection|blast|projectile|fire/), 0);
  const fuego = yo.metadata && typeof yo.metadata[0] === 'number' && (yo.metadata[0] & 1) ? 1 : 0;
  const cr = [
    bot.isRaining ? 1 : 0,
    bot.thunderState > 0.2 ? 1 : 0,
    /nether/.test(dim) ? 1 : 0,
    /end/.test(dim) ? 1 : 0,
    todos.some((i) => nivelEnc(bot, i, /riptide|loyalty|channeling/) > 0) ? 1 : 0,
    c(nivelEnc(bot, mano, /sharpness|density|breach|power|smite|bane|fire_aspect|knockback|wind_burst/) / 5, 0, 1),
    c(prot / 16, 0, 1),
    fuego,
    c((yo.position.y - 64) / 100, -1, 1),
    S[6] && S[6].name === 'elytra' ? 1 : 0,
    S[45] && S[45].name === 'shield' ? 1 : 0,
    todos.some((i) => i.name === 'arrow') ? 1 : 0,
    todos.some((i) => /^water_bucket$/.test(i.name)) ? 1 : 0,
    c((yo.velocity ? yo.velocity.y : 0) / 1.5, -1, 1),
    yo.onGround ? 1 : 0,
    t && t.onGround === false ? 0 : 1,
  ];
  return x.concat(cr);
}
module.exports = { aplicar, NC };
