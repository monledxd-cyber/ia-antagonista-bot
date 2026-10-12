const { goals } = require('mineflayer-pathfinder');
const { pick } = require('./frases');

function crearAcecho(bot, o) {
  const { memoria, diag } = o;
  const ON = process.env.IA_ACECHO !== '0';
  const cooldown = {};
  const ob = (n) => { const v = memoria.vec(n); return v.obsesion + v.rencor; };
  let st = null;
  const jugador = (n) => { const p = bot.players[n]; return p && p.entity; };
  const dist = (e) => e.position.distanceTo(bot.entity.position);
  const vida = (e) => { const h = e && e.metadata && e.metadata[9]; return typeof h === 'number' && h >= 0 && h <= 40 ? h : null; };
  const decir = (t) => { try { bot.chat(t.slice(0, 200)); } catch (e) { /* ignorar */ } };
  const susurrar = (n, t) => { try { bot.chat(`/msg ${n} ${t}`.slice(0, 220)); } catch (e) { /* ignorar */ } };

  const tormento = setInterval(() => {
    if (!ON || !bot.entity) return;
    const now = Date.now(), tg = bot.pvp && bot.pvp.target, T = bot._tormento;
    if (T) {
      const e = jugador(T.n);
      const golpeado = diag.estado.vida.ultimoDano && now - diag.estado.vida.ultimoDano < 2500;
      if (now > T.hasta || !e || golpeado || bot.health < 10 || dist(e) > 40) { bot._tormento = null; cooldown[T.n] = now + 120_000; return; }
      try { bot.pathfinder.setGoal(new goals.GoalFollow(e, 8), true); } catch (x) { /* ignorar */ }
      return;
    }
    if (!tg || tg.type !== 'player' || bot.health < 14 || (cooldown[tg.username] || 0) > now || memoria.odio(tg.username) < 2) return;
    const h = vida(tg);
    if (h === null || h > 5) return;
    if (Math.random() > Math.min(0.95, (0.5 + (memoria.vec(tg.username).desprecio + memoria.vec(tg.username).obsesion * 0.5) * 0.03) * (bot._sadismo ? bot._sadismo() : 1) * require('./pesos').rasgo('paciencia'))) { cooldown[tg.username] = now + 60_000; return; }
    bot._tormento = { n: tg.username, hasta: now + 25_000 + Math.random() * 20_000 };
    try { bot.pvp.stop(); } catch (x) { /* ignorar */ }
    decir(pick('tormento', tg.username));
    diag.log('info', 'tormento', 'perdona a ' + tg.username + ' un rato');
  }, 300);

  const acecho = setInterval(() => {
    if (!ON || !bot.entity) return;
    if (bot._tormento || (bot.pvp && bot.pvp.target) || bot.health < 14 || (bot._modoEquipo || 0) > Date.now()) { st = null; return; }
    if (bot._abasto && bot._abasto.activo()) return;
    if (bot.time && bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23000) { st = null; return; }
    if (bot.game && bot.game.dimension && !/overworld/.test(bot.game.dimension)) return;
    const now = Date.now();
    if (!st) {
      if (bot.health < 16 || Math.random() > 0.15) return;
      const c = Object.keys(bot.players).filter((n) => n !== bot.username && jugador(n) && dist(jugador(n)) > 22 && dist(jugador(n)) < 60 && memoria.odio(n) >= 1 && (cooldown[n] || 0) < now)
        .sort((a, b) => ob(b) - ob(a))[0];
      if (!c) return;
      st = { n: c, fase: 'observar', hasta: now + 40_000 + Math.random() * 50_000 };
      diag.log('info', 'acecho', 'observa a ' + c);
      return;
    }
    const e = jugador(st.n);
    try {
      if (st.fase === 'observar') {
        if (!e || dist(e) < 20) { cooldown[st.n] = now + 120_000; st = null; return; }
        bot.pathfinder.setGoal(new goals.GoalFollow(e, 26), true);
        if (now > st.hasta) {
          st.fase = 'mensaje';
        }
      } else if (st.fase === 'mensaje') {
        susurrar(st.n, pick('mensaje', st.n, memoria.ultDijo(st.n)));
        const a = Math.random() * Math.PI * 2, p = (e || bot.entity).position;
        st.dest = { x: Math.round(p.x + Math.cos(a) * 70), z: Math.round(p.z + Math.sin(a) * 70) };
        st.fase = 'desaparecer'; st.hasta = now + 60_000 + Math.random() * 60_000;
      } else if (st.fase === 'desaparecer') {
        bot.pathfinder.setGoal(new goals.GoalXZ(st.dest.x, st.dest.z), true);
        if (now > st.hasta) { st.fase = 'emboscar'; st.hasta = now + 60_000; }
      } else if (st.fase === 'emboscar') {
        if (!e || now > st.hasta) { cooldown[st.n] = now + 300_000; st = null; return; }
        bot.pathfinder.setGoal(new goals.GoalNear(e.position.x, e.position.y, e.position.z, 4), true);
        if (dist(e) < 18) { cooldown[st.n] = now + 300_000; st = null; }
      }
    } catch (x) { st = null; }
  }, 1000);


  let ultPos = null, quietoDesde = Date.now(), umbral = 12_000 + Math.random() * 13_000;
  const cuentaLogs = () => bot.inventory.items().filter((i) => /_log$/.test(i.name)).reduce((a, i) => a + i.count, 0);
  const ocio = setInterval(() => {
    if (!ON || !bot.entity) return;
    const now = Date.now(), p = bot.entity.position;
    if (!ultPos || p.distanceTo(ultPos) > 1.5 || (bot.pathfinder && bot.pathfinder.isMoving())) { ultPos = p.clone(); quietoDesde = now; return; }
    if (now - quietoDesde < umbral) return;
    if (bot._tormento || (bot.pvp && bot.pvp.target) || bot.isSleeping || bot._pausaAbasto || bot._volando || bot.currentWindow || (bot._retirada || 0) > now || bot.health < 8 || (bot._abasto && bot._abasto.activo())) { quietoDesde = now; return; }
    quietoDesde = now; umbral = 8_000 + Math.random() * 20_000;
    try {
      const r = Math.random();
      if (r < 0.15) { bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.8, false); return; }
      if (cuentaLogs() < 8 && r < 0.7) {
        const b = bot.findBlock({ maxDistance: Math.round(24 + Math.random() * 56), matching: (x) => x && /_log$/.test(x.name) });
        if (b) { bot.pathfinder.setGoal(new goals.GoalNear(b.position.x, b.position.y, b.position.z, 2)); diag.log('info', 'ocio', 'va por madera'); return; }
      }
      if (r < 0.55) {
        const c = Object.keys(bot.players).filter((n) => n !== bot.username && memoria.ultimo(n)).sort((a, b) => ob(b) - ob(a))[0];
        const u = c && memoria.ultimo(c);
        if (u && now - u.t < 3 * 3600_000) { bot.pathfinder.setGoal(new goals.GoalNear(u.x, u.y, u.z, 18 + Math.random() * 10)); diag.log('info', 'ocio', 'revisa donde vio a ' + c); return; }
      }
      const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 65;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (o.peligro && o.peligro({ x, y: p.y, z }, 14)) return;
      bot.pathfinder.setGoal(new goals.GoalNear(x, p.y, z, 3));
      diag.log('info', 'ocio', 'recorre la zona');
    } catch (e) { /* ignorar */ }
  }, 2000);
  bot.once('end', () => { clearInterval(tormento); clearInterval(acecho); clearInterval(ocio); });
  return {
    fase: () => (bot._tormento ? 'tormento' : st ? 'acecho_' + st.fase : ''),
    radar: () => Object.keys(bot.players).filter((n) => n !== bot.username).map((n) => {
      const u = memoria.ultimo(n), e = jugador(n);
      return { n, r: memoria.odio(n), d: memoria.dominante(n), s: e ? `cerca(${Math.round(dist(e))}m)` : u ? `visto hace ${Math.round((Date.now() - u.t) / 60000)}min en ${u.x},${u.z}` : 'sin datos' };
    }).sort((a, b) => b.r - a.r).slice(0, 3).map((x) => `${x.n}[${x.d}]: ${x.s}`).join(' | '),
  };
}
module.exports = { crearAcecho };
