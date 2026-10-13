const fs = require('fs');

// Stats globales de AM: odio (sin tope) y sadismo (sin tope). Escala logaritmica: sube sin limite, cada vez mas lento.
function crearStats(ruta) {
  let d = { odio: 10, sadismo: 5, sf: 0, hm: 0 }, sucio = false;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  const v = (k) => d[k] || 0;
  const mult = (k) => 1 + 0.35 * Math.log10(1 + v(k));
  const nivel = (k) => Math.floor(Math.log2(1 + v(k)));
  function sumar(k, n) { if (n > 0) { d[k] = v(k) + n; sucio = true; } }
  function guardar() { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } }
  const resumen = () => `odio nivel ${nivel('odio')} (${v('odio').toFixed(0)}), sadismo nivel ${nivel('sadismo')} (${v('sadismo').toFixed(0)}), Sf ${v('sf').toFixed(0)}, Hm ${v('hm').toFixed(0)}`;
  return { v, mult, nivel, sumar, guardar, resumen };
}

// Hooks del bot: como crecen las stats y como afectan el comportamiento
function conectarStats(bot, stats, diag) {
  let hpPrev = null, ultGolpe = 0, ultJuego = 0;
  bot._stats = stats;
  bot._sadismo = () => stats.mult('sadismo');
  bot.on('health', () => {
    const h = bot.health;
    if (hpPrev !== null && h < hpPrev) {
      stats.sumar('odio', (hpPrev - h) * 0.15);
      const t = bot.pvp && bot.pvp.target;
      let a = t && t.type === 'player' ? t : null;
      if (!a && bot.entity) a = Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username && e.position && e.position.distanceTo(bot.entity.position) < 7).sort((p, q) => p.position.distanceTo(bot.entity.position) - q.position.distanceTo(bot.entity.position))[0];
      if (a && bot._sumarVec) bot._sumarVec(a.username, 'ira', (hpPrev - h) * 0.3);
    }
    hpPrev = h;
  });
  bot.on('death', () => stats.sumar('odio', 8));
  bot.on('entityHurt', (e) => {
    const t = bot.pvp && bot.pvp.target;
    if (t && e === t && e.type === 'player' && Date.now() - ultGolpe > 400) { ultGolpe = Date.now(); stats.sumar('sadismo', 0.15); }
  });
  const pasivo = setInterval(() => { stats.sumar('odio', 0.05); diag.estado.stats = stats.resumen(); stats.guardar(); }, 60_000);

  // Sadismo alto: juega con la presa casi muerta (burla agachandose) antes de rematarla
  const juego = setInterval(() => {
    if (!bot.entity || bot.health < 10 || Date.now() - ultJuego < 25_000) return;
    const t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position || t.position.distanceTo(bot.entity.position) > 4) return;
    const hp = t.metadata && t.metadata[9];
    if (typeof hp !== 'number' || hp > 4) return;
    if (Math.random() > 0.12 * (stats.mult('sadismo') - 1) * 3) return;
    ultJuego = Date.now();
    diag.log('info', 'stats', 'sadismo: se burla de ' + t.username);
    try { bot.pvp.stop(); bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    let n = 0;
    const tog = setInterval(() => { bot.setControlState('sneak', n % 2 === 0); if (++n > 7) { clearInterval(tog); bot.setControlState('sneak', false); try { if (t.isValid !== false && bot.pvp && !bot.pvp.target) bot.pvp.attack(t); } catch (e) { /* ignorar */ } } }, 160);
  }, 500);
  bot.once('end', () => { clearInterval(pasivo); clearInterval(juego); stats.guardar(); });
}

module.exports = { crearStats, conectarStats };
