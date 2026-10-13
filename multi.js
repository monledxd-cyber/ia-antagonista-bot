const { ignorado } = require('./modo');
const { goals } = require('mineflayer-pathfinder');
const diag = require('./diag');

// Combate contra varios rivales: foco en el mas debil, pasillo para pelear de a uno, retirada si son demasiados
function crearMulti(bot, o) {
  let ultCambio = 0, ultPasillo = 0, modo = null;
  const dist = (e) => e.position.distanceTo(bot.entity.position);
  const rivales = (r) => Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username && !ignorado(bot, e) && e.gameMode !== 'creative' && e.position && dist(e) < r);
  const solido = (p) => { const b = bot.blockAt(p); return !!b && b.boundingBox === 'block'; };
  const pie = (p) => { const a = bot.blockAt(p), b = bot.blockAt(p.offset(0, 1, 0)); return !!a && !!b && a.boundingBox === 'empty' && b.boundingBox === 'empty' && solido(p.offset(0, -1, 0)); };

  function puntaje(e) {
    const hp = (e.metadata && typeof e.metadata[9] === 'number') ? e.metadata[9] : 20;
    const arm = [3, 4, 5, 6].filter((s) => e.equipment && e.equipment[s]).length * 3;
    const v = o.vec(e.username);
    return hp + arm + dist(e) * 0.8 - (v.rencor + v.ira) * 0.15;
  }

  // Cuantos vecinos abiertos tiene una celda (cuanto menor, mas estrecho)
  function aperturas(p) {
    let n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (pie(p.offset(dx, 0, dz))) n++;
    return n;
  }
  function buscarPasillo(rs) {
    const c = bot.entity.position.floored();
    const cx = rs.reduce((a, e) => a + e.position.x, 0) / rs.length, cz = rs.reduce((a, e) => a + e.position.z, 0) / rs.length;
    let mejor = null, mp = 1e9;
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) for (let dy = -2; dy <= 2; dy++) {
      const p = c.offset(dx, dy, dz);
      if (!pie(p)) continue;
      const ap = aperturas(p);
      if (ap > 3) continue;
      const dR = Math.hypot(p.x - cx, p.z - cz);
      if (dR < 3) continue;
      const pun = ap * 3 + Math.hypot(dx, dz) * 0.5 - Math.min(dR, 12) * 0.3;
      if (pun < mp) { mp = pun; mejor = p; }
    }
    return mejor;
  }

  const it = setInterval(() => {
    if (!bot.entity || bot.health === undefined || o.ocupado()) return;
    const rs = rivales(14);
    const ahora = Date.now();
    if (rs.length < 2) { if (modo) { modo = null; } return; }
    const cerca = rs.filter((e) => dist(e) < 6);

    // demasiados encima: separarse con la mejor fuga
    if (cerca.length >= 3 && bot.health < 14 && bot._mejorFuga && ahora - ultPasillo > 3000) {
      ultPasillo = ahora; modo = 'fuga';
      diag.log('info', 'multi', cerca.length + ' rivales encima: fuga');
      try { const fg = bot._mejorFuga(cerca[0]); if (bot.pvp) bot.pvp.stop(); if (fg) bot.pathfinder.setGoal(new goals.GoalXZ(Math.round(bot.entity.position.x + fg.dx * 14), Math.round(bot.entity.position.z + fg.dz * 14))); } catch (e) { /* ignorar */ }
      return;
    }

    // foco: el mas debil al alcance, con histeresis
    const alcance = rs.filter((e) => dist(e) < 7).sort((a, b) => puntaje(a) - puntaje(b));
    const actual = bot.pvp && bot.pvp.target;
    if (alcance.length && bot.pvp && ahora - ultCambio > 4000) {
      const mejor = alcance[0];
      if (!actual || actual.id !== mejor.id) {
        const pa = actual && actual.position ? puntaje(actual) : 1e9;
        if (puntaje(mejor) < pa - 4) { ultCambio = ahora; diag.log('info', 'multi', 'foco en ' + mejor.username); try { bot.pvp.attack(mejor); } catch (e) { /* ignorar */ } }
      }
    }

    // pasillo: si nadie esta pegado aun, ir a un cuello de botella y pelear de a uno
    if (cerca.every((e) => dist(e) > 3.5) && ahora - ultPasillo > 8000 && bot.health >= 8) {
      const p = buscarPasillo(rs);
      if (p && aperturas(bot.entity.position.floored()) > 3) {
        ultPasillo = ahora; modo = { t: ahora + 12_000 };
        diag.log('info', 'multi', 'va a pasillo');
        try { if (bot.pvp) bot.pvp.stop(); bot.pathfinder.setGoal(new goals.GoalBlock(p.x, p.y, p.z)); } catch (e) { /* ignorar */ }
        return;
      }
    }
    // en el pasillo: golpea solo al que entra
    if (modo && modo.t && ahora < modo.t && aperturas(bot.entity.position.floored()) <= 3) {
      const e = cerca.sort((a, b) => dist(a) - dist(b))[0];
      if (e && dist(e) <= 3.6 && bot.pvp && !bot.pvp.target) { try { bot.pvp.attack(e); } catch (x) { /* ignorar */ } }
      else if (bot.pvp && bot.pvp.target && dist(bot.pvp.target) > 4.5) { try { bot.pvp.stop(); bot.pathfinder.setGoal(null); } catch (x) { /* ignorar */ } }
    }
  }, 500);
  bot.once('end', () => clearInterval(it));
}
module.exports = { crearMulti };
