function crearVuelo(bot, o) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let volando = false, ultCohete = 0, ultIntento = 0;
  const inv = () => bot.inventory.items();
  const elytra = () => inv().find((i) => i.name === 'elytra') || (bot.inventory.slots[6] && bot.inventory.slots[6].name === 'elytra' ? bot.inventory.slots[6] : null);
  const cohete = () => inv().find((i) => i.name === 'firework_rocket');

  async function aterrizar() {
    bot._volando = false; volando = false;
    try { bot.setControlState('forward', false); } catch (e) { /* ignorar */ }
    const pecho = inv().filter((i) => /_chestplate$/.test(i.name)).sort((a, b) => o.tierDe(b.name) - o.tierDe(a.name))[0];
    if (pecho) await bot.equip(pecho, 'torso').catch(() => {});
  }

  async function volar(destino, huir) {
    volando = true; bot._volando = true; ultIntento = Date.now();
    try {
      await bot.equip(elytra(), 'torso');
      bot.setControlState('jump', true); await dormir(200); bot.setControlState('jump', false);
      await bot.elytraFly();
      const t0 = Date.now();
      while (bot.entity && Date.now() - t0 < 25_000) {
        await dormir(150);
        if (bot.entity.onGround && Date.now() - t0 > 1500) break;
        const p = bot.entity.position;
        const dx = destino.x - p.x, dz = destino.z - p.z;
        const yaw = Math.atan2(-dx, -dz);
        const subir = p.y < destino.y + 25 && Math.hypot(dx, dz) > 20;
        await bot.look(yaw, subir ? 0.35 : -0.1, true).catch(() => {});
        const c = cohete();
        if (c && Date.now() - ultCohete > 2600 && (huir || Math.hypot(dx, dz) > 25)) {
          ultCohete = Date.now();
          await bot.equip(c, 'hand').catch(() => {});
          bot.activateItem();
        }
        if (!huir && Math.hypot(dx, dz) < 8) break;
      }
    } catch (e) { /* sin vuelo */ } finally { await aterrizar(); try { o.equipar(); } catch (e) { /* ignorar */ } }
  }

  const iv = setInterval(() => {
    if (!bot.entity) { clearInterval(iv); return; }
    if (volando || Date.now() - ultIntento < 20_000 || bot.entity.isInWater || !elytra() || !cohete()) return;
    const t = o.objetivo();
    if (!t || !t.position) return;
    const d = t.position.distanceTo(bot.entity.position);
    const huye = bot._retirada > Date.now() && bot.health < 10 && d < 14;
    const lejos = !huye && d > 40 && d < 160 && bot.health > 14;
    if (!huye && !lejos) return;
    const dest = huye ? bot.entity.position.offset(bot.entity.position.x - t.position.x, 0, bot.entity.position.z - t.position.z) : t.position;
    volar(dest, huye);
  }, 1000);
  return { activo: () => volando };
}
module.exports = { crearVuelo };
