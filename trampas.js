// Speakerman update: el bot construye trampas por su cuenta (estilo 2b2t: TNT, lava, pistones, railgun de TNT).
// Todo se construye con comandos (el bot necesita OP): son pocos comandos con /fill y estan limitados en ritmo para
// que el servidor no lo expulse por spam. Hay planos fijos y, ademas, la IA puede disenar los suyos con [PLANO:...].
// Nada de esto se ha probado en un servidor real: solo con un bot simulado.
const { Vec3 } = require('vec3');
const fs = require('fs');
const path = require('path');
const { crearAnalizador } = require('./bloques');

const BASE_OK = /^(grass_block|dirt|coarse_dirt|podzol|mud|stone|cobblestone|deepslate|andesite|diorite|granite|netherrack|stone_bricks|terracotta|snow_block|oak_planks|spruce_planks|birch_planks|dark_oak_planks|sand|red_sand|gravel)$/;
const GRAVEDAD = /^(sand|red_sand|gravel)$/;
const PROHIBIDO = /(command_block|structure_block|structure_void|jigsaw|barrier|bedrock|light|spawner|portal|end_gateway|reinforced_deepslate|debug|test_)/;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sinAire = (n) => n === 'air' || n === 'cave_air' || n === 'void_air';

// ---- Fisica del TNT (wiki): por tick: vy -= 0.04; mover; velocidad *= 0.98. Devuelve Motion para caer en el blanco tras T ticks.
function solucionTNT(origen, blanco, T) {
  let S = 0;
  for (let k = 0; k < T; k++) S += Math.pow(0.98, k);
  let y = 0, vy = 0;
  for (let k = 0; k < T; k++) { vy -= 0.04; y += vy; vy *= 0.98; }
  const d = blanco.minus(origen);
  return new Vec3(d.x / S, (d.y - y) / S, d.z / S);
}

// ---- Railgun (cañon de TNT): fisica de la wiki ----
// Explosion de TNT (poder 4): radio de empuje 8; a distancia d empuja a una entidad (1 - d/8) bloques/tick en la direccion
// centro->entidad, y varias cargas en el MISMO punto suman. El TNT-proyectil sale de la boca M con la velocidad que
// piden la fisica del TNT (gravedad 0.04, arrastre 0.98) y el blanco; cada TNT de carga aporta s = (1 - L/8)*k, con k
// una constante que el bot AJUSTA midiendo el empuje real tras cada disparo.
// Devuelve la configuracion con menos TNT: tiempo de mecha T, cargas n, distancia de carga L, centro C.
function planificarDisparo(M, objetivo, k, valido) {
  let mejor = null;
  for (let T = 12; T <= 90 && !mejor; T++) {
    const m = solucionTNT(M, objetivo, T);
    const v = Math.hypot(m.x, m.y, m.z);
    if (v > 5.4) continue;
    const phi = Math.atan2(m.y, Math.hypot(m.x, m.z));
    if (phi < 0.17 || phi > 0.96) continue; // 10..55 grados
    const u = m.scaled(1 / v);
    for (let n = Math.max(1, Math.ceil(v / (0.9 * k))); n <= 6; n++) {
      const s = v / (n * k);
      if (s >= 0.95 || s <= 0.15) continue;
      const L = 8 * (1 - s);
      const C = M.offset(0, 0.0875, 0).minus(u.scaled(L));
      if (!valido(C, u, L)) continue;
      mejor = { T, m, v, phi, n, L, C, u };
      break;
    }
  }
  return mejor;
}

