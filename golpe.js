const V = require('./node_modules/mineflayer-pvp/lib/AttackSpeeds.json');

const rapidez = (n) => (n && V[n]) || V.other;
const ticksCarga = (n) => Math.ceil(20 / rapidez(n) - 0.5);

function crearGolpe(bot) {
  if (bot._golpe || !bot.pvp) return bot._golpe || null;
  const pvp = bot.pvp;
  let tick = 0, ultimo = -999, mano = '', saltoDesde = -1, retroHasta = -1, wtapHasta = -1, danceHasta = -1;
  const stats = { n: 0, llenos: 0, crit: 0, sum: 0 };
  const arma = () => (bot.heldItem && bot.heldItem.name) || '';
  const tps = () => Math.max(10, Math.min(20, bot._lag && bot._lag.tps ? bot._lag.tps() : 20));
  const necesita = () => Math.ceil(ticksCarga(arma()) * 20 / tps());
  const dec = (k, def) => (bot._tec ? bot._tec.decision(k) : def);
  const critico = () => process.env.IA_CRITICOS !== '0' && /_(sword|axe)$/.test(arma()) && dec('tec_sprint', 'crit') === 'crit';
  const agua = () => bot.entity.isInWater || bot.entity.isInLava || bot.entity.onClimbable;
  const listoEn = () => ultimo + necesita() - 1 - tick;
  const carga = () => Math.max(0, Math.min(1, ((tick - ultimo) * 20 / tps() + 0.5) / (20 / rapidez(arma()))));

  function espacioAtras() {
    const p = bot.entity.position, yaw = bot.entity.yaw, bx = Math.sin(yaw), bz = Math.cos(yaw);
    for (const k of [1, 2]) {
      const b = bot.blockAt(p.offset(bx * k, -1, bz * k)), a = bot.blockAt(p.offset(bx * k, 0, bz * k)), c = bot.blockAt(p.offset(bx * k, 1, bz * k));
      if (!b || b.boundingBox !== 'block' || (a && a.boundingBox === 'block') || (c && c.boundingBox === 'block')) return false;
    }
    return true;
  }

  const atacar0 = bot.attack.bind(bot);
  bot.attack = (e, s) => {
    const el = tick - ultimo, nec = necesita(), t = pvp.target;
    const c = Math.min(1, (el * 20 / tps() + 0.5) / (20 / rapidez(arma())));
    const crit = !bot.entity.onGround && bot.entity.velocity.y < 0;
    stats.n++; stats.sum += c;
    if (c >= 0.92) stats.llenos++;
    if (crit) stats.crit++;
    ultimo = tick; saltoDesde = -1;
    if (t && e && e.id === t.id) {
      if (bot._tec) bot._tec.alAtacar(e);
      const r = dec('tec_retro', 0), sp = dec('tec_sprint', 'crit');
      if (r > 0 && espacioAtras()) retroHasta = tick + r;
      if (sp === 'wtap') wtapHasta = tick + 2;
      if (bot._premio) { if (c < 0.84) bot._premio.evento('golpe_flojo'); else if (crit) bot._premio.evento('golpe_critico'); else bot._premio.evento('golpe_pleno'); }
    }
    return atacar0(e, s);
  };

  const lookAt0 = bot.lookAt.bind(bot);
  bot.lookAt = (pos, force) => {
    const t = pvp.target;
    if (t && t.position && process.env.IA_APUNTE !== '0' && bot._tec) {
      const h = t.position.offset(0, t.height || 1.8, 0);
      if (Math.abs(pos.x - h.x) + Math.abs(pos.y - h.y) + Math.abs(pos.z - h.z) < 0.05) { try { return lookAt0(bot._tec.apuntar(t), force); } catch (e) { /* ignorar */ } }
    }
    return lookAt0(pos, force);
  };

  bot.on('physicsTick', () => {
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
    if (tick < wtapHasta) bot.setControlState('sprint', false);
    if (!t || !t.position) return;
    const d = t.position.distanceTo(bot.entity.position);
    let atras = tick < retroHasta;
    if (!atras && bot._tec && dec('tec_espera', 0) === 1 && d < 3.4 && espacioAtras()) {
      const rival = bot._tec.listoRival(t), propio = listoEn();
      if (propio > rival + 1 && propio > 1) { atras = true; danceHasta = tick + 1; }
    }
    if (atras && espacioAtras()) { bot.setControlState('forward', false); bot.setControlState('sprint', false); bot.setControlState('back', true); }
    else if (bot.getControlState('back') && (tick >= retroHasta) && tick >= danceHasta) bot.setControlState('back', false);
    if (!critico() || saltoDesde >= 0 || !bot.entity.onGround || agua() || atras) return;
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

  const api = {
    resumen: () => ({ n: stats.n, llenos: stats.n ? stats.llenos / stats.n : 0, crit: stats.n ? stats.crit / stats.n : 0, carga: stats.n ? stats.sum / stats.n : 0 }),
    ticksCarga, necesita, carga, listoEn,
  };
  bot._golpe = api;
  return api;
}
module.exports = { crearGolpe, ticksCarga };
