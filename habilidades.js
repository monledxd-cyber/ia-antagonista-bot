const fs = require('fs');

function crearHabilidades(bot, ruta) {
  let d = {}, sucio = false;
  try { d = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { d = {}; }
  for (const k of Object.keys(d)) if (d[k] && d[k].seguidos) d[k].seguidos = 0;
  const EXENTOS = /^(horno|base|guardar|cofre|dormir|granja|lava|tnt|rearmar|sondeo|rastrear|recuperar|claves|cosecha|equipo|yunque|trampas|explorar|mina|botin|asalto|nether|end)$/;
  const ESENCIAL = /^(madera|piedra|mesa|palos|equipo|comida|carne|carbon)$/;
  const g = (n) => { const h = (d[n] = d[n] || { ok: 0, fail: 0, dudoso: 0, seguidos: 0, ult: 0, ms: 0 }); if (h.seguidos && h.ult && Date.now() - h.ult > 3 * 60_000) { h.seguidos = 0; sucio = true; } return h; };

  function snap() {
    const inv = {};
    for (const i of bot.inventory.items()) inv[i.name] = (inv[i.name] || 0) + i.count;
    const eq = [5, 6, 7, 8, 45].map((s) => (bot.inventory.slots[s] && bot.inventory.slots[s].name) || '').join(',');
    return { inv, eq, food: bot.food, xp: bot.experience && bot.experience.points, pos: bot.entity && bot.entity.position.clone() };
  }
  function cambio(a, b) {
    if (a.eq !== b.eq || a.xp !== b.xp) return true;
    const claves = new Set([...Object.keys(a.inv), ...Object.keys(b.inv)]);
    for (const k of claves) if ((a.inv[k] || 0) !== (b.inv[k] || 0)) return true;
    return false;
  }

  // Devuelve 'ok' | 'dudoso' | 'fallo'. Un "exito" sin ningun cambio observable cuenta como dudoso.
  const ctx = () => {
    try {
      const dim = String((bot.game && bot.game.dimension) || '').replace(/.*:/, '');
      const noche = bot.time && bot.time.timeOfDay >= 13000;
      const y = bot.entity ? bot.entity.position.y : 64;
      return (dim && dim !== 'overworld' ? dim : y < 50 ? 'sub' : 'sup') + (noche ? 'N' : 'D');
    } catch (e) { return 'x'; }
  };
  function registrar(nombre, r, antes, ms) {
    const h = g(nombre);
    const hc = g(nombre + '@' + ctx());
    let v = 'fallo';
    if (r) v = (EXENTOS.test(nombre) || cambio(antes, snap())) ? 'ok' : 'dudoso';
    h.ult = Date.now(); h.ms = Math.round((h.ms * 0.7) + ms * 0.3);
    if (v === 'ok') hc.ok++; else if (v === 'dudoso') hc.dudoso++; else hc.fail++;
    if (v === 'ok') { h.ok++; h.seguidos = 0; } else if (v === 'dudoso') { h.dudoso++; h.seguidos++; } else { h.fail++; h.seguidos++; }
    if (v === 'dudoso' && h.seguidos < 3) h.seguidos = Math.max(0, h.seguidos - 1);
    sucio = true;
    return v;
  }
  // Espera exponencial con jitter segun fallos seguidos.
  function espera(nombre) {
    const h = g(nombre);
    const base = 5_000 * Math.pow(2, Math.min(Math.max(h.seguidos - 1, 0), 4));
    const tope = ESENCIAL.test(nombre) ? 20_000 : 45_000;
    return Math.round(Math.min(base, tope) * (0.7 + Math.random() * 0.6));
  }
  const atascado = (nombre) => g(nombre).seguidos >= 5;
  const tasaDe = (h) => { const t = h.ok + h.fail + h.dudoso; return t ? h.ok / t : 0.5; };
  const tasa = (nombre) => {
    const h = g(nombre), c = g(nombre + '@' + ctx()), n = c.ok + c.fail + c.dudoso;
    const w = n / (n + 4);
    return w * tasaDe(c) + (1 - w) * tasaDe(h);
  };
  const resumen = () => Object.fromEntries(Object.entries(d).filter(([k]) => !k.includes('@')).map(([k, h]) => [k, `${h.ok}/${h.fail}/${h.dudoso} seg${h.seguidos} ${Math.round(h.ms / 1000)}s`]));
  function guardar() { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } }
  const t = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(t); guardar(); });
  return { snap, registrar, espera, atascado, tasa, resumen, guardar };
}

module.exports = { crearHabilidades };
