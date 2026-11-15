const diag = require('./diag');

let tArea = 0;
const PRESUP = () => Number(process.env.IA_BUSQ_MS) || 4000;
function expandir(orig, ctx, o, ahora) {
  const max = o && o.maxDistance, now = ahora || Date.now;
  if (process.env.IA_BUSQ_EXP === '0' || !(max > 20)) return orig.call(ctx, o);
  const cnt = o.count || 1, pasos = [16, 28, 44, 64, 96].filter((x) => x < max).concat(max);
  let r = [];
  const t0 = now();
  for (const d of pasos) {
    if (d > pasos[0] && tArea * d * d > PRESUP() - (now() - t0)) break;
    const t = now();
    r = orig.call(ctx, Object.assign({}, o, { maxDistance: d }));
    const m = (now() - t) / (d * d);
    tArea = tArea ? 0.6 * tArea + 0.4 * m : m;
    if (r.length >= cnt) return r;
  }
  return r;
}

function crearBucle(bot) {
  let ult = Date.now(), max = 0, n = 0, suma = 0;
  const it = setInterval(() => {
    const ahora = Date.now(), lag = Math.max(0, ahora - ult - 200);
    ult = ahora; bot._atraso = lag; n++; suma += lag; if (lag > max) max = lag;
    if (lag > 500) { const p = bot._abasto && bot._abasto.paso ? bot._abasto.paso() : ''; diag.log('warn', 'bucle', `bloqueado ${lag} ms (paso ${p || '-'})`); console.log(`[bucle] bloqueado ${lag} ms paso=${p || '-'}`); }
  }, 200);
  const atr = diag.estado.atrapado = { n: 0, veces: 0, t: 0, nodos: 0, pos: null, modo: '' };
  bot.on('path_update', (r) => {
    if (r && r.status === 'noPath' && r.visitedNodes < 250 && bot.entity) {
      const p = bot.entity.position;
      if (atr.pos && Math.hypot(p.x - atr.pos.x, p.z - atr.pos.z) > 12) atr.n = 0;
      if (!atr.n) atr.pos = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
      atr.n++; atr.t = Date.now(); atr.nodos = r.visitedNodes; atr.modo = String((bot.game && bot.game.gameMode) || '');
      if (atr.n >= 12) { atr.veces++; atr.n = 0; bot._atrapadoHasta = Date.now() + 45000; }
    } else if (r && r.status === 'success') atr.n = 0;
    if (r && r.time > 800) { diag.log('warn', 'bucle', `ruta ${r.status} calculo ${Math.round(r.time)} ms nodos ${r.visitedNodes}`); console.log(`[bucle] ruta ${r.status} calculo ${Math.round(r.time)} ms nodos=${r.visitedNodes} largo=${r.path ? r.path.length : 0}`); }
  });
  const sol = setInterval(() => {
    const yo = bot.entity && bot.entity.position;
    bot._sinJugadores = !yo || !Object.values(bot.entities).some((e) => e && e.type === 'player' && e !== bot.entity && e.position && e.position.distanceTo(yo) < 64);
  }, 2000);
  const ent = setInterval(() => { try { if (bot.entity) diag.estado.entorno = require('./entorno').mapa(bot); } catch (e) { /* ignorar */ } }, 20000);
  const rep = setInterval(() => { diag.estado.bucle = `max ${max} ms prom ${n ? Math.round(suma / n) : 0} ms`; max = 0; n = 0; suma = 0; }, 30_000);
  require('./bloques_rapido').instalar(bot);
  for (const nombre of ['findBlocks', 'findBlock']) {
    const orig = bot[nombre];
    if (typeof orig !== 'function') continue;
    bot[nombre] = function (o) {
      if (process.env.RENDER && o && o.maxDistance > 24) o = Object.assign({}, o, { maxDistance: 24 });
      const t = Date.now(), r = nombre === 'findBlocks' ? expandir(orig, this, o) : orig.apply(this, arguments), d = Date.now() - t;
      if (d > 100) bot._pausaBusq = Date.now() + d * 3;
      if (d > 150) { const w = String(new Error().stack).split('\n')[2] || ''; diag.log('warn', 'bucle', `${nombre} ${d} ms dist ${o && o.maxDistance} n ${o && o.count} ${w.trim().slice(0, 90)}`); console.log(`[bucle] ${nombre} ${d} ms dist=${o && o.maxDistance} count=${o && o.count} ${w.trim().slice(0, 90)}`); }
      return r;
    };
  }
  bot.once('end', () => { clearInterval(it); clearInterval(rep); clearInterval(sol); clearInterval(ent); });
}
module.exports = { crearBucle, expandir, _tArea: (v) => { if (v !== undefined) tArea = v; return tArea; } };
