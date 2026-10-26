const diag = require('./diag');

// Resume cada pelea contra un jugador y la guarda en memoria (duracion, dano, armas del rival, resultado, contra usada)
function crearPeleas(bot, memoria) {
  let f = null, hpPrev = null, sinObj = 0;
  const cerrar = (res) => {
    if (!f) return;
    const dur = Math.round((Date.now() - f.t0) / 1000);
    if (bot._bandits) { if (dur >= 4) { bot._bandits.perfilFin(res, f.dano, bot._premio ? bot._premio.neto() - f.neto0 : 0); if (f.clave && bot._bandits.lecReg) bot._bandits.lecReg(f.clave, res); } else bot._bandits.descartar(); }
    if (dur >= 4) {
      const p = { t: Date.now(), dur, res, adv: Math.round((f.adv || 0) * 100) / 100, dano: Math.round(f.dano), armas: [...f.armas].slice(0, 4), contra: f.contra || null };
      memoria.pelea(f.n, p);
      diag.log('info', 'peleas', `${f.n}: ${res} ${dur}s dano ${p.dano} armas ${p.armas.join('+')}`);
    }
    if (dur >= 4 && bot._premio) { if (res === 'gane') bot._premio.gana(bot.heldItem && bot.heldItem.name, f.n, f.adv); else if (res === 'perdi') bot._premio.pierde(f.n, f.adv); }
    if (bot._nn && dur >= 4) bot._nn.fin(res);
    if (bot._armaFin && dur >= 4) bot._armaFin(res);
    if (bot._eventos && dur >= 4) bot._eventos.registrar('pelea', res === 'gane' ? `le gane a ${f.n} en ${dur}s` : res === 'perdi' ? `${f.n} me derroto en ${dur}s` : `pelea con ${f.n} sin ganador`, f.n);
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
      if (!f) { const a0 = (j.heldItem && j.heldItem.name) || ''; const cl = /mace/.test(a0) ? 'mace' : /crystal|anchor/.test(a0) ? 'cristal' : /_sword/.test(a0) ? 'espada' : /_axe/.test(a0) ? 'hacha' : /bow|trident/.test(a0) ? 'rango' : 'otro'; const mo0 = memoria.modelo ? memoria.modelo(j.username) : null; const mo = bot._muertesPor ? Object.assign({}, mo0, { muertes: bot._muertesPor(j.username) }) : mo0; const cl2 = cl === 'otro' && mo && mo.clase ? mo.clase : cl; const dim = String((bot.game && bot.game.dimension) || ''); const noche = bot.time && bot.time.timeOfDay >= 13000; const terr = /nether|end/.test(dim) ? dim.replace(/.*:/, '') : bot.entity.position.y < 50 ? 'sub' : 'sup'; const clave = cl2 + '|' + (noche ? 'n' : 'd') + '|' + terr; if (bot._bandits) bot._bandits.perfilIniciar(j.username + '|' + cl, clave, bot._lag && bot._lag.rival(j) ? Object.assign({}, mo, { huye: 0.4 }) : mo); f = { adv: bot._premio ? bot._premio.ventaja(j) : 0, neto0: bot._premio ? bot._premio.neto() : 0, clave, n: j.username, t0: Date.now(), dano: 0, armas: new Set(), contra: null }; hpPrev = bot.health; }
      const a = j.heldItem && j.heldItem.name; if (a) f.armas.add(a);
      if (bot._contraActual && bot._contraActual()) f.contra = bot._contraActual();
    } else if (f && ++sinObj > 15) cerrar('corte');
  }, 1000);
  bot.once('end', () => { clearInterval(it); cerrar('corte'); });
}
module.exports = { crearPeleas };
