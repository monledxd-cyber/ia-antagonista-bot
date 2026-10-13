const diag = require('./diag');

// Ping y TPS propios, y lag de los rivales. Todo se mide solo; IA_LAG=0 lo apaga.
function crearLag(bot) {
  let ping = 0, tps = 20, tAge = null, aliveTs = Date.now();
  const rv = new Map();
  const ema = (a, b, k) => a + (b - a) * k;
  const PVP0 = bot.pvp ? bot.pvp.attackRange : 3.5;

  bot.on('time', () => {
    const ahora = Date.now(), age = bot.time && bot.time.age;
    aliveTs = ahora;
    if (typeof age !== 'number') return;
    if (tAge) {
      const dt = (ahora - tAge.t) / 1000, da = age - tAge.a;
      if (dt > 0.4 && dt < 8 && da >= 0) tps = ema(tps, Math.min(20, da / dt), 0.35);
    }
    tAge = { t: ahora, a: age };
  });
  bot.on('entityMoved', (e) => {
    if (!e || e.type !== 'player' || !bot.entity) return;
    const ahora = Date.now();
    aliveTs = ahora;
    let r = rv.get(e.id);
    if (!r) { r = { p: e.position.clone(), t: ahora, v: 0, hasta: 0, n: 0 }; rv.set(e.id, r); return; }
    const dt = ahora - r.t, d = e.position.distanceTo(r.p);
    if (dt > 600 && r.v > 0.08 && d > 2) { r.hasta = ahora + 5000; r.n++; }
    r.v = ema(r.v, d, 0.5); r.p = e.position.clone(); r.t = ahora;
  });
  bot.on('entityGone', (e) => { if (e) rv.delete(e.id); });

  const lag = {
    ping: () => ping,
    tps: () => tps,
    factor: () => Math.min(2.5, Math.max(1, 20 / Math.max(tps, 8))),
    ticks: () => Math.min(6, ping / 50),
    malo: () => tps < 14 || ping > 300,
    rival: (e) => {
      if (!e) return false;
      const p = bot.players && e.username && bot.players[e.username];
      if ((p && p.ping > 250)) return true;
      const r = rv.get(e.id), ahora = Date.now();
      if (!r) return false;
      if (r.hasta > ahora) return true;
      return ahora - aliveTs < 400 && ahora - r.t > 700 && r.v > 0.08 && e.position.distanceTo(bot.entity.position) < 40;
    },
    estado: () => `ping ${Math.round(ping)}ms tps ${tps.toFixed(1)}`,
  };

  const it = setInterval(() => {
    if (!bot.entity) return;
    const p = bot.player && bot.player.ping;
    if (typeof p === 'number' && p >= 0) ping = ema(ping, p, 0.3);
    try {
      if (bot.pathfinder && bot.pathfinder.movements) bot.pathfinder.movements.allowParkour = !lag.malo();
      if (bot.pvp) bot.pvp.attackRange = PVP0 - Math.min(0.4, ping / 600);
    } catch (e) { /* ignorar */ }
    diag.estado.lag = lag.estado();
  }, 2000);
  bot.once('end', () => clearInterval(it));
  bot._lag = lag;
  module.exports.actual = lag;
  return lag;
}
module.exports = { crearLag, actual: null };
