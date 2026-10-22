const V = require('./node_modules/mineflayer-pvp/lib/AttackSpeeds.json');

const rapidez = (n) => (n && V[n]) || V.other;
const ticksCarga = (n) => Math.ceil(20 / rapidez(n) - 0.5);

function crearGolpe(bot) {
  if (bot._golpe || !bot.pvp) return bot._golpe || null;
  const pvp = bot.pvp;
  let tick = 0, ultimo = -999, mano = '', saltoDesde = -1, stats = { n: 0, llenos: 0, crit: 0, sum: 0 };
  const arma = () => (bot.heldItem && bot.heldItem.name) || '';
  const tps = () => Math.max(10, Math.min(20, bot._lag && bot._lag.tps ? bot._lag.tps() : 20));
  const necesita = () => Math.ceil(ticksCarga(arma()) * 20 / tps());
  const critico = () => process.env.IA_CRITICOS !== '0' && /_(sword|axe)$/.test(arma());
  const agua = () => bot.entity.isInWater || bot.entity.isInLava || bot.entity.onClimbable;
  const listoEn = () => ultimo + necesita() - 1 - tick;

  const atacar0 = bot.attack.bind(bot);
  bot.attack = (e, s) => {
    const el = tick - ultimo, nec = necesita();
    stats.n++; stats.sum += Math.min(1, (el + 0.5) / (20 / rapidez(arma())));
    if (el + 1 >= nec) stats.llenos++;
    if (!bot.entity.onGround && bot.entity.velocity.y < 0) stats.crit++;
    ultimo = tick; saltoDesde = -1;
    return atacar0(e, s);
  };

  bot.on('physicTick', () => {
    tick++;
    const a = arma();
    if (a !== mano) { mano = a; ultimo = tick; }
    if (process.env.IA_GOLPE === '0') return;
    const t = pvp.target;
    if (saltoDesde >= 0) {
      bot.setControlState('sprint', false);
      if (tick - saltoDesde >= 1) bot.setControlState('jump', false);
      if (bot.entity.onGround && tick - saltoDesde > 3) saltoDesde = -1;
    }
    if (!t || !t.position || !critico() || saltoDesde >= 0 || !bot.entity.onGround || agua()) return;
    const d = t.position.distanceTo(bot.entity.position);
    if (d > 3.3 || d < 1) return;
    const f = listoEn();
    if (f <= 8 && f >= 5) { saltoDesde = tick; bot.setControlState('sprint', false); bot.setControlState('jump', true); }
  });

  pvp.meleeAttackRate = { getTicks: () => Math.max(1, necesita() - 3) };
  const original = pvp.attemptAttack.bind(pvp);
  pvp.attemptAttack = () => {
    if (process.env.IA_GOLPE === '0') return original();
    const falta = necesita() - (tick - ultimo + 1);
    if (falta > 0) { pvp.timeToNextAttack = falta - 1; return; }
    if (saltoDesde >= 0 && tick - saltoDesde < 14 && !(!bot.entity.onGround && bot.entity.velocity.y < 0)) { pvp.timeToNextAttack = 0; return; }
    return original();
  };

  const api = { resumen: () => ({ n: stats.n, llenos: stats.n ? stats.llenos / stats.n : 0, crit: stats.n ? stats.crit / stats.n : 0, carga: stats.n ? stats.sum / stats.n : 0 }), ticksCarga, necesita };
  bot._golpe = api;
  return api;
}
module.exports = { crearGolpe, ticksCarga };
