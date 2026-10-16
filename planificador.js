const diag = require('./diag');

const ACCIONES = [
  { k: 'acechar', tag: (n) => `[PERSEGUIR:${n}]`, vista: true },
  { k: 'atacar', tag: () => '[ATACAR]', vista: true, cerca: 14 },
  { k: 'altura', tag: () => '[HIGHGROUND]', vista: true },
  { k: 'equipar', tag: () => '[EQUIPAR]' },
  { k: 'trampa_borde', tag: () => '[TRAMPA:borde]', vista: true, cerca: 20 },
  { k: 'trampa_lava', tag: () => '[TRAMPA:lava]', vista: true, cerca: 20 },
  { k: 'trampa_jaula', tag: () => '[TRAMPA:jaula]', vista: true, cerca: 20 },
  { k: 'trampa_oscuridad', tag: () => '[TRAMPA:oscuridad]', vista: true, cerca: 20 },
  { k: 'hablar', tag: () => '' },
  { k: 'esperar', tag: () => '' },
];

function crearPlanificador(bot, bandits) {
  const arma = (e) => { const n = (e && e.heldItem && e.heldItem.name) || ''; return /mace/.test(n) ? 'mazo' : /sword/.test(n) ? 'espada' : /_axe/.test(n) ? 'hacha' : /bow|trident/.test(n) ? 'dist' : 'otra'; };
  const cubo = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
  function contexto(ent) {
    const d = ent && ent.position ? bot.entity.position.distanceTo(ent.position) : 99;
    return `${cubo(d, 8, 20)}|${cubo(bot.health, 8, 15)}|${arma(ent)}`;
  }
  function decidir(nombre, ent) {
    if (!bandits) return null;
    const d = ent && ent.position ? bot.entity.position.distanceTo(ent.position) : 99;
    const arms = ACCIONES.filter((a) => (!a.vista || ent) && (!a.cerca || d <= a.cerca)).map((a) => ({ k: a.k, a }));
    if (!arms.length) return null;
    const ctx = contexto(ent);
    const x = bandits.elegir('plan', ctx, arms);
    const n0 = bot._premio ? bot._premio.neto() : 0, hp0 = bot.health;
    let minHp = hp0;
    const f = () => { if (bot.health < minHp) minHp = bot.health; };
    bot.on('health', f);
    setTimeout(() => {
      bot.removeListener('health', f);
      const dn = bot._premio ? bot._premio.neto() - n0 : 0;
      const r = Math.max(-1, Math.min(1, Math.tanh(dn / 4) - 0.5 * (hp0 - minHp) / 20 + (x.k === 'esperar' || x.k === 'hablar' ? 0 : 0.02)));
      bandits.premiar('plan', ctx, x.k, r);
      diag.estado.plan = `${x.k} @${ctx} r ${r.toFixed(2)}`;
    }, 25_000);
    return { k: x.k, tag: x.a.tag(nombre), ctx };
  }
  return { decidir, ACCIONES };
}
module.exports = { crearPlanificador };
