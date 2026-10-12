const { goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const diag = require('./diag');

// Contra-estrategias: mace (techo bajo y esquivar caidas), cristales (alejarse), saltos desde arriba.
function crearEstratega(bot, o) {
  const prev = new Map();
  let ultBusca = 0, esquiva = 0, cont = null, cambiar = null;
  const est = {};
  bot.on('health', () => { const h = bot.health; if (bot._hpEst !== undefined && h < bot._hpEst - 1.5 && cont) cont.dano += bot._hpEst - h; bot._hpEst = h; });
  const rival = () => { const t = bot.pvp && bot.pvp.target; return t && t.type === 'player' && t.position ? t : null; };
  const jugadores = () => Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username && e.gameMode !== 'spectator' && e.position);
  const mano = (e) => (e.heldItem && e.heldItem.name) || '';
  const solido = (p) => { const b = bot.blockAt(p); return !!b && b.boundingBox === 'block'; };
  const libreCelda = (p) => { const a = bot.blockAt(p), b = bot.blockAt(p.offset(0, 1, 0)); return !!a && !!b && a.boundingBox === 'empty' && b.boundingBox === 'empty'; };
  const cubierta = (p) => solido(p.offset(0, 2, 0)) || solido(p.offset(0, 3, 0));
  const yo = () => bot.entity.position;

  // Celda cercana con techo bajo, alejada del rival si se puede
  function buscarTecho(t) {
    const c = yo().floored();
    let mejor = null, mp = 1e9;
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) for (let dy = -3; dy <= 3; dy++) {
      const p = c.offset(dx, dy, dz);
      if (!solido(p.offset(0, -1, 0)) || !libreCelda(p) || !cubierta(p)) continue;
      const dMi = Math.hypot(dx, dz) + Math.abs(dy) * 1.5;
      const dR = t ? p.distanceTo(t.position) : 10;
      const pun = dMi - Math.min(dR, 8) * 0.4;
      if (pun < mp) { mp = pun; mejor = p; }
    }
    return mejor;
  }

  function huirDe(pos, ms) {
    const v = yo().minus(pos); v.y = 0;
    if (v.norm() < 0.01) return;
    const yaw = Math.atan2(-v.x, -v.z);
    bot.look(yaw, 0, true).catch(() => {});
    ['forward', 'sprint'].forEach((k) => bot.setControlState(k, true));
    setTimeout(() => ['forward', 'sprint'].forEach((k) => bot.setControlState(k, false)), ms);
  }

  const it = setInterval(() => {
    if (!bot.entity || bot.health === undefined || o.ocupado()) return;
    const ahora = Date.now();
    const js = jugadores();
    for (const e of js) { const p = prev.get(e.id); prev.set(e.id, { y: e.position.y, t: ahora, vy: p ? (e.position.y - p.y) / Math.max(0.05, (ahora - p.t) / 1000) : 0 }); }

    // 1) mace: contraestrategia elegida al azar ponderada por lo que ha funcionado; se cambia si recibe dano
    const amenaza = js.find((e) => { const d = e.position.distanceTo(yo()); return d < 22 && (/^mace$|^wind_charge$/.test(mano(e)) || (e.position.y - yo().y > 3 && d < 9)); });
    if (amenaza) {
      const t = rival() || amenaza;
      if (!cont || cont.rival !== amenaza.username) {
        const op = ['techo', 'kite', 'esquiva'];
        const pr = bot._estDe ? bot._estDe(amenaza.username) : {};
        const w = op.map((k) => { const r = pr[k] || est[k] || { ok: 0, mal: 0 }; return (1 + r.ok) / (1 + r.mal) * (0.6 + Math.random() * 0.8) * (k === 'techo' && !buscarTecho(t) ? 0.2 : 1); });
        const k = op[w.indexOf(Math.max(...w))];
        cont = { k, rival: amenaza.username, t0: ahora, dano: 0, ult: ahora };
        diag.log('info', 'estratega', 'contra ' + amenaza.username + ': ' + k);
      }
      cont.ult = ahora;
      const d = t.position.distanceTo(yo());
      if (cont.k === 'techo') {
        if (cubierta(yo().floored()) && solido(yo().floored().offset(0, -1, 0))) {
          try {
            if (bot.pvp && d > 3.6 && bot.pvp.target) { bot.pvp.stop(); bot.pathfinder.setGoal(null); }
            else if (bot.pvp && d <= 3.6 && !bot.pvp.target && t.type === 'player') bot.pvp.attack(t);
          } catch (e) { /* ignorar */ }
        } else if (ahora - ultBusca > 2500) {
          ultBusca = ahora;
          const p = buscarTecho(t);
          if (p) { try { if (bot.pvp) bot.pvp.stop(); bot.pathfinder.setGoal(new goals.GoalBlock(p.x, p.y, p.z)); } catch (e) { /* ignorar */ } }
          else if (bot._encierro && bot.health < 18) bot._encierro();
          else cont.dano = 99;
        }
      } else if (cont.k === 'kite') {
        // mantiene 7-12 bloques en zigzag; solo golpea si el rival cae sin impulso a mano
        if (d < 8 && ahora - esquiva > 450) { esquiva = ahora; huirDe(t.position, 350 + Math.random() * 300); if (Math.random() < 0.3) bot.setControlState('jump', true), setTimeout(() => bot.setControlState('jump', false), 200); }
        else if (d > 13 && bot.pvp && !bot.pvp.target) { /* deja que lo alcance */ }
        if (d <= 2.8 && Math.abs(t.position.y - yo().y) < 1.2 && bot.pvp && !bot.pvp.target && t.type === 'player') { try { bot.pvp.attack(t); } catch (e) { /* ignorar */ } }
      } else if (cont.k === 'esquiva') {
        if (d < 5.5 && d > 2 && ahora - esquiva > 600) { esquiva = ahora; const lado = Math.random() < 0.5 ? 'left' : 'right'; bot.setControlState(lado, true); bot.setControlState('sprint', true); setTimeout(() => { bot.setControlState(lado, false); }, 350 + Math.random() * 250); }
      }
      if (cont.dano >= 6 || (cont.dano >= 3 && ahora - cont.t0 > 6000)) {
        (est[cont.k] = est[cont.k] || { ok: 0, mal: 0 }).mal++; if (bot._estMarca) bot._estMarca(cont.rival, cont.k, false);
        diag.log('warn', 'estratega', cont.k + ' fallo; cambia');
        const prevK = cont.k; cont = null; cambiar = prevK;
      } else if (ahora - cont.t0 > 8000 && cont.dano === 0 && !cont.contado) { cont.contado = true; (est[cont.k] = est[cont.k] || { ok: 0, mal: 0 }).ok++; if (bot._estMarca) bot._estMarca(cont.rival, cont.k, true); }
    } else if (cont && ahora - cont.ult > 4000) cont = null;
    if (cambiar && cont) cambiar = null;

    // 2) caida encima (smash): esquivar en horizontal justo antes del impacto
    for (const e of js) {
      const p = prev.get(e.id), dx = e.position.x - yo().x, dz = e.position.z - yo().z, h = Math.hypot(dx, dz), dy = e.position.y - yo().y;
      if (p && p.vy < -4 && dy > 0.5 && dy < 9 && h < 3.5 && ahora - esquiva > 700) {
        esquiva = ahora; diag.log('info', 'estratega', 'esquiva caida de ' + e.username);
        huirDe(e.position, 650); break;
      }
    }

    // 3) cristales: alejarse si un rival con cristales anda cerca y hay uno a < 5
    const cr = Object.values(bot.entities).find((e) => e.name === 'end_crystal' && e.position.distanceTo(yo()) < 5);
    if (cr && js.some((e) => e.position.distanceTo(yo()) < 14 && /end_crystal|respawn_anchor/.test(mano(e))) && ahora - esquiva > 900) {
      esquiva = ahora; diag.log('info', 'estratega', 'se aleja de cristal');
      huirDe(cr.position, 700);
    }
  }, 200);

  bot._contraActual = () => (cont ? cont.k : null);
  bot.once('end', () => clearInterval(it));
  return {};
}

module.exports = { crearEstratega };
