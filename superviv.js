const { goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function crearSuperviv(bot, o) {
  const { diag } = o;
  const ON = process.env.IA_SUPERVIV !== '0';
  const item = (n) => bot.inventory.items().find((i) => i.name === n);
  const bl = (p) => bot.blockAt(p);
  let ocup = false, ultAcantilado = 0;
  const ardiendo = () => !!(bot.entity && bot.entity.metadata && (Number(bot.entity.metadata[0]) & 1));

  async function aguaAbajo() {
    const b = item('water_bucket');
    if (!b) return false;
    await bot.equip(b, 'hand');
    await bot.look(bot.entity.yaw, -Math.PI / 2, true);
    bot.activateItem(); await dormir(500);
    bot.activateItem(); await dormir(200);
    return true;
  }
  async function salirLava() {
    diag.log('warn', 'supervivencia', 'en lava');
    await aguaAbajo();
    bot.setControlState('jump', true);
    const s = bot.findBlock({ maxDistance: 6, matching: (b) => b && b.boundingBox === 'block' && !/lava|magma/.test(b.name) });
    if (s) bot.pathfinder.setGoal(new goals.GoalNear(s.position.x, s.position.y + 1, s.position.z, 1));
    await dormir(1500);
    bot.setControlState('jump', false);
  }
  async function apagar() {
    if (await aguaAbajo()) return;
    const w = bot.findBlock({ maxDistance: 8, matching: (b) => b && b.name === 'water' });
    if (w) { bot.pathfinder.setGoal(new goals.GoalNear(w.position.x, w.position.y, w.position.z, 0)); await dormir(2500); }
  }
  async function liberarCabeza(cab) {
    await Promise.race([bot.dig(cab), dormir(3000)]);
  }

  function buscarAcantilado() {
    const p = bot.entity.position.floored();
    for (let r = 2; r <= 8; r++) {
      for (let a = 0; a < 360; a += 30) {
        const dx = Math.cos((a * Math.PI) / 180), dz = Math.sin((a * Math.PI) / 180);
        const ex = Math.round(p.x + dx * r), ez = Math.round(p.z + dz * r), fx = Math.round(p.x + dx * (r + 1)), fz = Math.round(p.z + dz * (r + 1));
        let gy = null;
        for (let y = p.y + 2; y >= p.y - 3; y--) { const b = bl(new Vec3(ex, y, ez)); if (b && b.boundingBox === 'block') { gy = y + 1; break; } }
        if (gy === null) continue;
        const a1 = bl(new Vec3(fx, gy, fz)), a2 = bl(new Vec3(fx, gy + 1, fz));
        if (!a1 || !a2 || a1.boundingBox !== 'empty' || a2.boundingBox !== 'empty') continue;
        for (let k = 1; k <= 36; k++) {
          const b = bl(new Vec3(fx, gy - k, fz));
          if (!b) break;
          if (b.boundingBox === 'block' || /water|lava/.test(b.name)) {
            if (k >= 9 && !/lava|magma|cactus|campfire|fire/.test(b.name)) return { ex, ey: gy, ez, dx, dz };
            break;
          }
        }
      }
    }
    return null;
  }
  async function escapeAcantilado() {
    const c = buscarAcantilado();
    if (!c) return;
    ultAcantilado = Date.now();
    diag.log('info', 'supervivencia', 'escapa saltando por un acantilado');
    try { await Promise.race([bot.pathfinder.goto(new goals.GoalNear(c.ex, c.ey, c.ez, 0)), dormir(6000)]); } catch (e) { /* ignorar */ }
    const b = item('water_bucket');
    if (b) await bot.equip(b, 'hand').catch(() => {});
    await bot.look(Math.atan2(-c.dx, -c.dz), 0, true);
    bot.setControlState('sprint', true); bot.setControlState('forward', true);
    await dormir(1400);
    bot.setControlState('forward', false); bot.setControlState('sprint', false);
  }

  const t = setInterval(async () => {
    if (!ON || !bot.entity || ocup) return;
    ocup = true;
    try {
      const e = bot.entity, pos = e.position.floored();
      const pies = bl(pos), cab = bl(pos.offset(0, 1, 0));
      if (e.isInLava || (pies && /lava/.test(pies.name))) await salirLava();
      else if (ardiendo() && !e.isInWater) await apagar();
      else if (cab && cab.boundingBox === 'block' && !/glass|leaves|slab|stair/.test(cab.name) && e.onGround) await liberarCabeza(cab);
      else if (typeof bot.oxygenLevel === 'number' && bot.oxygenLevel <= 5) { bot.setControlState('jump', true); await dormir(700); bot.setControlState('jump', false); }
      else if (bot._retirada > Date.now() && !bot._volando && Date.now() - ultAcantilado > 60_000 && bot.health >= 9 && item('water_bucket')) {
        const rival = Object.values(bot.entities).find((x) => x.type === 'player' && x.username !== bot.username && x.position.distanceTo(e.position) < 6);
        if (rival) await escapeAcantilado();
      }
    } catch (x) { /* ignorar */ } finally { ocup = false; }
  }, 400);
  bot.once('end', () => clearInterval(t));
}
module.exports = { crearSuperviv };
