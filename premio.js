const fs = require('fs');
const diag = require('./diag');

const REGLAS = {
  golpe: { v: 0.3 }, gana: { v: 4 }, muere_jugador: { v: 1.5 }, huye: { v: 1 }, kill_con_nuevo: { v: 2 },
  pierde: { v: -2 }, dano: { v: -0.25 }, muerte: { v: -6 }, perder_valioso: { v: -0.3 }, perder_equipo: { v: -1.5 },
  craft_armadura: { v: 2, hab: 1 }, craft_herramienta: { v: 1.2, hab: 1 }, craft_arma: { v: 1.2, hab: 1 }, equipar: { v: 0.8, hab: 1 },
  item_nuevo: { v: 1 }, ganar_valioso: { v: 0.25, hab: 1 }, mineral: { v: 0.4, hab: 1 },
  mineral_perdido: { v: -0.8, hab: 1 }, paso_ok: { v: 0.1, hab: 1 }, paso_fallo: { v: -0.1, hab: 1 }, sin_nada: { v: -0.2, hab: 1 },
  atasco: { v: -0.5, hab: 1 }, muerte_repetida: { v: -3 }, hambre: { v: -0.05 }, aire: { v: -0.2 }, libre: { v: 1 }, frase_efectiva: { v: 0.5 }, frase_fallida: { v: -0.3 }, golpe_pleno: { v: 0.1 }, golpe_critico: { v: 0.25 }, golpe_flojo: { v: -0.15 },
};
const COMBATE = new Set(['golpe', 'gana', 'muere_jugador', 'huye', 'kill_con_nuevo']);
const SIN_CREDITO = new Set(['golpe', 'gana', 'dano', 'muerte', 'pierde', 'hambre', 'aire', 'libre', 'perder_valioso', 'perder_equipo', 'frase_efectiva', 'frase_fallida', 'golpe_pleno', 'golpe_critico', 'golpe_flojo']);