// ---- Validacion del plano diseñado por la IA ----
// Solo setblock / fill / summon tnt con coordenadas RELATIVAS (~) al ancla; sin NBT salvo fuse/Motion del TNT.
const COORD = /^~(-?\d{1,2})?$/;
function validarPlano(texto) {
  const cmds = String(texto).split(';').map((c) => c.trim()).filter(Boolean);
  if (!cmds.length) return { ok: false, motivo: 'plano vacio' };
  if (cmds.length > 24) return { ok: false, motivo: 'maximo 24 comandos' };
  const salida = [];
  for (const c of cmds) {
    if (c.length > 160) return { ok: false, motivo: 'comando demasiado largo' };
    const t = c.replace(/^\//, '').split(/\s+/);
    const verbo = t[0];
    const off = (tok) => (tok === '~' ? 0 : Number(tok.slice(1)));
    if (verbo === 'setblock') {
      if (t.length < 5 || !t.slice(1, 4).every((x) => COORD.test(x))) return { ok: false, motivo: 'setblock: usa coordenadas ~' };
      if (t.slice(1, 4).some((x) => Math.abs(off(x)) > 12)) return { ok: false, motivo: 'fuera de rango (+-12)' };
      if (!/^[a-z_]+(\[[a-z_=,0-9a-z]*\])?$/.test(t[4]) || PROHIBIDO.test(t[4])) return { ok: false, motivo: 'bloque no permitido: ' + t[4] };
      if (t[5] && !/^(replace|destroy|keep)$/.test(t[5])) return { ok: false, motivo: 'modo no permitido' };
    } else if (verbo === 'fill') {
      if (t.length < 8 || !t.slice(1, 7).every((x) => COORD.test(x))) return { ok: false, motivo: 'fill: usa coordenadas ~' };
      const n = t.slice(1, 7).map(off);
      if (n.some((v) => Math.abs(v) > 12)) return { ok: false, motivo: 'fuera de rango (+-12)' };
      const vol = (Math.abs(n[3] - n[0]) + 1) * (Math.abs(n[4] - n[1]) + 1) * (Math.abs(n[5] - n[2]) + 1);
      if (vol > 2000) return { ok: false, motivo: 'fill demasiado grande (max 2000 bloques)' };
      if (!/^[a-z_]+(\[[a-z_=,0-9a-z]*\])?$/.test(t[7]) || PROHIBIDO.test(t[7])) return { ok: false, motivo: 'bloque no permitido: ' + t[7] };
      if (t[8] && !/^(replace|destroy|keep|hollow|outline)$/.test(t[8])) return { ok: false, motivo: 'modo no permitido' };
      if (t[9]) return { ok: false, motivo: 'sin filtros de replace' };
    } else if (verbo === 'summon') {
      if (t[1] !== 'tnt' || t.length < 5 || !t.slice(2, 5).every((x) => COORD.test(x))) return { ok: false, motivo: 'summon: solo tnt con coordenadas ~' };
      if (t[5] && !/^\{fuse:\d{1,3}(,Motion:\[-?[0-9.]+d?,-?[0-9.]+d?,-?[0-9.]+d?\])?\}$/.test(t[5])) return { ok: false, motivo: 'NBT de tnt: solo {fuse:N,Motion:[x,y,z]}' };
    } else {
      return { ok: false, motivo: 'solo setblock, fill o summon tnt' };
    }
    salida.push(t.join(' '));
  }
  return { ok: true, cmds: salida };
}

function crearTrampero(bot, opts = {}) {
  const HABILITADO = process.env.IA_TRAMPAS !== '0';
  const cola = [];
  let ultEnvio = 0, fallos = 0, bloqueadoHasta = 0;
  const armadas = []; // {id, tipo, x,y,z, creada, ...}
  let seq = 0, ultConstruccion = 0, ultCanon = 0;

  // Cola de comandos: >= 400 ms entre comandos (el servidor expulsa por spam).
  const envio = setInterval(() => {
    if (!cola.length || Date.now() < bloqueadoHasta || !bot.entity) return;
    ultEnvio = Date.now();
    bot.chat('/' + cola.shift());
  }, 400);
  bot.on('messagestr', (m) => {
    if (Date.now() - ultEnvio > 3000) return;
    if (/unknown or incomplete command|do not have permission|no tienes permiso/i.test(m)) {
      if (++fallos >= 3) {
        bloqueadoHasta = Date.now() + 5 * 60_000; cola.length = 0; fallos = 0;
        console.log('[trampas] 3 comandos rechazados seguidos (sin OP o comando mal formado): pausa de 5 min. Da OP al bot: /op ' + bot.username);
      }
    } else if (/changed the block|successfully filled|summoned new|filled \d+ block/i.test(m)) fallos = 0;
  });
  const cmd = (c) => cola.push(c);

  // ---- Terreno ----
  const bloque = (x, y, z) => bot.blockAt(new Vec3(x, y, z));
  function sueloEn(x, z, yRef) {
    for (let y = Math.floor(yRef) + 3; y >= Math.floor(yRef) - 6; y--) {
      const b = bloque(x, y, z), a1 = bloque(x, y + 1, z), a2 = bloque(x, y + 2, z);
      if (b && a1 && a2 && BASE_OK.test(b.name) && sinAire(a1.name) && sinAire(a2.name)) return { x, y, z, name: b.name };
    }
    return null;
  }
  const minY = () => (bot.game && typeof bot.game.minY === 'number' ? bot.game.minY : -64);

  // ---- Revision de planos, memoria y rafagas ----
  const analizador = crearAnalizador(bot.registry, (x, y, z) => bloque(x, y, z));
  const ARCHIVO = process.env.IA_APRENDIZAJE || path.join(__dirname, 'aprendizaje.json');
  let memoria = { planos: {}, kRail: 1 };
  try { memoria = { ...memoria, ...JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) }; } catch (e) { /* primera vez */ }
  const guardar = () => { try { fs.writeFileSync(ARCHIVO, JSON.stringify(memoria)); } catch (e) { /* ignorar */ } };
  // Ráfaga: varios comandos en el mismo instante (para que el proyectil y las cargas nazcan en el mismo tick).
  // El servidor suma 20 de "spam" por comando y expulsa a >200: maximo 8 seguidos y pausa de 2.5 s despues.
  function rafaga(lista) {
    if (cola.length || Date.now() < bloqueadoHasta || lista.length > 8) return false;
    ultEnvio = Date.now();
    for (const c of lista) bot.chat('/' + c);
    bloqueadoHasta = Date.now() + 2500;
    return true;
  }

  // ---- Planos fijos ----
  const planos = {
    // Placa de presion sobre 3 TNT enterrados bajo el suelo: pisar = cadena de TNT.
    mina_tnt(g) {
      const placa = /planks/.test(g.name) ? 'oak_pressure_plate' : 'stone_pressure_plate';
      return {
        cmds: [`fill ${g.x} ${g.y - 3} ${g.z} ${g.x} ${g.y - 1} ${g.z} tnt`, `setblock ${g.x} ${g.y + 1} ${g.z} ${placa}`],
        datos: { gatillo: 'placa' },
      };
    },
    // Foso 3x3 de 5 de profundidad con lava en el fondo, paredes de obsidiana y tapa igual al suelo; la tapa se retira
    // cuando el objetivo esta encima.
    foso_lava(g) {
      if (g.y - 6 <= minY() + 2) return null;
      const tapa = GRAVEDAD.test(g.name) ? 'sandstone' : g.name;
      return {
        cmds: [
          `fill ${g.x - 2} ${g.y - 6} ${g.z - 2} ${g.x + 2} ${g.y} ${g.z + 2} obsidian hollow`,
          `fill ${g.x - 1} ${g.y - 5} ${g.z - 1} ${g.x + 1} ${g.y - 4} ${g.z + 1} lava`,
          `fill ${g.x - 2} ${g.y} ${g.z - 2} ${g.x + 2} ${g.y} ${g.z + 2} ${tapa}`,
        ],
        datos: { gatillo: 'tapa', abrir: `fill ${g.x - 1} ${g.y} ${g.z - 1} ${g.x + 1} ${g.y} ${g.z + 1} air` },
      };
    },
    // Dos pistones frente a frente alrededor de una celda; un bloque de redstone detras de cada uno los activa.
    aplastador(g, ctx = {}) {
      const eje = ctx.eje === 'z' ? 'z' : 'x';
      const [a, b] = eje === 'x' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
      const dirA = eje === 'x' ? 'east' : 'south', dirB = eje === 'x' ? 'west' : 'north';
      const P = (dx, dy, dz) => `${g.x + dx} ${g.y + dy} ${g.z + dz}`;
      const cmds = [];
      for (const dy of [1, 2]) {
        cmds.push(`setblock ${P(a[0], dy, a[1])} piston[facing=${dirA}]`);
        cmds.push(`setblock ${P(b[0], dy, b[1])} piston[facing=${dirB}]`);
      }
      const rb = [];
      for (const dy of [1, 2]) { rb.push(P(a[0] * 2, dy, a[1] * 2)); rb.push(P(b[0] * 2, dy, b[1] * 2)); }
      return { cmds, datos: { gatillo: 'celda', encender: rb.map((p) => `setblock ${p} redstone_block`), apagar: rb.map((p) => `setblock ${p} air`) } };
    },
    // Railgun: pilar de obsidiana de 2 de alto; el TNT-proyectil se coloca encima y las cargas explotan detras y debajo
    // de el, en el aire, para lanzarlo con la fisica real de las explosiones. El codigo calcula carga, angulo y mecha.
    canon(g) {
      return {
        cmds: [`fill ${g.x} ${g.y + 1} ${g.z} ${g.x} ${g.y + 2} ${g.z} obsidian`],
        datos: { gatillo: 'canon', salvas: 0, M: { x: g.x + 0.5, y: g.y + 3, z: g.z + 0.5 } },
      };
    },
  };
  planos.railgun = planos.canon;

  const jugadoresValidos = () => Object.values(bot.entities).filter((e) =>
    e.type === 'player' && e.username && e.username !== bot.username && e.gameMode !== 'creative' && e.gameMode !== 'spectator');

  // ---- Construccion ----
  function construir(tipo, g, ctx) {
    if (!HABILITADO) return { ok: false, motivo: 'trampas desactivadas (IA_TRAMPAS=0)' };
    if (Date.now() < bloqueadoHasta) return { ok: false, motivo: 'sin permiso OP (pausa activa)' };
    const f = planos[tipo];
    if (!f) return { ok: false, motivo: 'tipo desconocido: ' + tipo };
    if (!g) return { ok: false, motivo: 'no hay suelo adecuado' };
    if (bot.game && bot.game.dimension && !/overworld/.test(bot.game.dimension)) return { ok: false, motivo: 'solo en el overworld' };
    const plano = f(g, ctx);
    if (!plano) return { ok: false, motivo: 'no cabe aqui' };
    plano.cmds.forEach(cmd);
    const t = { id: ++seq, tipo, x: g.x, y: g.y, z: g.z, creada: Date.now(), ult: 0, ...plano.datos };
    armadas.push(t);
    while (armadas.length > 4) armadas.shift();
    ultConstruccion = Date.now();
    console.log(`[trampas] ${tipo} armada en ${g.x} ${g.y} ${g.z}`);
    return { ok: true, id: t.id };
  }

  // Verificacion: tras ejecutarse la cola, comprueba que cada setblock quedo como se esperaba. Si todo coincide, el
  // plano se guarda para reutilizarlo; si no, se avisa a la IA con lo que difiere.
  function verificar(ev, cmds, opciones) {
    const esperados = ev.ops.map((o) => ({ x: o.x, y: o.y, z: o.z, n: o.spec.split('[')[0] }));
    let libreDesde = 0, intentos = 0;
    const timer = setInterval(() => {
      if (++intentos > 240) { clearInterval(timer); return; }
      if (cola.length || Date.now() < bloqueadoHasta) { libreDesde = 0; return; }
      if (!libreDesde) { libreDesde = Date.now(); return; }
      if (Date.now() - libreDesde < 1500) return;
      clearInterval(timer);
      const mal = [];
      let conocidos = 0;
      for (const o of esperados) {
        const b = bloque(o.x, o.y, o.z);
        if (!b) continue;
        conocidos++;
        if (b.name !== o.n) mal.push(`${o.x},${o.y},${o.z}: esperaba ${o.n}, hay ${b.name}`);
      }
      if (mal.length) {
        console.log('[trampas] verificacion del plano fallo:', mal.slice(0, 3).join(' | '));
        if (opciones.avisar) opciones.avisar(`PLANO se ejecuto pero no quedo como esperabas (${mal.length} bloques): ${mal.slice(0, 3).join('; ')}. Posible causa: sin OP, bloque protegido o chunk descargado.`);
      } else if (conocidos) {
        const nombre = opciones.nombre || `plano_${++seq}`;
        const previo = memoria.planos[nombre];
        memoria.planos[nombre] = { cmds, ok: ((previo && previo.ok) || 0) + 1, ts: Date.now() };
        const claves = Object.keys(memoria.planos);
        if (claves.length > 20) delete memoria.planos[claves.sort((x, y) => memoria.planos[x].ts - memoria.planos[y].ts)[0]];
        guardar();
        console.log(`[trampas] plano verificado y guardado: ${nombre}`);
      }
    }, 500);
  }

  // Plano diseñado por la IA: ~ relativo al ancla (execute positioned); se revisa con el conocimiento de bloques.
  function construirPlano(texto, g, opciones = {}) {
    if (!HABILITADO) return { ok: false, motivo: 'trampas desactivadas (IA_TRAMPAS=0)' };
    if (Date.now() < bloqueadoHasta) return { ok: false, motivo: 'sin permiso OP (pausa activa)' };
    if (!g) return { ok: false, motivo: 'no hay suelo adecuado' };
    const v = validarPlano(texto);
    if (!v.ok) return v;
    const ev = analizador.evaluar(v.cmds, new Vec3(g.x, g.y + 1, g.z));
    if (ev.errores.length) return { ok: false, motivo: 'plano rechazado: ' + ev.errores.join('; ') };
    for (const c of v.cmds) cmd(`execute positioned ${g.x} ${g.y + 1} ${g.z} run ${c}`);
    ultConstruccion = Date.now();
    console.log(`[trampas] plano de la IA (${v.cmds.length} comandos) en ${g.x} ${g.y + 1} ${g.z}`);
    if (ev.avisos.length && opciones.avisar) opciones.avisar('AVISO del plano (se construyo igualmente): ' + ev.avisos.join('; '));
    verificar(ev, v.cmds, opciones);
    return { ok: true, avisos: ev.avisos };
  }

  // ---- Seguimiento de jugadores: velocidad a ~2 s ----
  const hist = new Map(); // nombre -> [{t, p}]
  const seguimiento = setInterval(() => {
    for (const j of jugadoresValidos()) {
      const h = hist.get(j.username) || [];
      h.push({ t: Date.now(), p: j.position.clone() });
      while (h.length > 6) h.shift();
      hist.set(j.username, h);
    }
  }, 500);
  function velocidad(j) { // bloques/segundo (x,z)
    const h = hist.get(j.username);
    if (!h || h.length < 2) return new Vec3(0, 0, 0);
    const a = h[0], b = h[h.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.4) return new Vec3(0, 0, 0);
    return new Vec3((b.p.x - a.p.x) / dt, 0, (b.p.z - a.p.z) / dt);
  }

  // Sitio para la trampa: delante del jugador segun hacia donde camina (3 s), >= 4 bloques de el y >= 12 del bot;
  // si esta quieto, a 6-9 bloques en un rumbo al azar.
  function sitioPara(j) {
    const v = velocidad(j);
    const rapido = Math.hypot(v.x, v.z) > 0.6;
    const intentos = [];
    for (let i = 0; i < 8; i++) {
      let dx, dz;
      if (rapido) {
        const k = 3 + Math.random() * 1.5;
        dx = v.x * k + (Math.random() - 0.5) * 2; dz = v.z * k + (Math.random() - 0.5) * 2;
        const m = Math.hypot(dx, dz); if (m > 14) { dx *= 14 / m; dz *= 14 / m; }
      } else {
        const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 3;
        dx = Math.cos(ang) * r; dz = Math.sin(ang) * r;
      }
      intentos.push([Math.floor(j.position.x + dx), Math.floor(j.position.z + dz)]);
    }
    for (const [x, z] of intentos) {
      const g = sueloEn(x, z, j.position.y);
      if (!g) continue;
      const dj = Math.hypot(g.x + 0.5 - j.position.x, g.z + 0.5 - j.position.z);
      const db = Math.hypot(g.x + 0.5 - bot.entity.position.x, g.z + 0.5 - bot.entity.position.z);
      if (dj >= 4 && db >= 12) return g;
    }
    return null;
  }
  const rumbo = (j) => {
    const v = velocidad(j);
    return Math.abs(v.x) >= Math.abs(v.z) ? (v.x >= 0 ? 'east' : 'west') : (v.z >= 0 ? 'south' : 'north');
  };

  // ---- Railgun: disparo y calibracion ----
  function calibrar(M, plan) {
    const muestras = new Map();
    let medida = 0, n = 0;
    const timer = setInterval(() => {
      if (++n > 24) {
        clearInterval(timer);
        if (medida > 0.3) {
          const kObs = medida * memoria.kRail / plan.v;
          const kNuevo = Math.max(0.4, Math.min(1.8, 0.6 * memoria.kRail + 0.4 * kObs));
          console.log(`[trampas] railgun: empuje previsto ${plan.v.toFixed(2)} b/tick, medido ${medida.toFixed(2)}; k ${memoria.kRail.toFixed(2)} -> ${kNuevo.toFixed(2)}`);
          memoria.kRail = kNuevo; guardar();
        }
        return;
      }
      for (const x of Object.values(bot.entities)) {
        if (x.name !== 'tnt' || x.position.distanceTo(M) > 16) continue;
        const prev = muestras.get(x.id);
        muestras.set(x.id, { p: x.position.clone(), ts: Date.now() });
        let vp = 0;
        if (prev && (Date.now() - prev.ts) / 50 > 0.5) vp = x.position.distanceTo(prev.p) / ((Date.now() - prev.ts) / 50);
        const vv = x.velocity ? Math.hypot(x.velocity.x, x.velocity.y, x.velocity.z) : 0;
        const m = Math.max(vv, vp);
        if (m < 9) medida = Math.max(medida, m);
      }
    }, 50);
  }
  function dispararRailgun(t, j) {
    const M = new Vec3(t.M.x, t.M.y, t.M.z);
    const v = velocidad(j);
    const valido = (C, u, L) => {
      const b = bloque(Math.floor(C.x), Math.floor(C.y), Math.floor(C.z));
      if (!b || b.boundingBox === 'block') return false; // la carga no puede estar dentro de un bloque
      if (C.y < t.y + 3 && Math.abs(C.x - M.x) < 1.1 && Math.abs(C.z - M.z) < 1.1) return false; // dentro del pilar
      return !bot.world.raycast(C, u, Math.max(0.2, L - 0.2)); // linea libre entre carga y proyectil
    };
    let T = 40, plan = null;
    for (let i = 0; i < 3; i++) {
      const blanco = new Vec3(j.position.x + v.x * T / 20, j.position.y + 0.3, j.position.z + v.z * T / 20);
      const p = planificarDisparo(M, blanco, memoria.kRail, valido);
      if (!p) return false;
      plan = p; T = p.T;
    }
    const f = (x) => x.toFixed(3);
    const lista = [`summon tnt ${f(M.x)} ${f(M.y)} ${f(M.z)} {fuse:${plan.T + 1},Tags:["ia_shot"]}`];
    for (let i = 0; i < plan.n; i++) lista.push(`summon tnt ${f(plan.C.x)} ${f(plan.C.y)} ${f(plan.C.z)} {fuse:1}`);
    if (!rafaga(lista)) return false;
    console.log(`[trampas] railgun: ${plan.n} cargas a ${plan.L.toFixed(1)} bloques, mecha ${plan.T + 1}, elevacion ${(plan.phi * 57.3).toFixed(0)} grados`);
    calibrar(M, plan);
    return true;
  }

  // ---- Gatillos ----
  const trampaVigilar = setInterval(async () => {
    if (!bot.entity) { clearInterval(trampaVigilar); clearInterval(envio); clearInterval(seguimiento); return; }
    const ahora = Date.now();
    for (let i = armadas.length - 1; i >= 0; i--) {
      const t = armadas[i];
      if (ahora - t.creada > 15 * 60_000) { armadas.splice(i, 1); continue; }
      const dBot = Math.hypot(t.x + 0.5 - bot.entity.position.x, t.z + 0.5 - bot.entity.position.z);
      for (const j of jugadoresValidos()) {
        const dx = j.position.x - (t.x + 0.5), dz = j.position.z - (t.z + 0.5), dy = j.position.y - (t.y + 1);
        if (t.gatillo === 'tapa' && Math.abs(dx) <= 1.2 && Math.abs(dz) <= 1.2 && dy >= -0.3 && dy <= 1.2) {
          cmd(t.abrir); armadas.splice(i, 1); console.log('[trampas] foso abierto'); break;
        }
        if (t.gatillo === 'celda' && Math.abs(dx) <= 0.7 && Math.abs(dz) <= 0.7 && dy >= -0.3 && dy <= 1.0 && !t.activa) {
          t.activa = true; t.encender.forEach(cmd);
          setTimeout(() => { t.apagar.forEach(cmd); armadas.splice(armadas.indexOf(t), 1); }, 3500);
          console.log('[trampas] aplastador activado'); break;
        }
        if (t.gatillo === 'canon' && ahora - t.ult > 12_000 && t.salvas < 5 && dBot >= 12) {
          const dist = Math.hypot(dx, dz);
          if (dist >= 8 && dist <= 70 && Math.abs(dy) <= 25 && dispararRailgun(t, j)) {
            t.ult = ahora; t.salvas++;
            if (t.salvas >= 5) armadas.splice(i, 1);
            break;
          }
        }
      }
    }
  }, 250);

  // ---- Autonomia: arma una trampa cuando esta tranquilo y hay un jugador cerca ----
  const autonomo = setInterval(() => {
    if (!HABILITADO || !bot.entity || !opts.tranquilo()) return;
    const ahora = Date.now();
    if (ahora - ultConstruccion < 150_000 || armadas.length >= 4 || cola.length) return;
    const j = jugadoresValidos().filter((e) => e.position.distanceTo(bot.entity.position) <= 48)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
    if (!j) return;
    const g = sitioPara(j);
    if (!g) return;
    const r = Math.random();
    const tipo = r < 0.4 ? 'mina_tnt' : (r < 0.7 ? 'foso_lava' : 'canon');
    construir(tipo, g, { dir: rumbo(j) });
  }, 5000);

  function detener() { [envio, seguimiento, trampaVigilar, autonomo].forEach(clearInterval); }
  bot.once('end', detener);

  return {
    construir: (tipo, jugador, ctx) => {
      const g = jugador ? sitioPara(jugador) : null;
      return construir(tipo, g, { dir: jugador ? rumbo(jugador) : 'north', ...(ctx || {}) });
    },
    construirPlano: (texto, jugador, opciones) => construirPlano(texto, jugador ? sitioPara(jugador) : null, opciones || {}),
    usarGuardado: (nombre, jugador, opciones) => {
      const p = memoria.planos[nombre];
      if (!p) return { ok: false, motivo: 'no tengo ese plano guardado (planos_guardados: ' + Object.keys(memoria.planos).join(', ') + ')' };
      return construirPlano(p.cmds.join(';'), jugador ? sitioPara(jugador) : null, { ...(opciones || {}), nombre });
    },
    nombresGuardados: () => Object.keys(memoria.planos).slice(0, 8),
    kRail: () => memoria.kRail,
    armadas: () => armadas.slice(),
    pendientes: () => cola.length,
    detener,
  };
}

module.exports = { crearTrampero, validarPlano, solucionTNT, planificarDisparo };
