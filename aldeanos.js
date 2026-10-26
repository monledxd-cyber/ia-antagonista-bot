const fs = require('fs');

function crearAldeanos(h) {
  const { bot, diag, o, items, cuenta, tiene, colocar, craftear, libre, dormir, ruta } = h;
  let d = { intentos: {}, otros: {}, alim: 0, cura: 0 };
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  const guardar = () => { try { fs.writeFileSync(ruta, JSON.stringify(d)); } catch (e) { /* ignorar */ } };
  const log = (m) => diag.log('info', 'aldeanos', m);
  const L = (it) => { try { return require('./encantos').leer(bot, it); } catch (e) { return {}; } };

  const tieneMending = () => items().some((i) => L(i).mending) || [5, 6, 7, 8, 45].some((s) => { const x = bot.inventory.slots[s]; return x && L(x).mending; });
  const aldeanos = (r) => Object.values(bot.entities).filter((e) => e.name === 'villager' && e.position && e.position.distanceTo(bot.entity.position) < r).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));

  async function prepararAtril() {
    if (tiene(/^lectern$/)) return true;
    return h.fabricar ? !!(await h.fabricar('lectern', 1)) : false;
  }

  async function esperarEmpleo(al, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin && libre()) {
      await dormir(2500);
      if (!al.isValid && al.isValid !== undefined) return null;
    }
    let v = null;
    try { v = await bot.openVillager(al); } catch (e) { return null; }
    try { if (!v.trades || !v.trades.length) await Promise.race([new Promise((r) => v.once('ready', r)), dormir(3000)]); } catch (e) { /* ignorar */ }
    return v;
  }

  async function bibliotecario() {
    if (tieneMending() || cuenta(/^emerald$/) < 20) return 'nada';
    const cand = aldeanos(32).filter((e) => !d.otros[e.id] && (d.intentos[e.id] || 0) < 25);
    if (!cand.length) return 'nada';
    if (!(await prepararAtril())) return 'nada';
    const al = cand[0];
    if (al.position.distanceTo(bot.entity.position) > 4 && !(await o.irCerca(bot, al.position))) return false;
    for (let k = 0; k < 6 && libre(); k++) {
      const atril = await colocar('lectern');
      if (!atril) return false;
      d.intentos[al.id] = (d.intentos[al.id] || 0) + 1;
      const v = await esperarEmpleo(al, 22_000);
      let encontrado = false, otro = false;
      if (v) {
        try {
          const tr = v.trades || [];
          const libros = tr.map((t, i) => ({ t, i })).filter((x) => x.t.output && x.t.output.name === 'enchanted_book');
          if (!libros.length && tr.length) otro = true;
          const m = libros.find((x) => L(x.t.output).mending);
          if (m && !m.t.disabled) {
            const a1 = m.t.firstInput;
            if (a1 && cuenta(new RegExp('^' + a1.name + '$')) >= a1.count) {
              try { await bot.trade(v, m.i, 1); encontrado = true; log('compro Mending'); if (bot._eventos) bot._eventos.registrar('logro', 'compre un libro de Mending'); if (bot._premio) bot._premio.evento('mending', { k: 'mending', v: 2 }); } catch (e) { diag.log('warn', 'aldeanos', 'trato mending fallo: ' + e.message); }
            } else { encontrado = true; log('Mending cuesta mas de lo que tengo'); }
          }
        } finally { try { v.close(); } catch (e) { /* ignorar */ } }
      }
      guardar();
      if (encontrado) return true;
      if (otro) { d.otros[al.id] = 1; guardar(); }
      const b = bot.blockAt(atril.position);
      if (b && b.name === 'lectern') {
        try { if (b.position.distanceTo(bot.entity.position) > 4) await o.irCerca(bot, b.position); await bot.dig(bot.blockAt(b.position)); await dormir(400); } catch (e) { return false; }
      }
      if (otro) return 'nada';
      await dormir(1500);
    }
    return true;
  }

  const debilidad = () => items().find((i) => i.name === 'splash_potion' && /weakness/.test(JSON.stringify(i.components || i.nbt || '').toLowerCase() + (i.displayName || '').toLowerCase()));
  async function curar() {
    const z = Object.values(bot.entities).find((e) => e.name === 'zombie_villager' && e.position.distanceTo(bot.entity.position) < 40);
    const pocion = debilidad();
    const manzana = items().find((i) => i.name === 'golden_apple');
    if (!z || !pocion || !manzana || Date.now() - d.cura < 120_000) return 'nada';
    d.cura = Date.now(); guardar();
    if (z.position.distanceTo(bot.entity.position) > 6 && !(await o.irCerca(bot, z.position))) return false;
    try {
      await bot.equip(pocion, 'hand');
      await bot.lookAt(z.position.offset(0, 0.9, 0), true);
      bot.activateItem(); await dormir(300); try { bot.deactivateItem(); } catch (e) { /* ignorar */ }
      await dormir(1500);
      if (z.position.distanceTo(bot.entity.position) > 2.8) await o.irCerca(bot, z.position);
      await bot.equip(manzana, 'hand');
      await bot.activateEntity(z);
      log('zombi aldeano en cura');
      return true;
    } catch (e) { return false; }
  }

  async function alimentar() {
    if (Date.now() - d.alim < 600_000) return 'nada';
    const v = aldeanos(20);
    const camas = bot.findBlocks({ matching: (b) => b && /_bed$/.test(b.name), maxDistance: 24, count: 8 }).length;
    const comida = items().find((i) => /^(bread|carrot|potato|beetroot)$/.test(i.name));
    if (v.length < 2 || camas < 2 || !comida || comida.count < 6) return 'nada';
    d.alim = Date.now(); guardar();
    for (const al of v.slice(0, 2)) {
      if (al.position.distanceTo(bot.entity.position) > 3 && !(await o.irCerca(bot, al.position))) continue;
      try { await bot.lookAt(al.position.offset(0, 1, 0), true); await bot.toss(comida.type, null, 3); await dormir(800); } catch (e) { /* ignorar */ }
    }
    log('alimento aldeanos para que críen');
    return true;
  }

  async function aldea() {
    if (!libre()) return 'nada';
    for (const f of [curar, bibliotecario, alimentar]) {
      const r = await f();
      if (r === true) return true;
      if (r === false) return false;
    }
    return 'nada';
  }

  const api = { aldea, guardar, mending: tieneMending, hay: () => aldeanos(40).length };
  bot._aldea = api;
  return api;
}
module.exports = { crearAldeanos };
