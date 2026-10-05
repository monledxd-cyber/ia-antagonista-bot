// Speakerman update: el bot construye trampas por su cuenta (estilo 2b2t: TNT, lava, pistones, canon de TNT).
// Todo se construye con comandos (el bot necesita OP): son pocos comandos con /fill y estan limitados en ritmo para
// que el servidor no lo expulse por spam. Hay planos fijos y, ademas, la IA puede disenar los suyos con [PLANO:...].
// Nada de esto se ha probado en un servidor real: solo con un bot simulado.
const { Vec3 } = require('vec3');

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
    // Emplazamiento que lanza salvas de TNT apuntadas (cañon simplificado: no es un railgun de redstone real).
    canon(g, ctx = {}) {
      const dir = ctx.dir || 'north';
      return {
        cmds: [`setblock ${g.x} ${g.y + 1} ${g.z} obsidian`, `setblock ${g.x} ${g.y + 2} ${g.z} dispenser[facing=${dir}]`],
        datos: { gatillo: 'canon', salvas: 0 },
      };
    },
  };

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

  // Plano diseñado por la IA: los comandos van con ~ relativo al ancla (execute positioned).
  function construirPlano(texto, g) {
    if (!HABILITADO) return { ok: false, motivo: 'trampas desactivadas (IA_TRAMPAS=0)' };
    if (Date.now() < bloqueadoHasta) return { ok: false, motivo: 'sin permiso OP (pausa activa)' };
    if (!g) return { ok: false, motivo: 'no hay suelo adecuado' };
    const v = validarPlano(texto);
    if (!v.ok) return v;
    for (const c of v.cmds) cmd(`execute positioned ${g.x} ${g.y + 1} ${g.z} run ${c}`);
    ultConstruccion = Date.now();
    console.log(`[trampas] plano de la IA (${v.cmds.length} comandos) en ${g.x} ${g.y + 1} ${g.z}`);
    return { ok: true };
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
        if (t.gatillo === 'canon' && ahora - t.ult > 20_000 && t.salvas < 4 && dBot >= 8) {
          const dist = Math.hypot(dx, dz);
          if (dist > 4 && dist <= 24) {
            const origen = new Vec3(t.x + 0.5, t.y + 3, t.z + 0.5);
            const ojo = new Vec3(j.position.x, j.position.y + 1.62, j.position.z);
            if (bot.world.raycast(origen, ojo.minus(origen).normalize(), origen.distanceTo(ojo) - 0.5)) continue; // tapado
            t.ult = ahora; t.salvas++;
            const T = 34, v = velocidad(j);
            for (let n = 0; n < 3; n++) {
              const blanco = new Vec3(j.position.x + v.x * T / 20 + (Math.random() - 0.5) * 1.5, j.position.y + 0.5, j.position.z + v.z * T / 20 + (Math.random() - 0.5) * 1.5);
              const m = solucionTNT(origen, blanco, T);
              cmd(`summon tnt ${origen.x.toFixed(2)} ${origen.y.toFixed(2)} ${origen.z.toFixed(2)} {fuse:${T},Motion:[${m.x.toFixed(3)}d,${m.y.toFixed(3)}d,${m.z.toFixed(3)}d]}`);
            }
            console.log('[trampas] salva de TNT');
            if (t.salvas >= 4) armadas.splice(i, 1);
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
    construirPlano: (texto, jugador) => construirPlano(texto, jugador ? sitioPara(jugador) : null),
    armadas: () => armadas.slice(),
    pendientes: () => cola.length,
    detener,
  };
}

module.exports = { crearTrampero, validarPlano, solucionTNT };
