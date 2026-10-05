// Combate por reflejos (sin LLM): arco/ballesta con punteria balistica, cristales, mace y escudo.
// Antes todo dependia de que la IA emitiera un tag; si la IA fallaba, el bot peleaba solo con espada.
const { Vec3 } = require('vec3');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Vuelo de una flecha (wiki): gravedad 0.05/tick, arrastre 0.99. Devuelve altura relativa y ticks
// al alcanzar la distancia horizontal dx.
function simular(pitch, dx, v) {
  let x = 0, y = 0, vx = v * Math.cos(pitch), vy = v * Math.sin(pitch);
  for (let t = 1; t <= 300; t++) {
    const px = x, py = y;
    x += vx; y += vy; vx *= 0.99; vy = vy * 0.99 - 0.05;
    if (x >= dx) {
      const f = (dx - px) / ((x - px) || 1);
      return { y: py + (y - py) * f, t: t - 1 + f };
    }
    if (vx < 0.01) return null;
  }
  return null;
}

// Pitch (positivo = arriba) que lleva la flecha a (dx horizontal, dy vertical). Prefiere el tiro tenso.
function calcularPitch(dx, dy, v) {
  let mejor = null;
  for (let p = -0.7; p <= 1.2; p += 0.004) {
    const r = simular(p, dx, v);
    if (!r) continue;
    const err = Math.abs(r.y - dy);
    if (!mejor || err < mejor.err - 1e-9) mejor = { pitch: p, err, t: r.t };
  }
  return mejor && mejor.err < 0.6 ? mejor : null;
}

