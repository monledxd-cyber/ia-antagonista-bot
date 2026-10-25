const diag = require('./diag');

function crearCuracion(bot, o) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const items = () => bot.inventory.items();
  let ocupado = false, umbral = { v: 11, t: 0 };
  const ult = {};
  bot._curando = () => ocupado;
  const listo = (k, ms) => Date.now() - (ult[k] || 0) > ms;

  function textoPocion(i) {
    try {
      let s = '';
      if (i.components) s += JSON.stringify(i.components);
      if (i.nbt) s += JSON.stringify(i.nbt);
      s += ' ' + (i.displayName || '') + ' ' + (i.customName || '');
      return s.toLowerCase();
    } catch (e) { return ''; }
  }
  const tipoDe = (i) => {
    const s = textoPocion(i);
    if (/healing/.test(s)) return 'curar';
    if (/strength/.test(s)) return 'fuerza';
    if (/swiftness|speed/.test(s)) return 'velocidad';
    if (/fire_resistance|fire resistance/.test(s)) return 'fuego';
    if (/regeneration/.test(s)) return 'regen';
    if (/harming/.test(s)) return 'dano';
    if (/poison/.test(s)) return 'veneno';
    if (/slowness/.test(s)) return 'lentitud';
    if (/weakness/.test(s)) return 'debil';
    return null;
  };
  const pociones = (splash) => items().filter((i) => i.name === (splash ? 'splash_potion' : 'potion')).map((i) => ({ i, t: tipoDe(i) })).filter((x) => x.t);

  const OFENSIVAS = ['dano', 'veneno', 'lentitud', 'debil'];
  const EFECTO = { dano: 'harming', veneno: 'poison', lentitud: 'slowness', debil: 'weakness' };
  const infoDe = (i, t) => { const s = textoPocion(i); return { n: EFECTO[t] || t, mod: /strong_/.test(s) ? 'glowstone_dust' : /long_/.test(s) ? 'redstone' : 'ninguno', splash: i.name === 'splash_potion' }; };
  const nEfectos = (t) => Object.keys((t && t.effects) || {}).length;
  async function lanzarA(it, t) {
    const antes = nEfectos(t), vida = t.metadata && t.metadata[9];
    let golpeado = false;
    const f = (e) => { if (e === t) golpeado = true; };
    bot.on('entityHurt', f);
    await bot.equip(it, 'hand');
    const d = dist(t), v = t.velocity || { x: 0, y: 0, z: 0 };
    const k = Math.min(10, d * 0.5);
    await bot.lookAt(t.position.offset(v.x * k, 0.9 + d * 0.11, v.z * k), true);
    bot.activateItem();
    await dormir(250);
    try { bot.deactivateItem(); } catch (e) { /* ignorar */ }
    await dormir(1800);
    bot.removeListener('entityHurt', f);
    const ok = golpeado || nEfectos(t) > antes || (t.metadata && vida !== undefined && t.metadata[9] < vida);
    if (bot._premio) bot._premio.evento(ok ? 'pocion_golpe' : 'pocion_fallo', { k: EFECTO[it._t] || 'pocion' });
    if (bot._pocionUso) bot._pocionUso(it._info, ok ? 1 : -0.2);
    const B = bot._bandits;
    if (B && B.premiar) { try { B.premiar('pocion_ataque', '*', it._t, ok ? 1 : -0.2); } catch (e) { /* ignorar */ } }
  }
  const rival = () => {
    const t = bot.pvp && bot.pvp.target;
    return t && t.isValid !== false && t.position ? t : null;
  };
  const dist = (t) => (t ? t.position.distanceTo(bot.entity.position) : 99);

  async function consumir(it, ms = 2500) {
    await bot.equip(it, 'hand');
    await Promise.race([bot.consume(), dormir(ms).then(() => { try { bot.deactivateItem(); } catch (e) { /* ignorar */ } })]);
  }
  async function conPausa(f) {
    if (ocupado || o.ocupado()) return false;
    ocupado = true;
    const t = rival();
    try { if (t && bot.pvp) bot.pvp.stop(); } catch (e) { /* ignorar */ }
    try { await f(); } catch (e) { /* ignorar */ }
    finally {
      ocupado = false;
      try { o.reequipar(); } catch (e) { /* ignorar */ }
      try { if (t && t.isValid !== false && bot.pvp && !bot.pvp.target) bot.pvp.attack(t); } catch (e) { /* ignorar */ }
    }
    return true;
  }
  async function lanzarAbajo(it) {
    await bot.equip(it, 'hand');
    await bot.look(bot.entity.yaw, -Math.PI / 2, true);
    bot.activateItem();
    await dormir(250);
    try { bot.deactivateItem(); } catch (e) { /* ignorar */ }
  }

  // ---- pelea: curarse a tiempo ----
  const peleaInt = setInterval(async () => {
    if (!bot.entity || ocupado || o.ocupado() || bot.health === undefined) return;
    const t = rival();
    if (!t) return;
    if (Date.now() > umbral.t) umbral = { v: 8 + Math.floor(Math.random() * 6) + Math.round((bot._cautela ? bot._cautela(t.username) : 0) * 3), t: Date.now() + 20_000 };
    const hp = bot.health, d = dist(t);
    const critico = hp <= 6;

    const sp = pociones(true).find((x) => x.t === 'curar');
    if (sp && hp <= 9 && listo('spl', 2500)) { ult.spl = Date.now(); diag.log('info', 'curacion', 'splash curar'); return void conPausa(() => lanzarAbajo(sp.i)); }

    const beb = pociones(false).find((x) => x.t === 'curar');
    if (beb && hp <= umbral.v && (d >= 3 || critico) && listo('beb', 3000)) { ult.beb = Date.now(); diag.log('info', 'curacion', 'pocion curar'); return void conPausa(() => consumir(beb.i, 2200)); }

    const dorada = items().find((i) => i.name === 'enchanted_golden_apple') || items().find((i) => i.name === 'golden_apple');
    const absorcion = bot.entity.effects && Object.values(bot.entity.effects).some((e) => e && e.id === 22);
    if (dorada && hp <= umbral.v && !absorcion && (d >= 3.5 || critico) && listo('gap', 3500)) { ult.gap = Date.now(); diag.log('info', 'curacion', 'gapple en pelea'); return void conPausa(() => consumir(dorada, 2200)); }

    if (d > 3.5 && d < 11 && hp > 6 && listo('of', 4000)) {
      const disp = pociones(true).filter((x) => OFENSIVAS.includes(x.t));
      if (disp.length) {
        const tipos = [...new Set(disp.map((x) => x.t))];
        const B = bot._bandits;
        const eleg = (B && B.elegir ? B.elegir('pocion_ataque', '*', tipos.map((k) => ({ k }))) : { k: tipos[0] }).k;
        const x = disp.find((y) => y.t === eleg) || disp[0];
        x.i._t = x.t; x.i._info = infoDe(x.i, x.t);
        ult.of = Date.now();
        diag.log('info', 'curacion', 'splash ' + x.t);
        return void conPausa(() => lanzarA(x.i, t));
      }
    }

    // buffs antes de entrar a golpes
    if (d > 4 && d < 28 && hp > 12) {
      for (const [k, nom] of [['fuerza', 'fuerza'], ['velocidad', 'velocidad'], ['fuego', 'fuego']]) {
        const p = pociones(false).find((x) => x.t === nom);
        if (p && listo('buff' + k, 150_000)) { ult['buff' + k] = Date.now(); diag.log('info', 'curacion', 'pocion ' + nom); return void conPausa(() => consumir(p.i, 2200)); }
      }
    }
  }, 350);

  // ---- calma: reparar equipo con XP ----
  const xpInt = setInterval(async () => {
    if (!bot.entity || ocupado || o.ocupado() || rival() || !o.tranquilo()) return;
    if (!listo('xp', 90_000)) return;
    const botella = items().find((i) => i.name === 'experience_bottle');
    if (!botella) return;
    const piezas = [...bot.inventory.slots.slice(5, 9), bot.heldItem, bot.inventory.slots[45]].filter((i) => i && i.maxDurability);
    const dañada = piezas.some((i) => (i.durabilityUsed || 0) / i.maxDurability > 0.3);
    if (!dañada) return;
    ult.xp = Date.now();
    diag.log('info', 'curacion', 'repara con XP');
    await conPausa(async () => {
      for (let k = 0; k < Math.min(botella.count, 3 + Math.floor(Math.random() * 3)); k++) {
        const b = items().find((i) => i.name === 'experience_bottle');
        if (!b || o.hayEnemigo(12)) break;
        await lanzarAbajo(b); await dormir(500);
      }
    });
  }, 5_000);

  // ---- calma: regeneracion/curar si esta herido sin pelea ----
  const calmaInt = setInterval(async () => {
    if (!bot.entity || ocupado || o.ocupado() || rival() || bot.health === undefined || bot.health > 14) return;
    const p = pociones(false).find((x) => x.t === 'regen');
    if (p && listo('regen', 60_000)) { ult.regen = Date.now(); await conPausa(() => consumir(p.i, 2200)); }
  }, 6_000);

  bot.once('end', () => { clearInterval(peleaInt); clearInterval(xpInt); clearInterval(calmaInt); });
  return { tipoDe };
}

module.exports = { crearCuracion };
