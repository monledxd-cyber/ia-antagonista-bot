const fs = require('fs');

function crearSesion(bot, ruta, version) {
  const ini = Date.now();
  const ev = {};
  let muertes = 0, ultLog = 0;
  const id = new Date(ini).toISOString();

  const envolver = () => {
    const p = bot._premio;
    if (!p || p._ses || typeof p.evento !== 'function') return;
    const f = p.evento;
    p.evento = function (r) { ev[r] = (ev[r] || 0) + 1; return f.apply(this, arguments); };
    p._ses = true;
  };
  bot.on('death', () => { muertes++; });

  const foto = () => {
    const o = { id, version, min: Math.round((Date.now() - ini) / 60000), muertes, eventos: ev };
    try { if (bot._atascos) o.atascos = bot._atascos.lista().filter((a) => a.t >= ini).length; } catch (e) { /* ignorar */ }
    try { if (bot._golpe) o.golpe = bot._golpe.resumen(); } catch (e) { /* ignorar */ }
    try { const pa = bot._nn && bot._nn.predAtaque && bot._nn.predAtaque(); if (pa) o.predAtaque = { swing: +pa.swing.toFixed(2), hurt: +pa.hurt.toFixed(2), fiable: !!pa.fiable }; } catch (e) { /* ignorar */ }
    try { const st = bot._nn && bot._nn.estado && bot._nn.estado(); if (st) o.nn = { pn: st.pn, pv: st.pv }; } catch (e) { /* ignorar */ }
    try { if (bot._metas) o.metas = Object.keys(bot._metas.hechas()).length; } catch (e) { /* ignorar */ }
    return o;
  };

  const guardar = () => {
    try {
      let h = [];
      try { h = JSON.parse(fs.readFileSync(ruta, 'utf8')) || []; } catch (e) { h = []; }
      const o = foto();
      const i = h.findIndex((x) => x.id === id);
      if (i >= 0) h[i] = o; else h.push(o);
      if (h.length > 200) h = h.slice(-200);
      fs.writeFileSync(ruta, JSON.stringify(h));
    } catch (e) { /* ignorar */ }
  };

  const linea = () => {
    const o = foto();
    const top = Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`[sesion] v${version} ${o.min}min muertes=${muertes} atascos=${o.atascos === undefined ? '-' : o.atascos} metas=${o.metas === undefined ? '-' : o.metas}` + (o.golpe ? ` golpe=${(o.golpe.llenos * 100).toFixed(0)}%llenos/${(o.golpe.crit * 100).toFixed(0)}%crit` : '') + (o.predAtaque ? ` pred=${o.predAtaque.swing}/${o.predAtaque.hurt}${o.predAtaque.fiable ? '' : '?'}` : '') + (top ? ' | ' + top : ''));
  };

  setTimeout(envolver, 2000);
  const iv = setInterval(() => { envolver(); guardar(); if (Date.now() - ultLog > 300000) { ultLog = Date.now(); linea(); } }, 60000);
  if (iv.unref) iv.unref();
  bot.once('end', () => { clearInterval(iv); guardar(); });
  const api = { guardar, resumen: foto, linea };
  bot._sesion = api;
  return api;
}
module.exports = { crearSesion };