function crearPremio(bot, stats, memoria, ruta) {
  let d = { w: {}, vistos: {}, killsCon: {} }, sucio = false, neto = 0, ultGolpe = 0, hpPrev = null, hist = [], huyoMarca = 0;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  const over = {};
  for (const kv of (process.env.IA_PREMIOS || '').split(',')) { const [k, v] = kv.split('='); if (k && !Number.isNaN(Number(v))) over[k.trim()] = Number(v); }
  const rec = [], uso = new Map();

  function valorDe(regla, k, v, mot) {
    const r = REGLAS[regla] || { v: 1 };
    let x = v !== undefined ? v : (over[regla] !== undefined ? over[regla] : r.v);
    x *= d.w[regla] || 1;
    if (r.hab) {
      const clave = regla + ':' + (k || ''), ahora = Date.now();
      const l = (uso.get(clave) || []).filter((t) => ahora - t < 600_000);
      x /= 1 + 0.35 * l.length; l.push(ahora); uso.set(clave, l);
    }
    if (bot._afecto) x = bot._afecto.pesar(regla, x, { k, motivo: mot });
    else if (COMBATE.has(regla) && stats) x *= 1 + 0.15 * Math.log10(1 + stats.v('sadismo'));
    return x;
  }
  function evento(regla, o) {
    o = o || {};
    const x = valorDe(regla, o.k, o.v, o.motivo);
    if (!x) return 0;
    if (x > 0) stats.sumar('sf', x); else stats.sumar('hm', -x);
    neto += x;
    const ahora = Date.now();
    rec.push({ t: ahora, regla }); while (rec.length && ahora - rec[0].t > 60_000) rec.shift();
    if (Math.abs(x) >= 0.5) diag.log('info', 'premio', `${x > 0 ? 'Sf +' : 'Hm '}${x.toFixed(1)} ${regla}${o.k ? ':' + o.k : ''}${o.motivo ? ' ' + o.motivo : ''}`);
    if (regla === 'muerte') ajustar(0.92, 0.3);
    else if (regla === 'gana') ajustar(1.04, 2.5);
    sucio = true;
    return x;
  }
  function ajustar(f, lim) {
    for (const r of new Set(rec.map((x) => x.regla))) {
      if (SIN_CREDITO.has(r) || (REGLAS[r] && REGLAS[r].v < 0)) continue;
      const w = (d.w[r] || 1) * f;
      d.w[r] = f < 1 ? Math.max(lim, w) : Math.min(lim, w);
    }
  }

  bot.on('health', () => { const h = bot.health; if (hpPrev !== null && h < hpPrev) evento('dano', { v: -(hpPrev - h) * 0.25 }); hpPrev = h; });
  bot.on('entityHurt', (e) => {
    const t = bot.pvp && bot.pvp.target;
    if (t && e === t && e.type === 'player' && Date.now() - ultGolpe > 400) { ultGolpe = Date.now(); evento('golpe'); }
  });
  bot.on('messagestr', (m) => {
    if (typeof m !== 'string' || !bot.players) return;
    if (/ (was slain|was shot|was blown|fell from|drowned|burned|tried to swim|hit the ground|was killed|starved|suffocated|went up in flames|withered)/.test(m)) {
      const n = Object.keys(bot.players).find((x) => x !== bot.username && m.startsWith(x + ' '));
      if (n) evento('muere_jugador', { motivo: n });
    }
  });

  let inv = null, eq = null, ultInv = {}, desde = Date.now() + 6000;
  const IC = () => bot._items;
  const contar = () => { const o = {}; for (const i of bot.inventory.items()) o[i.name] = (o[i.name] || 0) + i.count; return o; };
  const equipo = () => [5, 6, 7, 8, 45].map((s) => (bot.inventory.slots[s] && bot.inventory.slots[s].name) || '');
  bot.on('death', () => {
    let v = 0; const ic = IC();
    for (const [n, c] of Object.entries(ultInv)) if (ic && ic.valioso(n)) v += c;
    evento('muerte');
    if (v) evento('perder_valioso', { v: -Math.min(6, v * 0.3), k: 'muerte' });
    inv = null; eq = null; desde = Date.now() + 6000;
  });
  function revisarInv() {
    const ahora = contar(), ic = IC(), e2 = equipo();
    ultInv = ahora;
    if (Date.now() < desde) { inv = ahora; eq = e2; return; }
    if (inv && ic) {
      for (const [n, c] of Object.entries(ahora)) {
        const g = c - (inv[n] || 0);
        if (g <= 0) continue;
        const r = ic.roles(n);
        if (!d.vistos[n]) { d.vistos[n] = 1; evento('item_nuevo', { k: n, v: ic.valioso(n) ? 2 : 0.6 }); sucio = true; }
        if (r.has('armadura')) evento('craft_armadura', { k: n });
        else if (r.has('herramienta')) evento('craft_herramienta', { k: n });
        else if (r.has('arma') || r.has('distancia')) evento('craft_arma', { k: n });
        else if (ic.valioso(n)) evento('ganar_valioso', { k: n, v: 0.25 * Math.min(g, 8) });
      }
    }
    if (eq) for (let i = 0; i < e2.length; i++) {
      if (!eq[i] && e2[i]) evento('equipar', { k: e2[i] });
      else if (eq[i] && !e2[i] && !bot.inventory.items().some((x) => x.name === eq[i])) evento('perder_equipo', { k: eq[i] });
    }
    inv = ahora; eq = e2;
  }

  const it = setInterval(() => {
    if (!bot.entity) return;
    try { revisarInv(); } catch (e) { /* ignorar */ }
    if (bot.food < 6) evento('hambre');
    if (typeof bot.oxygenLevel === 'number' && bot.oxygenLevel < 8) evento('aire');
    const t = bot.pvp && bot.pvp.target;
    if (!t || t.type !== 'player' || !t.position) { hist = []; return; }
    const dist = t.position.distanceTo(bot.entity.position), ahoraT = Date.now();
    hist.push({ t: ahoraT, d: dist });
    while (hist.length && ahoraT - hist[0].t > 3500) hist.shift();
    const hp = t.metadata && t.metadata[9];
    if (hist.length > 3 && dist - hist[0].d > 5 && typeof hp === 'number' && hp < 8 && ahoraT - huyoMarca > 20_000) {
      huyoMarca = ahoraT; evento('huye', { motivo: t.username }); try { if (memoria && memoria.huyo) memoria.huyo(t.username); } catch (e) { /* ignorar */ }
    }
  }, 1000);
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const TIER = (n) => /netherite/.test(n) ? 5 : /diamond/.test(n) ? 4 : /iron/.test(n) ? 3 : /chainmail|golden|gold|turtle|stone/.test(n) ? 2 : /leather|wooden/.test(n) ? 1 : 0;
  const armaPts = (n) => (/mace/.test(n) ? 5 : /_sword|_axe/.test(n) ? TIER(n) : /bow|crossbow|trident/.test(n) ? 2 : 0);
  function ventaja(t) {
    try {
      const mio = [5, 6, 7, 8].reduce((a, s) => a + (bot.inventory.slots[s] ? TIER(bot.inventory.slots[s].name) : 0), 0) / 2
        + armaPts((bot.heldItem && bot.heldItem.name) || '') + bot.health / 5 + (bot.food >= 14 ? 0.5 : 0)
        + (bot.inventory.items().some((i) => /golden_apple|totem_of_undying/.test(i.name)) ? 1.5 : 0);
      const hp = t.metadata && t.metadata[9];
      const eq = Array.isArray(t.equipment) ? t.equipment : [];
      const suyo = eq.slice(2, 6).reduce((a, i) => a + (i ? TIER(i.name) : 0), 0) / 2
        + armaPts((t.heldItem && t.heldItem.name) || '') + (typeof hp === 'number' ? hp / 5 : 3.5)
        + (eq.some((i) => i && i.name === 'shield') ? 0.7 : 0);
      const otros = Object.values(bot.entities).filter((e) => e !== t && e !== bot.entity && e.position && e.position.distanceTo(bot.entity.position) < 14 && (e.type === 'player' || e.type === 'hostile') && e.username !== bot.username).length;
      return Math.tanh((mio - suyo - otros * 1.5) / 6);
    } catch (e) { return 0; }
  }
  const base = (r) => (over[r] !== undefined ? over[r] : REGLAS[r].v);

  const api = {
    ventaja, evento, sf: (n, m) => evento('libre', { v: Math.abs(n), motivo: m }), hm: (n, m) => evento('libre', { v: -Math.abs(n), motivo: m }),
    pierde: (rival, adv) => { adv = adv || 0; evento('pierde', { v: base('pierde') * (adv > 0 ? 1 + 2 * adv : 1 + 0.5 * adv), motivo: rival + ' adv ' + adv.toFixed(2) }); },
    gana: (arma, rival, adv) => {
      adv = adv || 0;
      evento('gana', { v: base('gana') * (adv < 0 ? 1 + 1.5 * -adv : 1 - 0.4 * adv), motivo: rival + ' adv ' + adv.toFixed(2) });
      if (arma) {
        d.killsCon[arma] = (d.killsCon[arma] || 0) + 1; sucio = true;
        if (d.killsCon[arma] === 1) evento('kill_con_nuevo', { k: arma });
      }
    },
    neto: () => neto, pesos: () => d.w, guardar,
    resumen: () => `Sf ${stats.v('sf').toFixed(0)} / Hm ${stats.v('hm').toFixed(0)}`,
  };
  bot._premio = api;
  return api;
}
module.exports = { crearPremio, REGLAS };
