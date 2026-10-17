const diag = require('./diag');

function crearBucle(bot) {
  let ult = Date.now(), max = 0, n = 0, suma = 0;
  const it = setInterval(() => {
    const ahora = Date.now(), lag = Math.max(0, ahora - ult - 200);
    ult = ahora; bot._atraso = lag; n++; suma += lag; if (lag > max) max = lag;
    if (lag > 500) { const p = bot._abasto && bot._abasto.paso ? bot._abasto.paso() : ''; diag.log('warn', 'bucle', `bloqueado ${lag} ms (paso ${p || '-'})`); console.log(`[bucle] bloqueado ${lag} ms paso=${p || '-'}`); }
  }, 200);
  bot.on('path_update', (r) => {
    if (r && r.time > 800) { diag.log('warn', 'bucle', `ruta ${r.status} calculo ${Math.round(r.time)} ms nodos ${r.visitedNodes}`); console.log(`[bucle] ruta ${r.status} calculo ${Math.round(r.time)} ms nodos=${r.visitedNodes} largo=${r.path ? r.path.length : 0}`); }
  });
  const rep = setInterval(() => { diag.estado.bucle = `max ${max} ms prom ${n ? Math.round(suma / n) : 0} ms`; max = 0; n = 0; suma = 0; }, 30_000);
  for (const nombre of ['findBlocks', 'findBlock']) {
    const orig = bot[nombre];
    if (typeof orig !== 'function') continue;
    bot[nombre] = function (o) {
      const t = Date.now(), r = orig.apply(this, arguments), d = Date.now() - t;
      if (d > 150) { const w = String(new Error().stack).split('\n')[2] || ''; diag.log('warn', 'bucle', `${nombre} ${d} ms dist ${o && o.maxDistance} n ${o && o.count} ${w.trim().slice(0, 90)}`); console.log(`[bucle] ${nombre} ${d} ms dist=${o && o.maxDistance} count=${o && o.count} ${w.trim().slice(0, 90)}`); }
      return r;
    };
  }
  bot.once('end', () => { clearInterval(it); clearInterval(rep); });
}
module.exports = { crearBucle };
