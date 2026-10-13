const diag = require('./diag');

// Premio y castigo de AM. Sf (Schadenfreude) = premio: sufrimiento ajeno. Hm (Humanity) = castigo: dolor, derrota y fragilidad propios.
// Son stats persistentes (stats_am.json) y la señal neta (Sf - Hm) alimenta a los bandits y a la red neuronal.
function crearPremio(bot, stats, memoria) {
  let neto = 0, ultGolpe = 0, hpPrev = null, hist = [], huyoMarca = 0;
  const sf = (n, motivo) => { if (n > 0) { stats.sumar('sf', n); neto += n; if (motivo) diag.log('info', 'premio', 'Sf +' + n.toFixed(1) + ' ' + motivo); } };
  const hm = (n, motivo) => { if (n > 0) { stats.sumar('hm', n); neto -= n; if (motivo) diag.log('info', 'premio', 'Hm +' + n.toFixed(1) + ' ' + motivo); } };

  bot.on('health', () => {
    const h = bot.health;
    if (hpPrev !== null && h < hpPrev) hm((hpPrev - h) * 0.25);
    hpPrev = h;
  });
  bot.on('death', () => hm(6, 'muerte'));
  bot.on('entityHurt', (e) => {
    const t = bot.pvp && bot.pvp.target;
    if (t && e === t && e.type === 'player' && Date.now() - ultGolpe > 400) { ultGolpe = Date.now(); sf(0.3); }
  });
  bot.on('messagestr', (m) => {
    if (typeof m !== 'string' || !bot.players) return;
    if (/ (was slain|was shot|was blown|fell from|drowned|burned|tried to swim|hit the ground|was killed|starved|suffocated|went up in flames|withered)/.test(m)) {
      const n = Object.keys(bot.players).find((x) => x !== bot.username && m.startsWith(x + ' '));
      if (n) sf(1.5, 'muere ' + n);
    }
  });

  // Rival que huye con poca vida: Sf y marca de desprecio
  const it = setInterval(() => {
    if (!bot.entity) return;
    const t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) { hist = []; return; }
    const d = t.position.distanceTo(bot.entity.position), ahora = Date.now();
    hist.push({ t: ahora, d });
    while (hist.length && ahora - hist[0].t > 3500) hist.shift();
    const hp = t.metadata && t.metadata[9];
    if (hist.length > 3 && d - hist[0].d > 5 && typeof hp === 'number' && hp < 8 && ahora - huyoMarca > 20_000) {
      huyoMarca = ahora; sf(1, t.username + ' huye'); try { if (memoria && memoria.huyo) memoria.huyo(t.username); } catch (e) { /* ignorar */ }
    }
  }, 1000);
  bot.once('end', () => clearInterval(it));

  const api = { sf, hm, neto: () => neto, resumen: () => `Sf ${stats.v('sf').toFixed(0)} / Hm ${stats.v('hm').toFixed(0)}` };
  bot._premio = api;
  return api;
}
module.exports = { crearPremio };
