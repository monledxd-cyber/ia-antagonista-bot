const BASE = 0.1, SPRINT = 1.3, AIRE_TICKS = 12;
const RES = { ice: 0.98, packed_ice: 0.98, blue_ice: 0.989, slime_block: 0.8 };
const LENTO = new Set(['soul_sand', 'honey_block']);

function efectos(bot) {
  let m = 1;
  const ef = (bot.entity && bot.entity.effects) || {};
  for (const e of Object.values(ef)) {
    const n = bot.registry && bot.registry.effects && bot.registry.effects[e.id] ? bot.registry.effects[e.id].name : '';
    if (n === 'speed') m += 0.2 * (e.amplifier + 1);
    if (n === 'slowness') m -= 0.15 * (e.amplifier + 1);
  }
  return Math.max(0.1, m);
}

function suelo(bot) {
  const p = bot.entity.position;
  const b = bot.blockAt(p.offset ? p.offset(0, -0.5, 0) : { x: p.x, y: p.y - 0.5, z: p.z });
  const n = b ? b.name : '';
  return { slip: RES[n] || 0.6, lento: LENTO.has(n) ? 0.4 : 1 };
}

function estadoDe(bot, sprint = true) {
  const p = bot.entity.position, v = bot.entity.velocity || { x: 0, z: 0 }, s = suelo(bot);
  return { x: p.x, z: p.z, vx: v.x, vz: v.z, suelo: bot.entity.onGround !== false, aire: 0, slip: s.slip, vel: BASE * efectos(bot) * s.lento * (sprint ? SPRINT : 1), sprint };
}

function paso(st, d, saltar) {
  let a;
  const salta = saltar && st.suelo;
  if (st.suelo) a = st.vel * (0.16277136 / Math.pow(st.slip * 0.91, 3));
  else a = st.sprint ? 0.026 : 0.02;
  if (salta && st.sprint && d) { st.vx += d[0] * 0.2; st.vz += d[1] * 0.2; }
  if (d) { st.vx += d[0] * a; st.vz += d[1] * a; }
  st.x += st.vx; st.z += st.vz;
  const dr = st.suelo ? st.slip * 0.91 : 0.91;
  st.vx *= dr; st.vz *= dr;
  if (salta) { st.suelo = false; st.aire = 1; }
  else if (!st.suelo) { st.aire++; if (st.aire > AIRE_TICKS) { st.suelo = true; st.aire = 0; } }
}

function recorrido(st0, d, ticks, saltar) {
  const st = Object.assign({}, st0), x0 = st.x, z0 = st.z, tr = [];
  for (let i = 0; i < ticks; i++) { paso(st, d, saltar && (i === 0 || st.suelo)); tr.push([st.x - x0, st.z - z0]); }
  return tr;
}

function ticksPara(st0, d, dist, max = 40) {
  let mejor = null;
  for (const saltar of [false, true]) {
    const st = Object.assign({}, st0), x0 = st.x, z0 = st.z;
    for (let i = 1; i <= max; i++) {
      paso(st, d, saltar && (i === 1 || st.suelo));
      if ((st.x - x0) * d[0] + (st.z - z0) * d[1] >= dist) { if (!mejor || i < mejor.n) mejor = { n: i, saltar }; break; }
    }
  }
  return mejor || { n: max, saltar: false };
}

module.exports = { estadoDe, paso, recorrido, ticksPara, BASE, SPRINT };
