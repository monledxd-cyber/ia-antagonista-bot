const { ignorado } = require('./modo');
const diag = require('./diag');

const M = (hp, dps, reach, ranged) => ({ hp, dps, reach, ranged: !!ranged });
const MOB = {
  zombie: M(20, 3.5, 2.3), husk: M(20, 3.5, 2.3), drowned: M(20, 3.5, 2.3), zombie_villager: M(20, 3.5, 2.3),
  skeleton: M(20, 3.5, 2, true), stray: M(20, 3.5, 2, true), bogged: M(16, 3, 2, true), spider: M(16, 2.5, 2.2), cave_spider: M(12, 3, 2),
  witch: M(26, 3, 2, true), pillager: M(24, 4, 2, true), vindicator: M(24, 7, 2.6), evoker: M(24, 4, 2, true), ravager: M(100, 9, 3),
  phantom: M(20, 3, 2), slime: M(16, 2, 2), magma_cube: M(16, 3, 2), blaze: M(20, 4, 2, true), wither_skeleton: M(20, 6, 2.4),
  hoglin: M(40, 5, 2.5), zoglin: M(40, 5, 2.5), silverfish: M(8, 1, 1.8), endermite: M(8, 1, 1.8), vex: M(14, 6, 2), guardian: M(30, 4, 2, true),
};
const DEF = M(20, 3, 2.5);
const SW = { wooden: 4, golden: 4, stone: 5, iron: 6, diamond: 7, netherite: 8 };
const ARM = { leather: 1.75, golden: 2.5, chainmail: 2.75, iron: 3.75, diamond: 5, netherite: 5, turtle: 2 };

function dpsArma(n) {
  const t = String(n || '').split('_')[0];
  if (/_sword$/.test(n)) return (SW[t] || 4) * 1.6 * 0.7;
  if (/_axe$/.test(n)) return ((SW[t] || 4) + 3) * (t === 'diamond' || t === 'netherite' ? 1 : t === 'iron' ? 0.9 : 0.8) * 0.7;
  if (n === 'mace') return 6 * 0.6 * 0.7 + 2;
  if (n === 'trident') return 9 * 1.1 * 0.5;
  if (/bow|crossbow/.test(n)) return 4;
  return 2;
}

