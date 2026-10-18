const fs = require('fs');
const diag = require('./diag');

function crearAutopsia(bot, ruta) {
  let lista = [], sucio = false;
  try { lista = JSON.parse(fs.readFileSync(ruta, 'utf8')) || []; } catch (e) { lista = []; }
  const buf = [];
  let msg = { t: 0, s: '' };
  const dim = () => String((bot.game && bot.game.dimension) || 'overworld').replace(/.*:/, '');

  bot.on('messagestr', (m) => { if (typeof m === 'string' && m.includes(bot.username)) msg = { t: Date.now(), s: m }; });

  const it = setInterval(() => {
    if (!bot.entity) return;
    const p = bot.entity.position, t = bot.pvp && bot.pvp.target;
    buf.push({ t: Date.now(), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), hp: bot.health, r: t && t.username ? t.username : null, arma: t && t.heldItem ? t.heldItem.name : null, lava: !!bot.entity.isInLava });
    while (buf.length > 15) buf.shift();
  }, 1000);

  function causa() {
    const s = Date.now() - msg.t < 4000 ? msg.s.toLowerCase() : '';
    const ult = buf[buf.length - 1] || {};
    if (/lava|magma/.test(s) || ult.lava) return 'lava';
    if (/fell|hit the ground|high place|ladder|vines/.test(s)) return 'caida';
    if (/drown/.test(s)) return 'ahogo';
    if (/burn|fire|flames/.test(s)) return 'fuego';
    if (/blew|explo|firework/.test(s)) return 'explosion';
    if (/starv/.test(s)) return 'hambre';
    if (/void/.test(s)) return 'vacio';
    if (/suffocat/.test(s)) return 'asfixia';
    if (ult.r || /slain|shot|killed|by /.test(s)) return 'jugador';
    return s ? 'mob_u_otro' : 'desconocida';
  }

  bot.on('death', () => {
    const c = causa(), ult = buf[buf.length - 1] || {};
    const rival = [...buf].reverse().find((b) => b.r);
    const rec = { t: Date.now(), c, dim: dim(), x: ult.x, y: ult.y, z: ult.z, rival: rival ? rival.r : null, arma: rival ? rival.arma : null, hp: buf.map((b) => b.hp), noche: !!(bot.time && bot.time.timeOfDay >= 13000) };
    const repetidas = lista.filter((x) => x.c === c && x.dim === rec.dim && x.x !== undefined && Math.hypot(x.x - rec.x, x.z - rec.z) < 40 && Date.now() - x.t < 6 * 3600_000).length;
    lista.push(rec); if (lista.length > 60) lista.shift(); sucio = true;
    const peso = { lava: 3, caida: 2, ahogo: 2, fuego: 2, explosion: 1.5, asfixia: 1.5, vacio: 3 }[c];
    if (peso && bot._mapa && rec.x !== undefined) bot._mapa.marcarPeligro({ x: rec.x, y: rec.y, z: rec.z }, peso, 'muerte por ' + c);
    if (repetidas > 0 && bot._premio) bot._premio.evento('muerte_repetida', { v: -3 * Math.min(4, repetidas), k: c, motivo: c + ' x' + (repetidas + 1) });
    diag.estado.autopsia = `${c}${rec.rival ? ' por ' + rec.rival : ''} en ${rec.x},${rec.y},${rec.z} (${rec.dim}) repetidas ${repetidas}`;
    diag.log('warn', 'autopsia', diag.estado.autopsia);
    const hp = buf.slice(-6).map((b) => b.hp === undefined ? '?' : Math.round(b.hp)).join('>');
    const cerca = Object.values(bot.entities).filter((e) => e !== bot.entity && e.position && bot.entity && e.position.distanceTo(bot.entity.position) < 12 && (e.type === 'hostile' || e.type === 'player')).map((e) => e.username || e.name).slice(0, 4).join(',');
    let paso = ''; try { paso = bot._abasto && bot._abasto.paso ? bot._abasto.paso() : ''; } catch (e) { /* ignorar */ }
    let ac = ''; try { ac = bot._nn && bot._nn.sugerir ? bot._nn.sugerir() : ''; } catch (e) { /* ignorar */ }
    console.log(`[muerte] causa=${c} rival=${rec.rival || '-'} arma=${rec.arma || '-'} vida=${hp} cerca=${cerca || '-'} paso=${paso || '-'} nn=${ac || '-'} pos=${rec.x},${rec.y},${rec.z} ${rec.noche ? 'noche' : 'dia'}`);
  });

  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(lista)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });
  bot._muertesPor = (n) => lista.filter((x) => x.rival === n && Date.now() - x.t < 24 * 3600_000).length;
  const api = { lista: () => lista, guardar };
  bot._autopsia = api;
  return api;
}
module.exports = { crearAutopsia };
