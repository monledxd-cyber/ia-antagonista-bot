const fs = require('fs');
const V = require('vec3');
const diag = require('./diag');

const ESPERA = /^(horno|fundir|carne|dormir|pesca|encantar|pociones|nether|end)$/;
const CONSTRUIR = /^(cobblestone|cobbled_deepslate|dirt|netherrack|stone|andesite|diorite|granite|tuff|blackstone|[a-z_]+_planks)$/;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function crearAtasco(bot, ruta) {
  let ref = null, nivel = 0, total = 0, ring = [], fase = 0, ultFase = 0, haciendo = false, ultCausa = null, repBorde = 0;
  let lista = [], sucio = false;
  try { lista = JSON.parse(fs.readFileSync(ruta || 'atascos_am.json', 'utf8')) || []; } catch (e) { lista = []; }
  const firma = () => ({ inv: bot.inventory.items().reduce((a, i) => a + i.count, 0), food: bot.food, hp: Math.round(bot.health) });
  const rival = () => bot.pvp && bot.pvp.target;
  const sol = (v) => { const b = bot.blockAt(v); return !!(b && b.boundingBox === 'block'); };
  const items = () => bot.inventory.items();

  function causa() {
    const e = bot.entity, p = e.position.floored();
    if (e.isInLava) return 'lava';
    if (e.isInWater) return 'agua';
    const b0 = bot.blockAt(p);
    if (b0 && /cobweb|powder_snow|sweet_berry|soul_sand|honey_block|slime_block/.test(b0.name)) return 'enredo';
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of D) for (const dy of [0, 1]) { const b = bot.blockAt(p.offset(dx, dy, dz)); if (b && /_door$|_trapdoor$|fence_gate$/.test(b.name)) return 'puerta'; }
    const muros = D.filter(([dx, dz]) => sol(p.offset(dx, 0, dz)) && sol(p.offset(dx, 1, dz))).length;
    if (muros >= 3) return 'pozo';
    const yaw = e.yaw, fx = -Math.round(Math.sin(yaw)), fz = -Math.round(Math.cos(yaw));
    if (fx || fz) { let suelo = false; for (let dy = -1; dy >= -3; dy--) if (sol(p.offset(fx, dy, fz))) suelo = true; if (!suelo) return 'borde'; }
    return 'pared';
  }

  function girar(yaw) { try { bot.look(yaw, 0, true); } catch (e) { /* ignorar */ } }
  async function mover(ms, teclas) {
    for (const k of teclas) bot.setControlState(k, true);
    await dormir(ms);
    for (const k of teclas) bot.setControlState(k, false);
  }
  const constr = () => items().find((i) => CONSTRUIR.test(i.name));

  async function orilla() {
    const p = bot.entity.position.floored();
    let mejor = null, md = 99;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -1; dy <= 1; dy++) {
      const q = p.offset(dx, dy, dz), b = bot.blockAt(q), a = bot.blockAt(q.offset(0, 1, 0));
      if (b && b.boundingBox === 'block' && a && a.boundingBox === 'empty' && !/water|lava/.test(a.name)) { const d = Math.hypot(dx, dz) + Math.abs(dy); if (d < md) { md = d; mejor = q; } }
    }
    if (!mejor) { girar(Math.random() * Math.PI * 2); await mover(2000, ['forward', 'jump']); return; }
    const c = bot.entity.position;
    girar(Math.atan2(-(mejor.x + 0.5 - c.x), -(mejor.z + 0.5 - c.z)));
    await mover(2500, ['forward', 'jump']);
  }

  async function pilar(n) {
    const it = constr();
    if (!it) return false;
    try { await bot.equip(it, 'hand'); } catch (e) { return false; }
    for (let i = 0; i < n && !rival(); i++) {
      const base = bot.entity.position.floored().offset(0, -1, 0), ref0 = bot.blockAt(base);
      if (!ref0 || ref0.boundingBox !== 'block') break;
      const y0 = bot.entity.position.y;
      try { await bot.look(bot.entity.yaw, -Math.PI / 2, true); } catch (e) { /* ignorar */ }
      bot.setControlState('jump', true);
      for (let t = 0; t < 14 && bot.entity.position.y < y0 + 1.0; t++) await dormir(50);
      try { await bot.placeBlock(ref0, new V(0, 1, 0)); } catch (e) { /* ignorar */ }
      bot.setControlState('jump', false);
      await dormir(250);
      if (causa() !== 'pozo') break;
    }
    bot.setControlState('jump', false);
    return true;
  }

  async function escalera(n) {
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < n && !rival(); i++) {
      const p = bot.entity.position.floored();
      let dir = null;
      for (const [dx, dz] of D) {
        const c1 = bot.blockAt(p.offset(dx, 1, dz)), c2 = bot.blockAt(p.offset(dx, 2, dz));
        if (sol(p.offset(dx, 0, dz)) && c1 && c2 && (c1.boundingBox === 'empty' || bot.canDigBlock(c1)) && (c2.boundingBox === 'empty' || bot.canDigBlock(c2)) && !/lava|water|gravel|sand/.test(c2.name)) { dir = [dx, dz]; break; }
      }
      if (!dir) return false;
      for (const dy of [1, 2]) { const b = bot.blockAt(p.offset(dir[0], dy, dir[1])); if (b && b.boundingBox === 'block') { try { await bot.dig(b); } catch (e) { return false; } } }
      girar(Math.atan2(-dir[0], -dir[1]));
      await mover(700, ['forward', 'jump']);
      if (causa() !== 'pozo') return true;
    }
    return true;
  }

  async function puente(n) {
    const it = constr();
    if (!it) return false;
    try { await bot.equip(it, 'hand'); } catch (e) { return false; }
    const yaw = bot.entity.yaw, dx = -Math.round(Math.sin(yaw)), dz = -Math.round(Math.cos(yaw));
    if (!dx && !dz) return false;
    bot.setControlState('sneak', true);
    for (let i = 0; i < n && !rival(); i++) {
      const base = bot.entity.position.floored().offset(0, -1, 0), b0 = bot.blockAt(base);
      if (!b0 || b0.boundingBox !== 'block') break;
      const dest = bot.blockAt(base.offset(dx, 0, dz));
      if (dest && dest.boundingBox === 'block') break;
      try { await bot.look(yaw, 1.2, true); await bot.placeBlock(b0, new V(dx, 0, dz)); } catch (e) { break; }
      await mover(350, ['forward']);
    }
    bot.setControlState('sneak', false);
    return true;
  }

  async function porCausa(c, f, paso) {
    const p = bot.entity.position;
    if (c === 'agua' || c === 'lava') { await orilla(); return; }
    if (c === 'puerta') {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1]) {
        const b = bot.blockAt(p.floored().offset(dx, dy, dz));
        if (b && /_door$|_trapdoor$|fence_gate$/.test(b.name)) { try { await bot.activateBlock(b); } catch (e) { /* ignorar */ } await mover(900, ['forward']); return; }
      }
      return;
    }
    if (c === 'enredo') {
      const b = bot.blockAt(p.floored());
      if (b && /cobweb|sweet_berry/.test(b.name)) { try { await bot.dig(b); } catch (e) { /* ignorar */ } }
      await mover(900, ['forward', 'jump']);
      return;
    }
    if (c === 'pozo') {
      if (f === 2) { if (!(await pilar(6))) await escalera(8); } else if (!(await escalera(8))) await pilar(6);
      return;
    }
    if (c === 'borde') {
      repBorde++;
      if (f === 2 || repBorde < 2) { await mover(600, ['back']); return; }
      if (!(await puente(5))) await mover(600, ['back']);
      return;
    }
    if (f === 2) { girar(Math.random() * Math.PI * 2); await mover(1200, ['forward', 'jump', 'sprint']); return; }
    const yaw = bot.entity.yaw, dx = -Math.round(Math.sin(yaw)), dz = -Math.round(Math.cos(yaw));
    for (const dy of [1, 0]) {
      const b = bot.blockAt(p.floored().offset(dx, dy, dz));
      if (b && b.boundingBox === 'block' && bot.canDigBlock(b)) { try { await bot.dig(b); } catch (e) { /* ignorar */ } break; }
    }
  }

  function registrar(paso, c, f) {
    const p = bot.entity.position;
    lista.push({ t: Date.now(), paso: paso || null, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), causa: c, fase: f });
    if (lista.length > 300) lista.shift();
    sucio = true;
    if (bot._nnAb && bot._nnAb.atasco) bot._nnAb.atasco();
    if (bot._mapa && f >= 2) bot._mapa.marcarPeligro(p, 0.8, 'atasco ' + c);
  }

  function actuar(paso) {
    total++;
    const A = bot._abasto;
    if (nivel === 1) {
      bot._abortarPaso = true;
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      if (A && A.forzarFallo && paso) A.forzarFallo(paso);
    } else if (nivel === 2) {
      girar(Math.random() * Math.PI * 2);
      for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, true);
      setTimeout(() => { for (const k of ['forward', 'jump', 'sprint']) bot.setControlState(k, false); }, 1800);
      if (A && A.forzarFallo && paso) A.forzarFallo(paso);
    } else {
      bot._pausaAbasto = true;
      setTimeout(() => { bot._pausaAbasto = false; }, 4000);
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    }
    if (bot._premio) bot._premio.evento('atasco', { k: paso || 'sin_paso' });
    if (bot._mapa && nivel >= 2) bot._mapa.marcarPeligro(bot.entity.position, 0.5, 'atasco');
    diag.estado.atasco = `${total} atascos, ultimo nivel ${nivel} en ${paso || 'ningun paso'}`;
    diag.log('warn', 'atasco', `nivel ${nivel} paso ${paso || '-'} en ${bot.entity.position.floored()}`);
  }

  function fino(A, paso) {
    const ahora = Date.now(), p = bot.entity.position;
    const meta = bot.pathfinder && bot.pathfinder.goal;
    if (haciendo || !meta || bot.targetDigBlock || !(bot.pathfinder.isMoving && bot.pathfinder.isMoving())) { if (!haciendo) { ring = []; fase = 0; } return; }
    ring.push({ t: ahora, p: p.clone() });
    while (ring.length && ahora - ring[0].t > 9000) ring.shift();
    if (ring.length < 4 || ahora - ring[0].t < 7000) return;
    let maxD = 0;
    for (const r of ring) maxD = Math.max(maxD, r.p.distanceTo(p));
    if (maxD > 1.2) { fase = 0; repBorde = 0; return; }
    if (ahora - ultFase < 7000) return;
    ultFase = ahora; fase++;
    const c = causa();
    ultCausa = c;
    registrar(paso, c, fase);
    diag.log('warn', 'atasco', `sin avance fase ${fase} causa ${c} paso ${paso || '-'} en ${p.floored()}`);
    if (fase === 1) {
      try { bot.pathfinder.setGoal(null); bot.pathfinder.setGoal(meta, !!meta.dynamic); } catch (e) { /* ignorar */ }
      bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 400);
    } else if (fase <= 3) {
      haciendo = true;
      porCausa(c, fase, paso).catch(() => {}).finally(() => { haciendo = false; ring = []; for (const k of ['forward', 'back', 'jump', 'sprint', 'sneak']) bot.setControlState(k, false); });
    } else {
      fase = 0; ring = [];
      nivel = Math.max(nivel, 1); actuar(paso);
    }
  }

  const it = setInterval(() => {
    const A = bot._abasto;
    if (!bot.entity || bot.health === undefined || !A || !A.activo() || rival() || bot.isSleeping || (bot._nado && bot._nado.activo()) || (bot._curando && bot._curando())) { ref = null; nivel = 0; return; }
    const paso = A.paso ? A.paso() : null;
    if (paso && ESPERA.test(paso)) { ref = null; nivel = 0; return; }
    try { fino(A, paso); } catch (e) { /* ignorar */ }
    const ahora = Date.now(), p = bot.entity.position, f = firma();
    if (!ref || ref.paso !== paso || p.distanceTo(ref.p) > 2.5 || f.inv !== ref.f.inv || f.food !== ref.f.food || f.hp !== ref.f.hp) { ref = { p: p.clone(), f, paso, t: ahora }; nivel = 0; return; }
    const seg = (ahora - ref.t) / 1000;
    const umbral = [40, 70, 110][nivel];
    if (umbral !== undefined && seg >= umbral) { nivel++; actuar(paso); }
    else if (nivel >= 3 && seg >= 160) { ref.t = ahora; nivel = 0; }
  }, 2000);
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta || 'atascos_am.json', JSON.stringify(lista)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60_000);
  if (gt.unref) gt.unref();
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const api = {
    reciente: (ms) => lista.filter((x) => Date.now() - x.t < ms).length,
    riesgo: (paso) => { const n = lista.filter((x) => x.paso === paso && Date.now() - x.t < 24 * 3600_000).length; return n / (n + 4); },
    causa: () => ultCausa, guardar, lista: () => lista, _t: { causa, pilar, escalera, puente },
  };
  bot._atascos = api;
  return api;
}
module.exports = { crearAtasco };