function crearTactica(bot, o) {
  let foco = null, ultCambio = 0, ultCreeper = 0, ultRet = 0, retHasta = 0, ultLog = 0;
  const dist = (e) => e.position.distanceTo(bot.entity.position);

  function misDps() {
    let m = dpsArma(bot.heldItem && bot.heldItem.name);
    for (const i of bot.inventory.items()) m = Math.max(m, dpsArma(i.name));
    return Math.max(1.5, m);
  }
  function reduccion() {
    let p = 0;
    for (const s of [5, 6, 7, 8]) { const x = bot.inventory.slots[s]; if (x) p += ARM[x.name.split('_')[0]] || 1; }
    return Math.min(0.8, 0.04 * p);
  }
  function info(e) {
    if (e.type === 'player') {
      const hp = e.metadata && typeof e.metadata[9] === 'number' ? e.metadata[9] : 20;
      const piezas = Array.isArray(e.equipment) ? [2, 3, 4, 5].filter((i) => e.equipment[i]).length : 0;
      return { hp: hp * (1 + 0.12 * piezas), dps: dpsArma(e.heldItem && e.heldItem.name), reach: 3, ranged: /bow|crossbow|trident/.test((e.heldItem && e.heldItem.name) || ''), jug: true };
    }
    return Object.assign({ creeper: e.name === 'creeper' }, MOB[e.name] || DEF);
  }
  function enemigos(r) {
    const out = [];
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !e.position || e.username === bot.username) continue;
      const d = dist(e);
      if (d > r) continue;
      if (e.type === 'player') { if (ignorado(bot, e) || e.gameMode === 'creative') continue; }
      else if (!(e.name === 'creeper' || o.esMob(e))) continue;
      out.push({ e, d, i: info(e) });
    }
    return out;
  }

  const huir = (pos, dd) => bot._pred && bot._pred.huir && bot._pred.huir(pos, dd);

  function ciclo() {
    if (!bot.entity || bot.health === undefined || o.ocupado()) return;
    const ahora = Date.now(), en = enemigos(14);
    const cr = en.filter((x) => x.i.creeper && x.d < 5.5).sort((a, b) => a.d - b.d)[0];
    if (cr && ahora - ultCreeper > 450) {
      ultCreeper = ahora;
      if (huir(cr.e.position, 8) && ahora - ultLog > 1500) { ultLog = ahora; console.log(`[tactica] creeper a ${cr.d.toFixed(1)} bloques; se aleja`); }
      foco = null;
      return;
    }
    const ne = en.filter((x) => !x.i.creeper);
    if (!ne.length) { foco = null; return; }
    const mia = misDps(), red = reduccion();
    for (const x of ne) { x.ttk = Math.max(0.8, x.i.hp / mia); x.tasa = (x.i.dps * (1 - red)) / x.ttk; const al = x.d <= x.i.reach + 1.2; x.pr = x.tasa * (al ? 1 : x.d < 6 ? 0.55 : 0.2) * (x.i.ranged && x.d > 6 ? 0.7 : 1); }
    const orden = ne.filter((x) => x.d < 9).sort((a, b) => b.pr - a.pr);

    const cerca = ne.filter((x) => x.d <= x.i.reach + 2.5 || (x.i.ranged && x.d < 10));
    if (cerca.length && ahora - ultRet > 2500 && ahora > retHasta) {
      const ord = cerca.slice().sort((a, b) => b.tasa - a.tasa);
      let t = 0, dano = 0;
      for (const x of ord) { t += x.ttk * 1.25; dano += x.i.dps * (1 - red) * (x.i.ranged ? 1 : 0.6) * t; }
      const hpEf = bot.health + 1;
      if ((cerca.length >= 2 || bot.health < 10) && dano > hpEf) {
        ultRet = ahora; retHasta = ahora + 4000;
        const cx = cerca.reduce((a, x) => a + x.e.position.x, 0) / cerca.length, cz = cerca.reduce((a, x) => a + x.e.position.z, 0) / cerca.length;
        huir({ x: cx, z: cz }, 10);
        try { if (bot._mejorFuga && bot.pathfinder) { const fg = bot._mejorFuga(cerca[0].e); if (fg) { const { goals } = require('mineflayer-pathfinder'); if (bot.pvp) bot.pvp.stop(); bot.pathfinder.setGoal(new goals.GoalXZ(Math.round(bot.entity.position.x + fg.dx * 14), Math.round(bot.entity.position.z + fg.dz * 14))); } } } catch (e) { /* ignorar */ }
        console.log(`[tactica] retirada: ${cerca.length} enemigos, daño esperado ${dano.toFixed(0)} vs vida ${bot.health.toFixed(0)}`);
        foco = null;
        return;
      }
    }
    if (ahora < retHasta) { foco = null; return; }

    const mejor = orden[0];
    if (!mejor) { foco = null; return; }
    const act = foco && orden.find((x) => x.e.id === foco.id);
    if (!act || (mejor.e.id !== foco.id && mejor.pr > act.pr * 1.3 && ahora - ultCambio > 1000)) {
      foco = mejor.e; ultCambio = ahora;
      if (ahora - ultLog > 1500) { ultLog = ahora; console.log(`[tactica] foco ${foco.username || foco.name} (${ne.length} enemigos, prioridad ${mejor.pr.toFixed(2)})`); }
    }
    const t = bot.pvp && bot.pvp.target;
    if (foco && bot.pvp && (!t || t.id !== foco.id) && dist(foco) < 6) { try { bot.pvp.attack(foco); } catch (e) { /* ignorar */ } }
  }

  const it = setInterval(() => { try { ciclo(); } catch (e) { diag.log('warn', 'tactica', String(e && e.message).slice(0, 80)); } }, 250);
  bot.once('end', () => clearInterval(it));
  const api = { foco: () => foco, retirada: () => Date.now() < retHasta };
  bot._tact = api;
  return api;
}
module.exports = { crearTactica, MOB };
