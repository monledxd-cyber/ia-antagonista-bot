const diag = require('./diag');

const ESPERA = /^(horno|fundir|carne|dormir|pesca|encantar|pociones|nether|end)$/;

function crearAtasco(bot) {
  let ref = null, nivel = 0, total = 0;
  const firma = () => {
    const inv = bot.inventory.items().reduce((a, i) => a + i.count, 0);
    return { inv, food: bot.food, hp: Math.round(bot.health) };
  };
  const rival = () => bot.pvp && bot.pvp.target;

  function actuar(paso) {
    total++;
    const A = bot._abasto;
    if (nivel === 1) {
      bot._abortarPaso = true;
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      if (A && A.forzarFallo && paso) A.forzarFallo(paso);
    } else if (nivel === 2) {
      const yaw = Math.random() * Math.PI * 2;
      try { bot.look(yaw, 0, true); } catch (e) { /* ignorar */ }
      for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, true);
      setTimeout(() => { for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, false); }, 1800);
      if (A && A.forzarFallo && paso) A.forzarFallo(paso);
    } else {
      bot._pausaAbasto = true;
      setTimeout(() => { bot._pausaAbasto = false; }, 4000);
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    }
    if (bot._premio) bot._premio.evento('atasco', { k: paso || 'sin_paso' });
    if (bot._mapa && nivel >= 2) bot._mapa.marcarPeligro(bot.entity.position, 0.5, 'atasco');
    diag.estado.atasco = `${total} atascos, ultimo nivel ${nivel} en ${paso || 'ningun paso'}`;
    diag.log('warn', 'atasco', `nivel ${nivel} paso ${paso || '-'} en ${bot.entity.position.floored()}`);
  }

  const it = setInterval(() => {
    const A = bot._abasto;
    if (!bot.entity || bot.health === undefined || !A || !A.activo() || rival() || bot.isSleeping || (bot._nado && bot._nado.activo()) || (bot._curando && bot._curando())) { ref = null; nivel = 0; return; }
    const paso = A.paso ? A.paso() : null;
    if (paso && ESPERA.test(paso)) { ref = null; nivel = 0; return; }
    const ahora = Date.now(), p = bot.entity.position, f = firma();
    if (!ref || ref.paso !== paso || p.distanceTo(ref.p) > 2.5 || f.inv !== ref.f.inv || f.food !== ref.f.food || f.hp !== ref.f.hp) { ref = { p: p.clone(), f, paso, t: ahora }; nivel = 0; return; }
    const seg = (ahora - ref.t) / 1000;
    const umbral = [40, 70, 110][nivel];
    if (umbral !== undefined && seg >= umbral) { nivel++; actuar(paso); }
    else if (nivel >= 3 && seg >= 160) { ref.t = ahora; nivel = 0; }
  }, 2000);
  bot.once('end', () => clearInterval(it));
  return {};
}
module.exports = { crearAtasco };
