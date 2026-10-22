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

  let ring = [], fase = 0, ultFase = 0;
  function fino(A, paso) {
    const ahora = Date.now(), p = bot.entity.position;
    const meta = bot.pathfinder && bot.pathfinder.goal;
    if (!meta || bot.targetDigBlock || !(bot.pathfinder.isMoving && bot.pathfinder.isMoving())) { ring = []; fase = 0; return; }
    ring.push({ t: ahora, p: p.clone() });
    while (ring.length && ahora - ring[0].t > 9000) ring.shift();
    if (ring.length < 4 || ahora - ring[0].t < 7000) return;
    let maxD = 0;
    for (const r of ring) maxD = Math.max(maxD, r.p.distanceTo(p));
    if (maxD > 1.2) { fase = 0; return; }
    if (ahora - ultFase < 7000) return;
    ultFase = ahora; fase++;
    if (fase === 1) {
      try { bot.pathfinder.setGoal(null); bot.pathfinder.setGoal(meta, !!meta.dynamic); } catch (e) { /* ignorar */ }
      bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 400);
    } else if (fase === 2) {
      const yaw = Math.random() * Math.PI * 2;
      try { bot.look(yaw, 0, true); } catch (e) { /* ignorar */ }
      for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, true);
      setTimeout(() => { for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, false); }, 1200);
    } else if (fase === 3) {
      try {
        const V = require('vec3'), dir = bot.entity.yaw, dx = -Math.sin(dir), dz = -Math.cos(dir);
        for (const dy of [1, 0]) {
          const b = bot.blockAt(p.offset(Math.round(dx), dy, Math.round(dz)));
          if (b && b.boundingBox === 'block' && bot.canDigBlock(b)) { bot.dig(b).catch(() => {}); break; }
        }
      } catch (e) { /* ignorar */ }
    } else {
      fase = 0; ring = [];
      nivel = Math.max(nivel, 1); actuar(paso);
    }
    diag.log('warn', 'atasco', `sin avance ${fase} paso ${paso || '-'} en ${p.floored()}`);
  }

  const it = setInterval(() => {
    const A = bot._abasto;
    if (!bot.entity || bot.health === undefined || !A || !A.activo() || rival() || bot.isSleeping || (bot._nado && bot._nado.activo()) || (bot._curando && bot._curando())) { ref = null; nivel = 0; return; }
    const paso = A.paso ? A.paso() : null;
    if (paso && ESPERA.test(paso)) { ref = null; nivel = 0; return; }
    fino(A, paso);
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
