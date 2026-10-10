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
  // Tracker continuo (cada 50 ms): la velocidad de los otros jugadores NO viene del servidor, hay que medirla.
  // Promedia ~250 ms de posiciones; devuelve bloques/tick (x,z,y). En el aire se aplica gravedad al predecir.
  const muestras = new Map();
  const tracker = setInterval(() => {
    if (!bot.entity) { clearInterval(tracker); return; }
    const ahora = Date.now();
    for (const e of Object.values(bot.entities)) {
      if (e === bot.entity || (e.type !== 'player' && e.type !== 'hostile') || e.position.distanceTo(bot.entity.position) > 45) continue;
      let a = muestras.get(e.id);
      if (!a) { a = []; muestras.set(e.id, a); }
      a.push({ p: e.position.clone(), ts: ahora, g: e.onGround !== false });
      while (a.length > 8 || (a.length && ahora - a[0].ts > 400)) a.shift();
    }
    for (const id of muestras.keys()) if (!bot.entities[id]) muestras.delete(id);
  }, 50);
  api.intervalos.push(tracker);
  const velocidad = (e) => {
    const a = muestras.get(e.id);
    if (!a || a.length < 3) return new Vec3(0, 0, 0);
    const f = a[0], l = a[a.length - 1], ticks = (l.ts - f.ts) / 50;
    if (ticks < 1.5) return new Vec3(0, 0, 0);
    const v = l.p.minus(f.p).scaled(1 / ticks);
    if (l.g) v.y = 0; // en el suelo no se predice vertical
    return v;
  };
  bot._vel = velocidad;
  // Posicion futura tras t ticks: lineal en x/z; en el aire, y con gravedad (0.08/tick^2, rozamiento 0.98), sin bajar del suelo conocido.
  const futura = (e, base, t) => {
    const v = velocidad(e), aire = !(e.onGround !== false);
    let y = base.y + v.y * t;
    if (aire) y -= 0.04 * t * t;
    return new Vec3(base.x + v.x * t, Math.max(y, base.y - 4), base.z + v.z * t);
  };
  // Lectura del rival. metadata[8] = estados de mano de LivingEntity (bit0 = mano activa: comiendo,
  // cargando arco o bloqueando; bit1 = mano secundaria). Indice segun el protocolo 1.21.x, sin probar en juego.
  const usando = (e) => !!(e && e.metadata && typeof e.metadata[8] === 'number' && (e.metadata[8] & 3));
  const sosteniendo = (e) => (e && e.heldItem && e.heldItem.name) || '';
  const comiendoRival = (e) => usando(e) && !!(bot.registry.foodsByName && bot.registry.foodsByName[sosteniendo(e)]);
  const conEscudoRival = (e) => Array.isArray(e.equipment) && e.equipment.some((it) => it && it.name === 'shield');
  // Puntaje de armadura: suma de (tier+1) por pieza. Rival: ranuras 2..5; yo: ranuras 5..8.
  const puntaje = (items) => items.reduce((a, it) => a + (it && api.tierDe ? api.tierDe(it.name) + 1 : 0), 0);
  const rivalSuperior = (e) => Array.isArray(e.equipment) &&
    puntaje(e.equipment.slice(2, 6)) - puntaje([5, 6, 7, 8].map((i) => bot.inventory.slots[i])) >= 4;
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

  // Linea de vision/alcance: del ojo al punto SOLO puede haber aire (nada que tape el golpe).
  const lineaLibre = (pos) => {
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const d = pos.minus(ojo), len = d.norm();
    if (len < 0.5) return true;
    try { return !bot.world.raycast(ojo, d.normalize(), len - 0.2); } catch (e) { return true; }
  };
  bot._lineaLibre = lineaLibre;
  // Cara superior de la obsidiana p visible y alcanzable (el rayo desde el ojo debe dar en ese bloque, cara +Y)
  const caraSuperior = (p) => {
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const d = p.offset(0.5, 1, 0.5).minus(ojo), len = d.norm();
    if (len > 4.5) return false;
    try { const r = bot.world.raycast(ojo, d.normalize(), 5); return !!(r && r.position.x === p.x && r.position.y === p.y && r.position.z === p.z && r.face === 1); } catch (e) { return false; }
  };

  function apuntar(t, v) {
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const base = t.position.offset(0, 1.0, 0);
    let obj = base, sol = null;
    for (let i = 0; i < 4; i++) {            // iterar: el tiempo de vuelo depende de donde apuntas
      const d = obj.minus(ojo);
      sol = calcularPitch(Math.hypot(d.x, d.z), d.y, v);
      if (!sol) return false;
      obj = futura(t, base, sol.t + 2);      // +2 ticks de latencia/reaccion
    }
    const d = obj.minus(ojo);
    bot.look(Math.atan2(-d.x, -d.z), sol.pitch, true);
    return true;
  }

  // Encantamientos del item (1.21.4 los guarda como componente; la forma exacta no esta verificada en juego,
  // por eso se aceptan varias formas y hay una deteccion por comportamiento como respaldo).
  const encantosDe = (item) => {
    const out = {};
    try {
      const raw = item.enchants;
      const lista = Array.isArray(raw) ? raw : (raw && raw.enchantments) || [];
      for (const e of lista) {
        const reg = bot.registry.enchantments && bot.registry.enchantments[e.id];
        const nombre = e.name || (reg && reg.name) || (typeof e.id === 'string' ? e.id.replace('minecraft:', '') : null);
        if (nombre) out[nombre] = e.lvl != null ? e.lvl : (e.level != null ? e.level : 1);
      }
    } catch (err) { /* ignorar */ }
    return out;
  };
  // 'riptide' (se usa para impulsarse con agua o lluvia; NO se lanza), 'loyalty' (vuelve solo), 'normal' (hay que recogerlo).
  const tipoTridente = (item) => {
    if (bot._tridenteSinLanzar) return 'riptide';
    const e = encantosDe(item);
    return e.riptide ? 'riptide' : (e.loyalty ? 'loyalty' : 'normal');
  };

  // Tridente (wiki): 2.5 bloques/tick, gravedad 0.05, arrastre 0.99 (misma fisica que la flecha, otra velocidad).
  // Carga minima real 0.5 s; el bot la telegrafia con 1.2 s. Una sola municion: tras lanzarlo hay que recogerlo
  // (salvo Lealtad, que vuelve solo). Riptide no se lanza: se usa para impulsarse al enemigo en agua o lluvia.
  const TRIDENTE_CARGA_MS = 1200;
  async function lanzarTridente(t, arma) {
    await bot.equip(arma, 'hand');
    bot.activateItem();
    const fin = Date.now() + TRIDENTE_CARGA_MS;
    while (Date.now() < fin && valido(t)) { apuntar(t, 2.5); await dormir(70); }
    if (!valido(t) || !apuntar(t, 2.5)) { bot.deactivateItem(); return false; }
    bot.deactivateItem(); // soltar = lanzar
    await dormir(450);
    if (tiene('trident')) { // sigue en el inventario: no se pudo lanzar => es Riptide
      bot._tridenteSinLanzar = true;
      console.log('[combate] el tridente no se lanza (Riptide): se usara para impulsarse');
      return false;
    }
    bot._tridenteLanzado = true;
    return true;
  }
  // Riptide: carga y suelta apuntando al rival; solo impulsa si el bot esta en agua o bajo lluvia.
  async function impulsoRiptide(t, arma) {
    await bot.equip(arma, 'hand');
    bot.activateItem();
    const fin = Date.now() + 1000;
    while (Date.now() < fin && valido(t)) {
      const o = t.position.offset(0, 1.0, 0).minus(bot.entity.position.offset(0, 1.62, 0));
      bot.look(Math.atan2(-o.x, -o.z), Math.atan2(o.y, Math.hypot(o.x, o.z)), true);
      await dormir(70);
    }
    bot.deactivateItem();
    return true;
  }

  async function disparar(t, arma) {
    if (arma.name === 'trident') return lanzarTridente(t, arma);
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

  // Crystal-pvp activo: mientras el rival este a <= 8 bloques y haya cristales y obsidiana (en el inventario o
  // ya puesta junto al rival), mantiene el autocrystal encendido; si falta obsidiana la coloca junto al rival.
  // El plugin solo pone cristales sobre obsidiana/bedrock y nunca golpea al jugador: por eso se pausa el melee.
  let crisActivo = false, crisHasta = 0, ultAcercar = 0;
  const hayObsidianaCerca = (t) => {
    try {
      return bot.findBlocks({ point: t.position, maxDistance: 5, count: 1,
        matching: (b) => b && (b.name === 'obsidian' || b.name === 'bedrock') }).length > 0;
    } catch (e) { return false; }
  };
  async function ponerObsidiana(t) {
    const obs = tiene('obsidian');
    if (!obs) return false;
    const base = t.position.floored().offset(0, -1, 0);
    const ojos = bot.entity.position.offset(0, 1.62, 0);
    let lado = null, mejorV = 1.5;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (!dx && !dz) continue;
      const p = base.offset(dx, 0, dz);
      const b = bot.blockAt(p), a1 = bot.blockAt(p.offset(0, 1, 0)), a2 = bot.blockAt(p.offset(0, 2, 0)), a3 = bot.blockAt(p.offset(0, 3, 0));
      if (!b || !a1 || !a2 || !a3 || b.boundingBox !== 'block' || a1.name !== 'air' || a2.name !== 'air' || a3.name !== 'air') continue;
      if (p.offset(0.5, 2, 0.5).distanceTo(ojos) > 3.6 || !caraSuperior(p)) continue;
      const c = centro(p.offset(0, 1, 0));
      const v = danoEn(t, c) - danoEn(bot.entity, c) * 0.8;
      if (v > mejorV) { mejorV = v; lado = p; }
    }
    if (!lado) return false;
    await bot.equip(obs, 'hand');
    await bot.lookAt(lado.offset(0.5, 1, 0.5), true);
    await bot.placeBlock(bot.blockAt(lado), new Vec3(0, 1, 0));
    return true;
  }
  // Motor propio: COLOCAR (clic derecho con el cristal en la mano sobre la cara superior de la obsidiana) y despues
  // ROMPER (clic izquierdo al cristal). El plugin viejo comparaba mal la distancia y volvia a colocar sin romper nunca.
  let ultPoner = 0, ultRomper = 0, ponerCuenta = 0;
  const esCristal = (e) => e && e.name === 'end_crystal';
  const centro = (p) => p.offset(0.5, 1, 0.5); // donde queda el cristal sobre el bloque p
  const danoEn = (ent, pos) => { try { return bot.getExplosionDamages(ent, pos, 6, true) || 0; } catch (e) { return 0; } };
  async function cristalPaso(t) {
    const ojos = bot.entity.position.offset(0, 1.62, 0);
    const mano = bot.heldItem && bot.heldItem.name === 'end_crystal';
    const ahora = Date.now();
    // 1) romper: cualquier cristal a alcance de ataque que dane al rival mas de lo que me daña a mi
    const cristales = Object.values(bot.entities).filter((e) => esCristal(e) && e.position.distanceTo(ojos) <= 4.3);
    for (const k of cristales.sort((p, q) => danoEn(t, q.position) - danoEn(t, p.position))) {
      const propio = danoEn(bot.entity, k.position), rival = danoEn(t, k.position);
      if (propio >= bot.health - 3 || (propio > 9 && rival < propio * 1.2)) continue; // demasiado caro
      if (ahora - ultRomper < 120) return;
      ultRomper = ahora;
      if (!lineaLibre(k.position.offset(0, 0.5, 0))) continue;
      try { await bot.lookAt(k.position.offset(0, 0.5, 0), true); bot.attack(k); } catch (e) { /* ignorar */ }
      return;
    }
    // 2) colocar: mejor obsidiana (dano al rival - dano propio), sin cristal ya puesto encima y con 2 de aire
    if (ahora - ultPoner < 280) return;
    const cris = tiene('end_crystal');
    if (!cris) return;
    let cand = [];
    try {
      cand = bot.findBlocks({ point: t.position, maxDistance: 6, count: 40,
        matching: (b) => b && (b.name === 'obsidian' || b.name === 'bedrock') });
    } catch (e) { cand = []; }
    let mejor = null, mejorV = 1.5;
    for (const p of cand) {
      const a1 = bot.blockAt(p.offset(0, 1, 0)), a2 = bot.blockAt(p.offset(0, 2, 0));
      if (!a1 || !a2 || a1.name !== 'air' || a2.name !== 'air') continue;
      const c = centro(p);
      if (c.distanceTo(ojos) > 3.6) continue;                      // tiene que poder romperlo despues
      if (!caraSuperior(p)) continue;                              // la cara de arriba debe verse y no estar tapada
      if (Object.values(bot.entities).some((e) => esCristal(e) && e.position.distanceTo(c) < 1.1)) continue;
      const propio = danoEn(bot.entity, c), rival = danoEn(t, c);
      if (propio >= bot.health - 5) continue;
      const v = rival - propio * 0.8;
      if (v > mejorV) { mejorV = v; mejor = p; }
    }
    if (!mejor) { if (dist(t) > 4 && ahora - ultAcercar > 800) { ultAcercar = ahora; api.acercar(t, 3); } return; }
    ultPoner = ahora;
    if (!mano) await bot.equip(cris, 'hand');
    const bloque = bot.blockAt(mejor);
    await bot.lookAt(mejor.offset(0.5, 1, 0.5), true);
    if (!caraSuperior(mejor)) return;
    try { await bot.activateBlock(bloque, new Vec3(0, 1, 0)); ponerCuenta++; } catch (e) { /* intento perdido */ }
  }
  const cristalMotor = setInterval(async () => {
    if (!crisActivo || !bot.entity || motorOcupado) return;
    const t = api.obtenerObjetivo();
    if (!valido(t) || t.type !== 'player') return;
    motorOcupado = true;
    try { await cristalPaso(t); } catch (e) { /* ignorar */ } finally { motorOcupado = false; }
  }, 60);
  let motorOcupado = false;
  api.intervalos.push(cristalMotor);

  function detenerCristales(t) {
    if (!crisActivo) return;
    crisActivo = false;
    api.ocupar(false); api.equiparArma();
    if (valido(t)) api.reanudar(t);
  }
  const cristalLoop = setInterval(async () => {
    if (!bot.entity) { clearInterval(cristalLoop); return; }
    try {
      const t = api.obtenerObjetivo();
      const ahora = Date.now();
      const util = valido(t) && t.type === 'player' && tiene('end_crystal') &&
        dist(t) <= 8 && bot.health >= 9;
      if (crisActivo) {
        if (!util || ahora > crisHasta) { detenerCristales(t); ultCristal = ahora; return; }
        if (dist(t) > 5.5 && ahora - ultAcercar > 1000) { ultAcercar = ahora; api.acercar(t, 3.5); }
        return;
      }
      if (!util || ocupado || api.ocupado() || ahora - ultCristal < 4000) return;
      ultCristal = ahora;
      if (!hayObsidianaCerca(t)) {
        if (dist(t) > 4.5) { api.acercar(t, 3.5); return; }
        ocupado = true; api.ocupar(true);
        try { if (!(await ponerObsidiana(t))) return; } finally { ocupado = false; api.ocupar(false); }
      }
      api.pausar();
      api.ocupar(true);
      crisActivo = true; crisHasta = ahora + 15000;
    } catch (e) { crisActivo = false; api.ocupar(false); console.error('[combate/cristales]', e.message); }
  }, 400);
  api.intervalos.push(cristalLoop);

  let ocupado = false;
  let enMLG = false;
  let ultArco = 0, ultTrid = 0, ultRip = 0, ultimoRango = null, ultCristal = 0, ultSmash = 0, ultEscudo = 0, enCaida = false;

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
      if (t.type === 'player' && d < 8) api.fijarHacha(conEscudoRival(t)); // hacha contra escudo, sin esperar a la IA

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
      // Arco/ballesta y tridente se turnan: si ambos estan listos, alterna; si uno recarga, usa el otro.
      const arco = tiene('crossbow') || tiene('bow');
      const tridente = tiene('trident');
      const tipoT = tridente ? tipoTridente(tridente) : null;
      const quieto = (comiendoRival(t) || /^(bow|crossbow)$/.test(sosteniendo(t))) && usando(t);
      const listoArco = !!(arco && flechas()) && d > 8 && d <= 28 && ahora - ultArco > (quieto ? 700 : 1800);
      const listoTrid = !!tridente && tipoT !== 'riptide' && d > 5 && d <= 26 && ahora - ultTrid > (tipoT === 'loyalty' ? 2500 : 4000);
      const listoRip = !!tridente && tipoT === 'riptide' && d > 5 && d <= 25 && ahora - ultRip > 3000 &&
        (bot.entity.isInWater || bot.isRaining);
      if ((listoArco || listoTrid || listoRip) && vista(t)) {
        let eleg;
        if (listoArco && listoTrid) eleg = ultimoRango === 'arco' ? 'trid' : 'arco';
        else eleg = listoArco ? 'arco' : (listoTrid ? 'trid' : 'rip');
        ocupado = true; api.ocupar(true);
        api.pausar();
        try {
          if (eleg === 'arco') { ultArco = ahora; ultimoRango = 'arco'; await disparar(t, arco); }
          else if (eleg === 'trid') { ultTrid = ahora; ultimoRango = 'trid'; await disparar(t, tridente); }
          else { ultRip = ahora; await impulsoRiptide(t, tridente); }
        } finally { ocupado = false; api.ocupar(false); api.equiparArma(); if (valido(t)) api.reanudar(t); }
      }
    } catch (e) {
      ocupado = false; api.ocupar(false);
      console.error('[combate]', e.message); require('./diag').log('error', 'combate', e.message);
    }
  }, 150);

  // ---------- Contra-estilo: hace lo contrario que el rival para descolocarlo ----------
  // rusher (corre y golpea) -> retrocede en rafagas con salto; arquero (se planta a disparar) -> zigzag y se acerca;
  // escudo (se cubre) -> rodea y finta. Mezcla lo que ve ahora con la memoria de sus habitos. Una rafaga cada >= 3 s.
  let ultRafaga = 0;
  const estiloDe = (t) => {
    const p = (api.perfil && t.username && api.perfil(t.username)) || {};
    const arma = sosteniendo(t);
    const f = t.metadata && Number(t.metadata[0]) || 0;
    if (/^(bow|crossbow|trident)$/.test(arma) || p.arco >= 35) return 'arquero';
    if (arma === 'shield' || (t.equipment && t.equipment.some((it) => it && it.name === 'shield')) || p.escudo >= 35) return 'escudo';
    if ((f & 0x08) || p.sprint >= 45) return 'rusher';
    return null;
  };
  const contraEstilo = setInterval(async () => {
    try {
      if (!bot.entity || ocupado || enCaida || api.ocupado() || bot.health < 9 || Date.now() - ultRafaga < 3000) return;
      const t = api.obtenerObjetivo();
      if (!valido(t) || t.type !== 'player') return;
      const d = dist(t), e = estiloDe(t);
      let plan = null;
      if (e === 'rusher' && d < 4) plan = { ms: 550, ctl: ['back', 'sprint', 'jump'] };
      else if (e === 'arquero' && d > 5 && d < 24) plan = { ms: 900, ctl: [Math.random() < 0.5 ? 'left' : 'right', 'forward', 'sprint'] };
      else if (e === 'escudo' && d < 4.5) plan = { ms: 700, ctl: [Math.random() < 0.5 ? 'left' : 'right', 'jump'] };
      if (!plan) return;
      ultRafaga = Date.now(); ocupado = true;
      api.pausar();
      try {
        bot.lookAt(t.position.offset(0, 1.6, 0), true).catch(() => {});
        plan.ctl.forEach((c) => bot.setControlState(c, true));
        await new Promise((r) => setTimeout(r, plan.ms));
      } finally {
        ['back', 'left', 'right', 'forward', 'jump', 'sprint'].forEach((c) => { try { bot.setControlState(c, false); } catch (x) { /* ignorar */ } });
        ocupado = false;
        if (valido(t)) api.reanudar(t);
      }
    } catch (err) { ocupado = false; }
  }, 400);
  api.intervalos.push(contraEstilo);

  // ---------- Escudo reactivo: contra cualquier ataque, no solo la mace ----------
  let escudoArriba = false, escudoHasta = 0, sinAlzarHasta = 0, escudoRotoHasta = 0, ultDano = 0, hpPrev = bot.health;
  const alzar = (ms, forzar) => {
    const ahora = Date.now();
    if (escudoArriba || ahora < escudoRotoHasta || (!forzar && ahora < sinAlzarHasta)) return;
    const off = bot.inventory.slots[45];
    if (!off || off.name !== 'shield') return;
    try { bot.activateItem(true); escudoArriba = true; escudoHasta = ahora + ms; } catch (e) { /* ignorar */ }
  };
  const bajar = () => {
    if (!escudoArriba) return;
    try { bot.deactivateItem(); } catch (e) { /* ignorar */ }
    escudoArriba = false;
    sinAlzarHasta = Date.now() + 350; // hueco para poder golpear entre guardias
  };
  bot.on('health', () => {
    if (bot.health < hpPrev) {
      ultDano = Date.now();
      // Dano con el escudo arriba y un hacha cerca: probablemente nos lo inutilizo (5 s). No insistir.
      const hacha = Object.values(bot.entities).find((e) => e !== bot.entity && e.type === 'player' &&
        e.heldItem && /_axe$/.test(e.heldItem.name) && e.position.distanceTo(bot.entity.position) < 6);
      if (escudoArriba && hacha) { escudoRotoHasta = Date.now() + 5000; bajar(); }
    }
    hpPrev = bot.health;
  });
  const PROYECTIL = /^(arrow|spectral_arrow|trident|fireball|small_fireball|wind_charge|snowball|egg)$/;
  const defensa = setInterval(() => {
    if (!bot.entity) { clearInterval(defensa); return; }
    if (api.ocupado() || enMLG || ocupado) { bajar(); return; }
    const ahora = Date.now();
    if (escudoArriba && ahora > escudoHasta) bajar();
    const p = bot.entity.position;
    const todos = Object.values(bot.entities);
    const proy = todos.find((e) => PROYECTIL.test(e.name || '') && e.velocity &&
      e.position.distanceTo(p) < 14 && e.position.plus(e.velocity).distanceTo(p) < e.position.distanceTo(p) - 0.2);
    if (proy) { alzar(900, true); return; }
    const arquero = todos.find((e) => e !== bot.entity && e.type === 'player' && e.heldItem &&
      /^(bow|crossbow)$/.test(e.heldItem.name) && e.position.distanceTo(p) < 35);
    if (arquero && (ahora - ultDano < 4000 || usando(arquero))) { try { bot.lookAt(arquero.position.offset(0, 1.6, 0), true); } catch (e) { /* ignorar */ } alzar(700); return; }
    const cerca = todos.find((e) => e !== bot.entity && (e.type === 'player' || e.type === 'hostile') &&
      e.position.distanceTo(p) < 4.2 && e.username !== bot.username);
    if (cerca) {
      const arma = (cerca.heldItem && cerca.heldItem.name) || '';
      const peligrosa = /_axe$|^mace$|^trident$/.test(arma);
      if (ahora - ultDano < 2500 || bot.health < 16 || peligrosa || cerca.name === 'creeper') alzar(500);
    } else if (escudoArriba) bajar();
  }, 100);
  api.intervalos.push(defensa);

  // ---------- Water-drop (MLG): cubo de agua al caer ----------
  let yMax = -Infinity, cuboListo = false, aguaPuesta = false;
  const suelo = () => { // primer bloque no vacio debajo; null si es agua/colchon o no hay
    const base = bot.entity.position.floored();
    for (let k = 0; k <= 40; k++) {
      const b = bot.blockAt(base.offset(0, -k, 0));
      if (!b) return null;
      if (b.name === 'air' || b.name === 'cave_air' || b.name === 'void_air') continue;
      if (/water|slime_block|cobweb|powder_snow|scaffolding|vine|ladder|hay_block/.test(b.name)) return { seguro: true };
      return { dist: bot.entity.position.y - (b.position.y + 1), seguro: false };
    }
    return null;
  };
  const mlg = setInterval(async () => {
    if (!bot.entity) { clearInterval(mlg); return; }
    const e = bot.entity;
    try {
      if (e.onGround || e.isInWater) {
        if (aguaPuesta && !ocupado) { // recoger el agua puesta para no dejar el cubo vacio
          aguaPuesta = false; enMLG = true;
          bot.look(e.yaw, -Math.PI / 2, true);
          await dormir(80);
          bot.activateItem();
          await dormir(200);
          api.equiparArma();
        }
        yMax = -Infinity; cuboListo = false; enMLG = false;
        return;
      }
      yMax = Math.max(yMax, e.position.y);
      if (e.velocity.y > -0.5 || e.isInLava || e.isInWater) return;
      const balde = tiene('water_bucket');
      if (!balde) return;
      const s = suelo();
      if (!s || s.seguro) return;
      const caidaTotal = (yMax - e.position.y) + s.dist;
      if (caidaTotal < 4.5) return; // dano de caida solo si > 3 bloques; margen
      enMLG = true;
      if (!cuboListo && s.dist < 14) {
        cuboListo = true;
        if (!bot.heldItem || bot.heldItem.name !== 'water_bucket') await bot.equip(balde, 'hand');
      }
      bot.look(e.yaw, -Math.PI / 2, true);
      if (cuboListo && !aguaPuesta && s.dist <= 3.4 && s.dist > 0.2) {
        bot.activateItem();
        aguaPuesta = true;
      }
    } catch (err) { /* ignorar */ }
  }, 50);
  api.intervalos.push(mlg);

  // ---------- Escape: totem, perla de ender y correr cuando va perdiendo ----------
  let ultPerla = 0, jitter = 0, jitterTs = 0;
  const hpLog = [];
  bot.on('health', () => { hpLog.push([Date.now(), bot.health]); if (hpLog.length > 40) hpLog.shift(); });
  // Umbral de huida variable: base 6 con azar (-2..+2, cambia cada 15 s), sube contra rival superior o si
  // pierde vida muy rapido, baja si tiene totem o manzana dorada. Nunca fijo.
  let fracHuida = 0.3;
  const umbralHuida = (t) => {
    const ahora = Date.now();
    if (ahora - jitterTs > 10000 + Math.random() * 15000) { jitterTs = ahora; fracHuida = Math.max(0.12, Math.min(0.5, fracHuida + (Math.random() - 0.5) * 0.16 + (0.3 - fracHuida) * 0.2)); }
    const max = (bot.entity && bot.entity.attributes && 20) || 20;
    let f = fracHuida;
    if (t.type === 'player' && rivalSuperior(t)) f += 0.12;
    const maxReciente = Math.max(bot.health, ...hpLog.filter(([ts]) => ahora - ts < 3000).map((r) => r[1]));
    if ((maxReciente - bot.health) / max >= 0.4) f += 0.12;
    if (tiene('totem_of_undying')) f -= 0.08;
    if (tiene('golden_apple') || tiene('enchanted_golden_apple')) f -= 0.05;
    return max * Math.max(0.1, Math.min(0.65, f));
  };
  let ultPerlaOfensiva = 0;
  function mejorAnguloPerla(ojo, dest, yaw) {
    let mejor = null, md = 1e9;
    for (let g = -70; g <= 55; g += 1.5) {
      const pitch = g * Math.PI / 180, cp = Math.cos(pitch);
      let px = ojo.x, py = ojo.y, pz = ojo.z;
      let vx = -Math.sin(yaw) * cp * 1.5, vy = Math.sin(pitch) * 1.5, vz = -Math.cos(yaw) * cp * 1.5;
      for (let t = 0; t < 140; t++) {
        px += vx; py += vy; pz += vz; vx *= 0.99; vy = vy * 0.99 - 0.03; vz *= 0.99;
        const d = Math.hypot(px - dest.x, py - dest.y, pz - dest.z);
        if (d < md) { md = d; mejor = pitch; }
        if (vy < 0 && py < dest.y - 2) break;
      }
    }
    return md < 2.5 ? mejor : null;
  }
  const perlaOfensiva = setInterval(async () => {
    if (!bot.entity || api.ocupado() || enMLG || ocupado) return;
    const ahora = Date.now();
    if (ahora - ultPerlaOfensiva < 12_000 || bot.health < 11) return;
    const t = api.obtenerObjetivo();
    const perla = tiene('ender_pearl');
    if (!perla || !valido(t) || t.type !== 'player') return;
    const d = dist(t);
    if (d < 12 || d > 40) return;
    const v = velocidad(t);
    const alejando = ((t.position.x - bot.entity.position.x) * v.x + (t.position.z - bot.entity.position.z) * v.z) / (d || 1) > 0.12;
    if (!alejando) return;
    const ojo = bot.entity.position.offset(0, 1.62, 0);
    const dest = futura(t, t.position.offset(0, 0.2, 0), Math.min(40, d * 0.9));
    const suelo = bot.blockAt(dest.offset(0, -1, 0).floored()), cuerpo = bot.blockAt(dest.floored());
    if (!suelo || !cuerpo || suelo.name === 'air' || /lava|water/.test(suelo.name) || /lava/.test(cuerpo.name)) return;
    const yaw = Math.atan2(-(dest.x - ojo.x), -(dest.z - ojo.z));
    const pitch = mejorAnguloPerla(ojo, dest, yaw);
    if (pitch === null) return;
    ultPerlaOfensiva = ahora; ocupado = true; api.ocupar(true);
    try {
      api.pausar();
      await bot.equip(perla, 'hand');
      await bot.look(yaw, pitch, true);
      bot.activateItem();
      await dormir(250);
    } catch (e) { /* ignorar */ } finally { ocupado = false; api.ocupar(false); api.equiparArma(); }
  }, 400);
  api.intervalos.push(perlaOfensiva);

  const escape = setInterval(async () => {
    if (!bot.entity) { clearInterval(escape); return; }
    if (api.ocupado() || enMLG || ocupado) return;
    try {
      const hp = bot.health, ahora = Date.now();
      const off = bot.inventory.slots[45];
      const totem = tiene('totem_of_undying'), escudo = tiene('shield');
      if (totem && hp <= 10 && (!off || off.name !== 'totem_of_undying')) bot.equip(totem, 'off-hand').catch(() => {});
      else if (hp >= 17 && off && off.name === 'totem_of_undying' && escudo) bot.equip(escudo, 'off-hand').catch(() => {});
      const t = api.obtenerObjetivo();
      if (!t || hp > umbralHuida(t)) return;
      const d = dist(t);
      if (d > 10) return;
      const perla = tiene('ender_pearl');
      if (perla && d < 8 && ahora - ultPerla > 8000) {
        ultPerla = ahora; ocupado = true; api.ocupar(true);
        try {
          api.pausar();
          await bot.equip(perla, 'hand');
          const dx = bot.entity.position.x - t.position.x, dz = bot.entity.position.z - t.position.z;
          await bot.look(Math.atan2(-dx, -dz), 0.6, true); // lejos del enemigo y hacia arriba
          bot.activateItem();
          await dormir(300);
        } finally { ocupado = false; api.ocupar(false); api.equiparArma(); }
      }
      api.huir(t);
    } catch (err) { ocupado = false; api.ocupar(false); }
  }, 400);
  api.intervalos.push(escape);

  // Recoger el tridente lanzado cuando no hay pelea (clavado en un bloque o caido como item).
  const prev = new Map();
  const recoger = setInterval(() => {
    if (!bot.entity) { clearInterval(recoger); return; }
    if (tiene('trident')) { bot._tridenteLanzado = false; return; }
    if (!bot._tridenteLanzado || ocupado || api.ocupado() || api.obtenerObjetivo()) return;
    const p = bot.entity.position;
    const e = Object.values(bot.entities).find((x) => {
      const quieto = prev.has(x.id) && prev.get(x.id).distanceTo(x.position) < 0.1;
      prev.set(x.id, x.position.clone());
      if (!quieto || x.position.distanceTo(p) > 40) return false;
      if (x.name === 'trident') return true;
      const it = x.name === 'item' && x.getDroppedItem && x.getDroppedItem();
      return !!(it && it.name === 'trident');
    });
    if (e) api.irA(e.position);
  }, 1000);
  api.intervalos.push(recoger);
  const columnaPeligro = (x, y, z) => {
    for (let k = 0; k <= 7; k++) {
      const b = bot.blockAt(new Vec3(x, y - k, z));
      if (!b) return false;
      if (/lava|fire|magma/.test(b.name)) return true;
      if (b.boundingBox === 'block' || /water/.test(b.name)) return false;
    }
    return true;
  };
  let ultEmpuje = 0;
  const empuje = setInterval(() => {
    if (!bot.entity || api.ocupado() || ocupado || enMLG || bot.health < 12) return;
    const t = api.obtenerObjetivo();
    if (!valido(t) || t.type !== 'player' || Date.now() - ultEmpuje < 2500) return;
    const d = dist(t);
    if (d > 6 || d < 1.5) return;
    const tp = t.position.floored(), bp = bot.entity.position;
    const dx = t.position.x - bp.x, dz = t.position.z - bp.z, m = Math.hypot(dx, dz) || 1;
    const ux = dx / m, uz = dz / m;
    for (let k = 1; k <= 3; k++) if (columnaPeligro(Math.floor(t.position.x + ux * k), tp.y, Math.floor(t.position.z + uz * k))) return;
    let mejor = null;
    for (const [hx, hz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (!columnaPeligro(tp.x + hx * 2, tp.y, tp.z + hz * 2) || !columnaPeligro(tp.x + hx * 3, tp.y, tp.z + hz * 3)) continue;
      const px = t.position.x - hx * 2, pz = t.position.z - hz * 2;
      const suelo = bot.blockAt(new Vec3(Math.floor(px), tp.y - 1, Math.floor(pz)));
      const pie = bot.blockAt(new Vec3(Math.floor(px), tp.y, Math.floor(pz)));
      if (!suelo || suelo.boundingBox !== 'block' || !pie || pie.boundingBox !== 'empty') continue;
      if (columnaPeligro(Math.floor(px), tp.y, Math.floor(pz))) continue;
      const c = Math.hypot(px - bp.x, pz - bp.z);
      if (!mejor || c < mejor.c) mejor = { px, pz, c };
    }
    if (!mejor || mejor.c > 4.5) return;
    ultEmpuje = Date.now();
    api.irA(new Vec3(mejor.px, tp.y, mejor.pz));
  }, 500);
  api.intervalos.push(empuje);
  api.intervalos.push(loop);
}

module.exports = { iniciarCombate, calcularPitch, simular };
