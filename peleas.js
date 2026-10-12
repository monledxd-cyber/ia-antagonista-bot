const diag = require('./diag');

// Resume cada pelea contra un jugador y la guarda en memoria (duracion, dano, armas del rival, resultado, contra usada)
function crearPeleas(bot, memoria) {
  let f = null, hpPrev = null, sinObj = 0;
  const cerrar = (res) => {
    if (!f) return;
    const dur = Math.round((Date.now() - f.t0) / 1000);
    if (bot._bandits) { if (dur >= 4) bot._bandits.perfilFin(res, f.dano); else bot._bandits.descartar(); }
    if (dur >= 4) {
      const p = { t: Date.now(), dur, res, dano: Math.round(f.dano), armas: [...f.armas].slice(0, 4), contra: f.contra || null };
      memoria.pelea(f.n, p);
      diag.log('info', 'peleas', `${f.n}: ${res} ${dur}s dano ${p.dano} armas ${p.armas.join('+')}`);
    }
    f = null;
  };
  bot.on('health', () => { const h = bot.health; if (f && hpPrev !== null && h < hpPrev) f.dano += hpPrev - h; hpPrev = h; });
  bot.on('entityDead', (e) => { if (f && e && e.type === 'player' && e.username === f.n) cerrar('gane'); });
  bot.on('death', () => cerrar('perdi'));
  const it = setInterval(() => {
    if (!bot.entity) return;
    const t = bot.pvp && bot.pvp.target;
    const j = t && t.type === 'player' && t.username ? t : null;
    if (j) {
      sinObj = 0;
      if (f && f.n !== j.username) cerrar('corte');
      if (!f) { const a0 = (j.heldItem && j.heldItem.name) || ''; const cl = /mace/.test(a0) ? 'mace' : /crystal|anchor/.test(a0) ? 'cristal' : /_sword/.test(a0) ? 'espada' : /_axe/.test(a0) ? 'hacha' : /bow|trident/.test(a0) ? 'rango' : 'otro'; if (bot._bandits) bot._bandits.perfilIniciar(j.username + '|' + cl); f = { n: j.username, t0: Date.now(), dano: 0, armas: new Set(), contra: null }; hpPrev = bot.health; }
      const a = j.heldItem && j.heldItem.name; if (a) f.armas.add(a);
      if (bot._contraActual && bot._contraActual()) f.contra = bot._contraActual();
    } else if (f && ++sinObj > 15) cerrar('corte');
  }, 1000);
  bot.once('end', () => { clearInterval(it); cerrar('corte'); });
}
module.exports = { crearPeleas };