function iniciarCombate(bot, api) {
  const hist = new Map(); // id -> {p, ts} para estimar velocidad (mineflayer no la da en jugadores)
  const velocidad = (e) => {
    const ahora = Date.now();
    const h = hist.get(e.id);
    hist.set(e.id, { p: e.position.clone(), ts: ahora });
    if (!h || ahora - h.ts < 20 || ahora - h.ts > 600) return new Vec3(0, 0, 0);
    const ticks = (ahora - h.ts) / 50;
    const d = e.position.minus(h.p).scaled(1 / ticks);
    return new Vec3(d.x, 0, d.z);
  };
  const inv = () => bot.inventory.items();
  const tiene = (n) => inv().find((i) => i.name === n);
  const flechas = () => inv().some((i) => /(^|_)arrow$/.test(i.name));
  const valido = (t) => t && bot.entities[t.id] && t.gameMode !== 'creative' && t.gameMode !== 'spectator';
  const dist = (t) => t.position.distanceTo(bot.entity.position);
  const vista = (t) => {
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const dest = t.position.offset(0, 1.0, 0);
    const d = dest.minus(ojo);
    const len = d.norm();
    return !bot.world.raycast(ojo, d.normalize(), len - 0.3);
  };

  function apuntar(t, v) {
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const vel = velocidad(t);
    let obj = t.position.offset(0, 1.0, 0), sol = null;
    for (let i = 0; i < 3; i++) {
      const d = obj.minus(ojo);
      sol = calcularPitch(Math.hypot(d.x, d.z), d.y, v);
      if (!sol) return false;
      obj = t.position.offset(0, 1.0, 0).plus(vel.scaled(sol.t)); // adelanto segun hacia donde corre
    }
    const d = obj.minus(ojo);
    bot.look(Math.atan2(-d.x, -d.z), sol.pitch, true);
    return true;
  }

  async function disparar(t, arma) {
    const ballesta = arma.name === 'crossbow';
    const v = ballesta ? 3.15 : 3.0;
    await bot.equip(arma, 'hand');
    if (ballesta) {
      if (!bot._ballestaCargada) {
        bot.activateItem(); await dormir(1300); bot.deactivateItem(); await dormir(150);
        bot._ballestaCargada = true;
      }
    } else {
      bot.activateItem();
    }
    const fin = Date.now() + (ballesta ? 250 : 1050);
    while (Date.now() < fin && valido(t)) { apuntar(t, v); await dormir(70); }
    if (!valido(t) || !apuntar(t, v)) { bot.deactivateItem(); return false; }
    if (ballesta) { bot.activateItem(); await dormir(120); bot.deactivateItem(); bot._ballestaCargada = false; }
    else bot.deactivateItem();
    return true;
  }

  // Obsidiana junto al objetivo y autocrystal 8 s (el plugin solo pone cristales sobre obsidiana/bedrock).
  async function cristales(t) {
    const obs = tiene('obsidian');
    if (!obs || !tiene('end_crystal') || !bot.autoCrystal || bot.autoCrystal.enabled) return false;
    const base = t.position.floored().offset(0, -1, 0);
    const lado = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => base.offset(x, 0, z)).find((p) => {
      const b = bot.blockAt(p), a = bot.blockAt(p.offset(0, 1, 0)), a2 = bot.blockAt(p.offset(0, 2, 0));
      return b && a && a2 && b.boundingBox === 'block' && a.name === 'air' && a2.name === 'air' &&
        p.distanceTo(bot.entity.position.offset(0, 1.6, 0)) < 4.5;
    });
    if (!lado) return false;
    await bot.equip(obs, 'hand');
    await bot.placeBlock(bot.blockAt(lado), new Vec3(0, 1, 0));
    bot.autoCrystal.enable();
    setTimeout(() => { try { bot.autoCrystal.disable(); } catch (e) { /* ignorar */ } api.equiparArma(); }, 8000);
    return true;
  }

  let ocupado = false;
  let ultDisparo = 0, ultCristal = 0, ultSmash = 0, ultEscudo = 0, enCaida = false;

  const loop = setInterval(async () => {
    if (!bot.entity) { clearInterval(loop); return; }
    if (ocupado || api.ocupado()) return;
    try {
      const ahora = Date.now();
      // Escudo siempre en la mano secundaria (antes solo se equipaba si la IA lo pedia).
      if (ahora - ultEscudo > 5000) {
        ultEscudo = ahora;
        const escudo = tiene('shield');
        const off = bot.inventory.slots[45];
        if (escudo && !off) bot.equip(escudo, 'off-hand').catch(() => {});
      }
      const t = api.obtenerObjetivo();
      if (!valido(t)) { enCaida = false; return; }
      const d = dist(t);
      const mace = tiene('mace');

      // Golpe de mace al caer: si ya cae >= 1.5 bloques sobre el objetivo, cambia a mace y pega.
      if (mace && bot.entity.velocity.y < -0.55 && d < 4 && t.type === 'player') {
        enCaida = true;
        if (!bot.heldItem || bot.heldItem.name !== 'mace') await bot.equip(mace, 'hand');
        bot.attack(t);
        return;
      }
      if (enCaida && bot.entity.onGround) { enCaida = false; api.equiparArma(); }

      if (t.type !== 'player') return; // arco, cristales y smash solo contra jugadores

      if (mace && tiene('wind_charge') && d >= 2.5 && d <= 8 && ahora - ultSmash > 4000) {
        ultSmash = ahora; ocupado = true; api.ocupar(true);
        try { await api.smashAttack(); } finally { ocupado = false; api.ocupar(false); api.equiparArma(); }
        return;
      }
      if (d >= 2.5 && d <= 5.5 && bot.health >= 10 && ahora - ultCristal > 20000) {
        ultCristal = ahora; ocupado = true; api.ocupar(true);
        try { await cristales(t); } finally { ocupado = false; api.ocupar(false); }
        return;
      }
      const arma = tiene('crossbow') || tiene('bow');
      if (arma && flechas() && d > 8 && d <= 28 && ahora - ultDisparo > 1800 && vista(t)) {
        ultDisparo = ahora; ocupado = true; api.ocupar(true);
        api.pausar();
        try { await disparar(t, arma); }
        finally { ocupado = false; api.ocupar(false); api.equiparArma(); if (valido(t)) api.reanudar(t); }
      }
    } catch (e) {
      ocupado = false; api.ocupar(false);
      console.error('[combate]', e.message);
    }
  }, 150);
  api.intervalos.push(loop);
}

module.exports = { iniciarCombate, calcularPitch, simular };
