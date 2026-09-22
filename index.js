const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // fuerza IPv4 antes que IPv6 en toda la app

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvpPlugin = require('mineflayer-pvp').plugin;
const { autoCrystal } = require('mineflayer-autocrystal');
const { status: statusPing } = require('minecraft-server-util');
const express = require('express');
const { parseFlatSnbt } = require('./snbt');
const { preguntarIA } = require('./openrouter');

// ---- Config por variables de entorno (se configuran en Render) ----
const HOST = process.env.MC_HOST;              // ej: tuserver.aternos.me
const PORT = parseInt(process.env.MC_PORT || '25565', 10);
const BOT_USERNAME = process.env.MC_BOT_USERNAME || 'ia_244jhytsewr5'; // username tecnico, no se muestra como "AM"
const PERSONAJE = process.env.MC_PERSONAJE || 'AM';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const VERSION = process.env.MC_VERSION && process.env.MC_VERSION !== 'false' && process.env.MC_VERSION !== 'auto'
  ? process.env.MC_VERSION
  : '1.21.4'; // version fija: el ping de auto-deteccion (version:false) falla consistentemente
             // contra este server, aunque el login directo con version fija si funciona.

if (!HOST || !OPENROUTER_KEY) {
  console.error('Faltan variables de entorno: MC_HOST y/o OPENROUTER_API_KEY');
  process.exit(1);
}

// Cooldown por jugador para no llamar a la API en cada linea de reporte (1/seg)
const COOLDOWN_MS = 25_000;
const lastCall = new Map(); // nombre -> timestamp
const trampaLastUse = new Map(); // nombre -> timestamp de la ultima trampa activada
const historialJugador = new Map(); // nombre -> { interacciones, ultimasRespuestas: [], eventos: [] }

function registrarInteraccion(nombre) {
  const h = historialJugador.get(nombre) || { interacciones: 0, ultimasRespuestas: [], eventos: [] };
  h.interacciones++;
  historialJugador.set(nombre, h);
  return h;
}

function registrarRespuesta(nombre, texto) {
  const h = historialJugador.get(nombre) || { interacciones: 0, ultimasRespuestas: [], eventos: [] };
  h.ultimasRespuestas.push(texto);
  if (h.ultimasRespuestas.length > 5) h.ultimasRespuestas.shift(); // solo las ultimas 5
  historialJugador.set(nombre, h);
}

// Compara el contexto anterior con el nuevo y registra eventos notables (no
// solo el estado actual, sino "que paso" desde el ultimo reporte). Guarda los
// ultimos 4 eventos por jugador, con timestamp relativo para que el prompt
// pueda decir "hace un momento" en vez de solo el estado presente.
function detectarYRegistrarEventos(nombre, anterior, nuevo) {
  const h = historialJugador.get(nombre) || { interacciones: 0, ultimasRespuestas: [], eventos: [] };
  const ahora = Date.now();
  const agregar = (texto) => {
    h.eventos.push({ texto, ts: ahora });
    if (h.eventos.length > 4) h.eventos.shift();
  };

  if (anterior) {
    const diamAntes = typeof anterior.diamantes === 'number' ? anterior.diamantes : 0;
    const diamAhora = typeof nuevo.diamantes === 'number' ? nuevo.diamantes : 0;
    if (diamAhora > diamAntes) agregar(`mino ${diamAhora - diamAntes} diamante(s)`);

    const vidaAntes = typeof anterior.vida === 'number' ? anterior.vida : 20;
    const vidaAhora = typeof nuevo.vida === 'number' ? nuevo.vida : 20;
    if (vidaAhora <= 6 && vidaAntes > 6) agregar('estuvo a punto de morir');
    if (vidaAhora > vidaAntes + 4) agregar('se curo o comio para recuperar vida');

    if (nuevo.cerca_borde === 1 && anterior.cerca_borde !== 1) agregar('estuvo al borde de un precipicio');
    if (nuevo.cerca_lava === 1 && anterior.cerca_lava !== 1) agregar('se acerco peligrosamente a lava');
  }
  historialJugador.set(nombre, h);
}

// Formatea los eventos guardados como texto con antiguedad relativa, para el prompt.
function formatearEventos(nombre) {
  const h = historialJugador.get(nombre);
  if (!h || !h.eventos.length) return null;
  const ahora = Date.now();
  return h.eventos.map(e => {
    const segs = Math.round((ahora - e.ts) / 1000);
    const cuando = segs < 10 ? 'justo ahora' : segs < 90 ? `hace ~${segs}s` : `hace ~${Math.round(segs / 60)}min`;
    return `${e.texto} (${cuando})`;
  }).join('; ');
}

// Solo reaccionamos si hay una situacion "interesante": cerca de lava, cerca de
// un borde, o vida baja. Si no, ignoramos el reporte para no gastar API de balde.
function esSituacionInteresante(ctx) {
  return ctx.cerca_lava === 1 || ctx.cerca_borde === 1 || (typeof ctx.vida === 'number' && ctx.vida <= 6);
}

// Bloque que el bot tiene justo enfrente (donde esta mirando), con coordenadas
// exactas -- asi el LLM puede pedir [MINAR:x,y,z] con datos reales, no inventados.
function obtenerBloqueEnfrente(bot) {
  try {
    const bloque = bot.blockAtCursor(4);
    if (!bloque || bloque.name === 'air') return null;
    return { nombre: bloque.name, x: bloque.position.x, y: bloque.position.y, z: bloque.position.z };
  } catch (e) { return null; }
}

// Distancia (bloques) bajo la cual se considera que un jugador es una amenaza cercana
const DISTANCIA_PELIGRO = 4;
const DURACION_HUIDA_MS = 1500;

function iniciarHuida(bot) {
  function atacar(objetivo) {
    if (!objetivo || !bot.entity || !bot.pvp) return;
    // Validacion: el objetivo debe seguir existiendo en el mundo y no estar
    // en creative/spectator (atacar esos modos causa invalid_entity_attacked).
    const sigueValido = bot.entities[objetivo.id];
    const gm = objetivo.gameMode;
    if (!sigueValido || gm === 'creative' || gm === 'spectator') return;

    // Reach real: usa el attribute del bot si esta disponible (varia por
    // encantamientos/version), con 3 bloques como fallback conservador.
    const attrReach = bot.entity.attributes && bot.entity.attributes['minecraft:generic.attack_range'];
    const reach = attrReach ? attrReach.value : 3;
    const distancia = objetivo.position.distanceTo(bot.entity.position);
    if (distancia > reach) return; // fuera de alcance real, no intentar golpear

    // Linea de vision: raycast desde los ojos del bot hasta el objetivo, usando
    // el patron oficial de mineflayer (canSeeBlock) que compara la posicion del
    // bloque encontrado, no solo su existencia -- world.raycast sin esto puede
    // fallar en bloques con collision box distinta a la visual.
    const origen = bot.entity.position.offset(0, bot.entity.height, 0);
    const destino = objetivo.position.offset(0, objetivo.height ? objetivo.height / 2 : 0.9, 0);
    const direccion = destino.minus(origen).normalize();
    const bloqueEnMedio = bot.world.raycast(origen, direccion, distancia - 0.3); // -0.3: no cuenta el bloque justo en el objetivo
    if (bloqueEnMedio) return; // hay un bloque solido de por medio, no ataca a traves de el

    // mineflayer-pvp maneja persecucion, timing de golpe y reintentos solo;
    // llamar attack() de nuevo contra el mismo objetivo no reinicia nada.
    bot.pvp.attack(objetivo);
  }

  let objetivoActual = null;
  function perseguir(objetivo) {
    if (!objetivo || !bot.entity || !bot.pathfinder) return;
    if (objetivoActual === objetivo.id) return; // ya lo esta persiguiendo, no resetear
    objetivoActual = objetivo.id;
    try {
      bot.pathfinder.setGoal(new goals.GoalFollow(objetivo, 2), true);
    } catch (e) { /* ignorar */ }
  }

  // Al recibir daño: ataca si esta cerca, si no lo persigue.
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
      // Bloqueo con escudo: si lo tiene en la mano secundaria, lo activa
      // brevemente al recibir daño -- reduce el golpe recibido.
      const offhand = bot.inventory.slots[45];
      if (offhand && offhand.name === 'shield') {
        bot.activateItem(true);
        setTimeout(() => bot.deactivateItem(), 800);
      }
      const atacante = Object.values(bot.entities).find(e =>
        e.type === 'player' && bot.entity && e.position.distanceTo(bot.entity.position) < DISTANCIA_PELIGRO + 2
      );
      if (atacante) {
        if (atacante.position.distanceTo(bot.entity.position) < 3) atacar(atacante);
        else perseguir(atacante);
      }
    }
  });

  // Revision periodica: persigue al jugador mas cercano dentro de rango de vigilancia.
  // Si esta muy lejos, busca terreno alto (high ground) en vez de perseguir a ciegas.
  const RANGO_VIGILANCIA = 20;
  const MOBS_HOSTILES = /zombie|skeleton|creeper|spider|enderman|witch|drowned|husk|stray|phantom|pillager|vindicator/i;
  const chequeoInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(chequeoInterval); return; }

    // Prioridad maxima: TNT encendida cerca. Es una entidad (primed_tnt),
    // no un bloque -- se detecta igual que un mob. Huye antes que cualquier
    // otra decision de combate.
    const tntCerca = Object.values(bot.entities).find(e =>
      (e.name === 'tnt' || e.displayName === 'Primed TNT') &&
      e.position.distanceTo(bot.entity.position) < 6
    );
    if (tntCerca) {
      const dx = bot.entity.position.x - tntCerca.position.x;
      const dz = bot.entity.position.z - tntCerca.position.z;
      const yaw = Math.atan2(-dx, -dz) + Math.PI;
      try {
        bot.look(yaw, 0, true);
        bot.pathfinder.setGoal(new goals.GoalNear(
          bot.entity.position.x + Math.sin(yaw) * 8, bot.entity.position.y, bot.entity.position.z + Math.cos(yaw) * 8, 2
        ));
      } catch (e) { /* ignorar */ }
      return;
    }
    const jugadorCercano = Object.values(bot.entities).find(e =>
      e.type === 'player' && e.username !== BOT_USERNAME &&
      e.gameMode !== 'spectator' && e.gameMode !== 'creative' &&
      e.position.distanceTo(bot.entity.position) < RANGO_VIGILANCIA
    );
    const mobCercano = !jugadorCercano && Object.values(bot.entities).find(e =>
      e.type === 'mob' && MOBS_HOSTILES.test(e.name || '') &&
      e.position.distanceTo(bot.entity.position) < 8
    );
    const objetivo = jugadorCercano || mobCercano;

    // Retirada calculada: con vida baja y un enemigo real cerca, se retira a
    // vez de seguir peleando -- control frio de la situacion, no panico.
    if (bot.health !== undefined && bot.health <= 6 && objetivo) {
      if (objetivoActual !== null) { objetivoActual = null; if (bot.pvp) bot.pvp.stop(); }
      const dx = bot.entity.position.x - objetivo.position.x;
      const dz = bot.entity.position.z - objetivo.position.z;
      const yaw = Math.atan2(-dx, -dz) + Math.PI;
      try {
        bot.look(yaw, 0, true);
        bot.pathfinder.setGoal(new goals.GoalNear(
          bot.entity.position.x + Math.sin(yaw) * 10, bot.entity.position.y, bot.entity.position.z + Math.cos(yaw) * 10, 2
        ));
      } catch (e) { /* ignorar */ }
      return;
    }

    if (objetivo) {
      const dist = objetivo.position.distanceTo(bot.entity.position);
      if (dist < 3) atacar(objetivo);
      else perseguir(objetivo);
    } else {
      objetivoActual = null;
      if (bot.pvp) bot.pvp.stop();
    }
  }, 1000);

  bot.once('end', () => clearInterval(chequeoInterval));

  // Re-equipar cada 10s por si consigue armadura/espada nueva durante la partida
  // (ej. la mina, o la saca de un cofre via CMD).
  const equipoInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(equipoInterval); return; }
    equiparAutomatico(bot);
  }, 10_000);
  bot.once('end', () => clearInterval(equipoInterval));

  // Auto-comer: si el hambre baja de 14/20, come algo del inventario.
  const comidaInterval = setInterval(async () => {
    if (!bot.entity) { clearInterval(comidaInterval); return; }
    if (bot.food === undefined || bot.food >= 14) return;
    const comida = bot.inventory.items().find(i =>
      /bread|apple|beef|porkchop|chicken|carrot|potato|stew|cod|salmon/.test(i.name) &&
      !/rotten|poisonous/.test(i.name)
    );
    if (!comida) return;
    try {
      await bot.equip(comida, 'hand');
      await bot.consume();
    } catch (e) { /* puede fallar si lo interrumpen, no es critico */ }
  }, 5_000);
  bot.once('end', () => clearInterval(comidaInterval));

  // Totem de emergencia: si la vida baja de 8 y tiene un totem en el
  // inventario pero no en la mano secundaria, lo equipa de inmediato.
  const totemInterval = setInterval(async () => {
    if (!bot.entity) { clearInterval(totemInterval); return; }
    if (bot.health === undefined || bot.health > 8) return;
    const offhandActual = bot.inventory.slots[45];
    if (offhandActual && offhandActual.name === 'totem_of_undying') return;
    const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying');
    if (!totem) return;
    try { await bot.equip(totem, 'off-hand'); } catch (e) { /* ignorar */ }
  }, 2_000);
  bot.once('end', () => clearInterval(totemInterval));
}

// ---- Diagnostico: estadisticas acumuladas de todos los intentos ----
const net = require('net');
const stats = {
  intentos: 0,
  exitos: 0,
  fallos: {},          // { 'ETIMEDOUT': 3, 'kicked_vacio': 5, ... }
  tcpOk: 0,            // veces que el socket TCP crudo SI conecto
  tcpFallo: 0,          // veces que el socket TCP crudo NO conecto
  ultimoIntento: null,
  ultimoExito: null,
};

// Prueba un socket TCP crudo, sin protocolo de Minecraft encima. Si esto falla,
// el problema es de red pura (firewall/routing), no de mineflayer ni del protocolo.
// Si esto SIEMPRE funciona pero mineflayer a veces falla, el problema esta en la
// capa de protocolo/aplicacion, no en la red.
function probarSocketCrudo(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const inicio = Date.now();
    let resuelto = false;
    socket.setTimeout(10_000);
    socket.once('connect', () => {
      if (resuelto) return;
      resuelto = true;
      const ms = Date.now() - inicio;
      stats.tcpOk++;
      console.log(`[diag] socket TCP crudo OK en ${ms}ms`);
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      if (resuelto) return;
      resuelto = true;
      stats.tcpFallo++;
      console.log('[diag] socket TCP crudo: TIMEOUT (10s)');
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (e) => {
      if (resuelto) return;
      resuelto = true;
      stats.tcpFallo++;
      console.log(`[diag] socket TCP crudo: ERROR ${e.code || e.message}`);
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function registrarFallo(tipo) {
  stats.fallos[tipo] = (stats.fallos[tipo] || 0) + 1;
}

// Backoff exponencial: Aternos throttlea/rechaza reconexiones demasiado frecuentes.
// Reintentar cada 15s sin parar dispara ese throttle en cadena. Vamos aumentando
// el tiempo de espera con cada fallo consecutivo, y lo reseteamos al conectar bien.
let intentosFallidos = 0;
function proximoDelay() {
  const base = 3_000; // igual que Slobos: reintentos iniciales rapidos
  const delay = Math.min(base * Math.pow(2, intentosFallidos), 90_000); // tope 90s, no 5 min: mas persistente
  const jitter = Math.floor(Math.random() * 2000); // evita que todos los reintentos caigan en el mismo instante
  return delay + jitter;
}

let botConectadoOEnCurso = false;

async function crearBot() {
  if (botConectadoOEnCurso) {
    console.log('[bot] ya hay un intento en curso o bot conectado, se omite este disparo duplicado');
    return;
  }
  botConectadoOEnCurso = true;
  const ultimoContexto = new Map(); // nombre -> ultimo ctx real del datapack, disponible en toda la funcion

  stats.intentos++;
  stats.ultimoIntento = new Date().toISOString();

  // Diagnostico previo: probamos TCP crudo antes de meter mineflayer en la ecuacion.
  const tcpOk = await probarSocketCrudo(HOST, PORT);
  console.log(`[diag] resumen hasta ahora: intentos=${stats.intentos} exitos=${stats.exitos} tcpOk=${stats.tcpOk} tcpFallo=${stats.tcpFallo} fallos=${JSON.stringify(stats.fallos)}`);

  console.log(`[bot] intentando conectar a ${HOST}:${PORT} (version ${VERSION === false ? 'auto' : VERSION}) como ${BOT_USERNAME}... (TCP crudo: ${tcpOk ? 'OK' : 'FALLO'})`);
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    version: VERSION,
    auth: 'offline', // server cracked / offline-mode
    hideErrors: false,
    // NOTA: checkTimeoutInterval se probo en 30s y luego en 600s -- ninguno
    // arreglo el kicked_vacio. Un mantenedor de mineflayer sugirio quitarlo
    // por completo para este mismo sintoma (kick sin razon util, tarda en
    // aparecer): https://github.com/PrismarineJS/mineflayer/issues/1762
  });

  // Failsafe: si createBot no emite login/error/end en 150s, forzamos el reintento.
  // 150s porque Aternos puede tardar 90-120s en completar el spawn (no es un colgado real).
  const failsafe = setTimeout(() => {
    console.log('[bot] sin respuesta tras 150s, forzando reconexion...');
    registrarFallo('failsafe_150s');
    try { bot.end('timeout manual'); } catch (e) { /* ignorar */ }
  }, 150_000);
  bot.once('login', () => clearTimeout(failsafe));
  bot.once('spawn', () => clearTimeout(failsafe));
  bot.once('error', () => clearTimeout(failsafe));
  bot.once('end', () => clearTimeout(failsafe));

  bot.on('login', () => {
    console.log(`[bot] conectado a ${HOST}:${PORT} como ${BOT_USERNAME}`);
    stats.exitos++;
    stats.ultimoExito = new Date().toISOString();
    intentosFallidos = 0; // conexion exitosa: reseteamos el backoff
  });

  bot.on('spawn', () => {
    bot.chat(`La vigilancia de ${PERSONAJE} ha comenzado.`);
    console.log('[bot] Recordatorio: para que las trampas (/function) funcionen, ' +
      `dale OP al usuario tecnico "${BOT_USERNAME}" desde la consola de Aternos: /op ${BOT_USERNAME}`);
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
    if (!bot.pvp) bot.loadPlugin(pvpPlugin);
    if (!bot.autoCrystal) bot.loadPlugin(autoCrystal);
    const movimientos = new Movements(bot);
    movimientos.allowSprinting = true;
    movimientos.canDig = false; // no rompe bloques al perseguir, evita destrozar el mundo
    bot.pathfinder.setMovements(movimientos);
    equiparAutomatico(bot);
    if (!bot._huidaActiva) {
      bot._huidaActiva = true;
      iniciarHuida(bot);
    }
    bot.on('death', () => {
      console.log('[bot] murio, respawneando en el mismo server (sin reconectar)');
    });

    // Habla espontanea: cada ~90s, si hay un jugador cerca, comenta sin que
    // haya pasado nada en particular. Se crea UNA sola vez por conexion (no
    // en cada respawn, que tambien dispara 'spawn' y duplicaria el interval).
    if (!bot._habladorEspontaneoActivo) {
      bot._habladorEspontaneoActivo = true;
      const HABLA_ESPONTANEA_MS = 90_000;
      const habladorInterval = setInterval(async () => {
        if (!bot.entity) return;
        const candidato = Object.values(bot.entities).find(e =>
          e.type === 'player' && e.username !== BOT_USERNAME &&
          e.position.distanceTo(bot.entity.position) < 30
        );
        if (!candidato) return;
        const real = ultimoContexto.get(candidato.username) || {};
        const hist = registrarInteraccion(candidato.username);
        try {
          const respuesta = await preguntarIA(OPENROUTER_KEY, {
            nombre: candidato.username,
            vida: real.vida ?? 'desconocida',
            x: real.x, y: real.y, z: real.z,
            inventario: real.inventario ?? [],
            cerca_lava: 0, cerca_borde: 0, diamantes: real.diamantes ?? 'desconocidos',
            interacciones: hist.interacciones,
            ultimasRespuestas: hist.ultimasRespuestas,
            eventosRecientes: formatearEventos(candidato.username),
            espontaneo: true,
          });
          registrarRespuesta(candidato.username, respuesta);
          await manejarRespuesta(bot, { nombre: candidato.username }, respuesta);
        } catch (e) {
          console.error('[bot] error en habla espontanea:', e.message);
        }
      }, HABLA_ESPONTANEA_MS);
      bot.once('end', () => clearInterval(habladorInterval));
    }
  });

  // Responde cuando un jugador real escribe en el chat (no reportes del datapack)

  bot.on('chat', async (username, mensaje) => {
    console.log(`[diag] evento chat recibido: username="${username}" mensaje="${mensaje}"`);
    try {
      if (username === BOT_USERNAME) return; // ignora sus propios mensajes
      if (mensaje.includes('[IA_DATA]')) return; // por si acaso, nunca deberia pasar por aqui

      const real = ultimoContexto.get(username) || {};
      const hist = registrarInteraccion(username);
      const respuesta = await preguntarIA(OPENROUTER_KEY, {
        nombre: username,
        vida: real.vida ?? 'desconocida',
        cerca_lava: real.cerca_lava ?? 0,
        cerca_borde: real.cerca_borde ?? 0,
        diamantes: real.diamantes ?? 'desconocidos',
        inventario: real.inventario ?? [],
        dimension: real.dimension,
        hora_dia: real.hora_dia,
        mobs_cerca: real.mobs_cerca ?? [],
        x: real.x, y: real.y, z: real.z,
        mensajeDirecto: mensaje,
        interacciones: hist.interacciones,
        ultimasRespuestas: hist.ultimasRespuestas,
        bloqueEnfrente: obtenerBloqueEnfrente(bot),
        eventosRecientes: formatearEventos(username),
      });
      registrarRespuesta(username, respuesta);
      await manejarRespuesta(bot, { nombre: username }, respuesta);
    } catch (e) {
      console.error('[bot] error respondiendo chat:', e.message, e.stack);
    }
  });

  bot.on('message', async (jsonMsg) => {
    const linea = jsonMsg.toString();
    const marcador = '[IA_DATA]';
    const idx = linea.indexOf(marcador);
    if (idx === -1) return;

    const snbtRaw = linea.slice(idx + marcador.length).trim();
    let ctx;
    try {
      ctx = parseFlatSnbt(snbtRaw);
    } catch (e) {
      console.error('[bot] error parseando SNBT:', e.message, snbtRaw);
      return;
    }
    if (!ctx.nombre) return;
    if (ctx.nombre === BOT_USERNAME) return; // ignora reportes sobre el propio bot
    const contextoAnterior = ultimoContexto.get(ctx.nombre);
    detectarYRegistrarEventos(ctx.nombre, contextoAnterior, ctx);
    ultimoContexto.set(ctx.nombre, ctx);

    // El datapack ya filtra cuando reportar (peligro o cada ~15s); aqui solo
    // aplicamos el cooldown para no llamar a la API mas seguido de lo debido.

    const ahora = Date.now();
    const ultima = lastCall.get(ctx.nombre) || 0;
    if (ahora - ultima < COOLDOWN_MS) return;
    lastCall.set(ctx.nombre, ahora);

    try {
      const hist = registrarInteraccion(ctx.nombre);
      const respuesta = await preguntarIA(OPENROUTER_KEY, { ...ctx, interacciones: hist.interacciones, ultimasRespuestas: hist.ultimasRespuestas, eventosRecientes: formatearEventos(ctx.nombre), bloqueEnfrente: obtenerBloqueEnfrente(bot) });
      registrarRespuesta(ctx.nombre, respuesta);
      await manejarRespuesta(bot, ctx, respuesta);
    } catch (e) {
      console.error('[bot] error llamando a OpenRouter:', e.message);
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[bot] kicked:', reason);
    const texto = (typeof reason === 'object' ? JSON.stringify(reason) : String(reason)).toLowerCase();
    if (texto === '{"text":""}' || texto === '""' || texto === '') {
      registrarFallo('kicked_vacio');
    } else if (texto.includes('throttl') || texto.includes('wait before') || texto.includes('too fast') || texto.includes('too many')) {
      console.log('[bot] kick por throttling detectado, se aplicara backoff mas largo');
      registrarFallo('kicked_throttle');
    } else {
      registrarFallo('kicked_otro');
    }
  });
  bot.on('error', (err) => {
    console.log('[bot] error de conexion:', err.code || err.message, err);
    registrarFallo(err.code || 'error_desconocido');
  });
  bot.on('end', () => {
    botConectadoOEnCurso = false;
    intentosFallidos++;
    const delay = proximoDelay();
    console.log(`[bot] desconectado, reintentando en ${Math.round(delay / 1000)}s (intento fallido #${intentosFallidos})...`);
    console.log(`[diag] estadisticas totales: ${JSON.stringify(stats)}`);
    setTimeout(crearBot, delay);
  });

  return bot;
}

function equiparAutomatico(bot) {
  try {
    const piezas = [
      { match: /helmet$/, dest: 'head' },
      { match: /chestplate$/, dest: 'torso' },
      { match: /leggings$/, dest: 'legs' },
      { match: /boots$/, dest: 'feet' },
      { match: /sword$/, dest: 'hand' },
    ];
    for (const p of piezas) {
      const item = bot.inventory.items().find(i => p.match.test(i.name));
      if (item) bot.equip(item, p.dest).catch(() => {});
    }
  } catch (e) { console.error('[bot] error equipando:', e.message); }
}

async function manejarRespuesta(bot, ctx, respuestaCruda) {
  let texto = respuestaCruda;

  const mTrampa = texto.match(/\[TRAMPA:(borde|lava|jaula|oscuridad|desarme)\]/);
  if (mTrampa) texto = texto.replace(mTrampa[0], '').trim();

  const mIr = texto.match(/\[IR:(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mIr) texto = texto.replace(mIr[0], '').trim();

  const mPerseguir = texto.match(/\[PERSEGUIR:(\w+)\]/);
  if (mPerseguir) texto = texto.replace(mPerseguir[0], '').trim();

  const mAtacar = texto.match(/\[ATACAR\]/);
  if (mAtacar) texto = texto.replace(mAtacar[0], '').trim();

  const mHigh = texto.match(/\[HIGHGROUND\]/);
  if (mHigh) texto = texto.replace(mHigh[0], '').trim();

  const mEquipar = texto.match(/\[EQUIPAR\]/);
  if (mEquipar) texto = texto.replace(mEquipar[0], '').trim();

  const mOffhand = texto.match(/\[OFFHAND:([a-z_:]+)\]/);
  if (mOffhand) texto = texto.replace(mOffhand[0], '').trim();

  const mUsar = texto.match(/\[USAR:(ender_pearl|wind_charge)\]/);
  if (mUsar) texto = texto.replace(mUsar[0], '').trim();

  const mArma = texto.match(/\[ARMA:([a-z_:]+)\]/);
  if (mArma) texto = texto.replace(mArma[0], '').trim();

  const mCrystal = texto.match(/\[CRYSTALPVP\]/);
  if (mCrystal) texto = texto.replace(mCrystal[0], '').trim();

  const mCraft = texto.match(/\[CRAFTEAR:([a-z_:]+)\]/);
  if (mCraft) texto = texto.replace(mCraft[0], '').trim();

  const mConstruir = texto.match(/\[CONSTRUIR:([a-z_:]+):(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mConstruir) texto = texto.replace(mConstruir[0], '').trim();

  const mMinar = texto.match(/\[MINAR:(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mMinar) texto = texto.replace(mMinar[0], '').trim();

  const mDatapack = texto.match(/\[DATAPACK:([a-z_]+):([^\]]+)\]/);
  if (mDatapack) texto = texto.replace(mDatapack[0], '').trim();

  const mCmd = texto.match(/\[CMD:([^\]]+)\]/);
  if (mCmd) texto = texto.replace(mCmd[0], '').trim();

  if (texto) bot.chat(texto);

  const COOLDOWN_TRAMPA_MS = 20_000;
  const ahoraTrampa = Date.now();
  const ultimaTrampa = trampaLastUse.get(ctx.nombre) || 0;
  const puedeActivarTrampa = (ahoraTrampa - ultimaTrampa) >= COOLDOWN_TRAMPA_MS;

  if (mTrampa && puedeActivarTrampa) {
    trampaLastUse.set(ctx.nombre, ahoraTrampa);
    if (mTrampa[1] === 'borde') bot.chat('/function ia:trampa_borde');
    if (mTrampa[1] === 'lava') bot.chat('/function ia:trampa_lava');
    if (mTrampa[1] === 'jaula') bot.chat('/function ia:trampa_jaula');
    if (mTrampa[1] === 'oscuridad') bot.chat('/function ia:trampa_oscuridad');
    if (mTrampa[1] === 'desarme') bot.chat('/function ia:trampa_desarme');
  } else if (mTrampa) {
    console.log(`[bot] trampa omitida por cooldown para ${ctx.nombre}`);
  }

  if (mPerseguir) {
    const objetivoNombre = mPerseguir[1];
    const entidad = Object.values(bot.entities).find(e => e.type === 'player' && e.username === objetivoNombre);
    if (entidad && bot.pathfinder) {
      try { bot.pathfinder.setGoal(new goals.GoalFollow(entidad, 2), true); } catch (e) { /* ignorar */ }
    }
  }

  if (mIr) {
    const [, x, y, z] = mIr.map(Number);
    try {
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
    } catch (e) { console.error('[bot] error moviendose:', e.message); }
  }

  if (mAtacar) {
    const objetivo = Object.values(bot.entities).find(e =>
      e.type === 'player' && e.username !== BOT_USERNAME &&
      bot.entity && e.position.distanceTo(bot.entity.position) < 4
    );
    if (objetivo) {
      try { bot.attack(objetivo); } catch (e) { console.error('[bot] error atacando:', e.message); }
    }
  }

  if (mHigh && bot.entity && bot.pathfinder) {
    const pos = bot.entity.position;
    try {
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y + 8, pos.z, 2));
    } catch (e) { /* ignorar */ }
  }

  if (mEquipar) equiparAutomatico(bot);

  if (mOffhand) {
    try {
      const item = bot.inventory.items().find(i => i.name === mOffhand[1]);
      if (item) bot.equip(item, 'off-hand').catch(() => {});
    } catch (e) { console.error('[bot] error equipando offhand:', e.message); }
  }

  if (mUsar) {
    try {
      const item = bot.inventory.items().find(i => i.name === mUsar[1]);
      if (item) {
        await bot.equip(item, 'hand');
        bot.activateItem(); // lanza el ender pearl / wind charge
      }
    } catch (e) { console.error('[bot] error usando item:', e.message); }
  }

  if (mArma) {
    try {
      const item = bot.inventory.items().find(i => i.name === mArma[1]);
      if (item) bot.equip(item, 'hand').catch(() => {});
    } catch (e) { console.error('[bot] error cambiando de arma:', e.message); }
  }

  if (mCrystal && bot.autoCrystal) {
    try {
      const objetivo = Object.values(bot.entities).find(e =>
        e.type === 'player' && e.username !== BOT_USERNAME &&
        bot.entity && e.position.distanceTo(bot.entity.position) < 10
      );
      if (objetivo && bot.inventory.items().some(i => i.name === 'end_crystal')) {
        await bot.autoCrystal.enable();
        setTimeout(() => bot.autoCrystal.disable().catch(() => {}), 10_000); // se apaga solo, no queda activo indefinidamente
      }
    } catch (e) { console.error('[bot] error con crystal pvp:', e.message); }
  }

  if (mConstruir) {
    try {
      const [, materialNombre, x, y, z] = mConstruir;
      const material = bot.inventory.items().find(i => i.name === materialNombre);
      if (material) {
        await bot.equip(material, 'hand');
        const pos = new (require('vec3').Vec3)(Number(x), Number(y) - 1, Number(z));
        const refBlock = bot.blockAt(pos);
        if (refBlock) await bot.placeBlock(refBlock, new (require('vec3').Vec3)(0, 1, 0));
      } else {
        console.log(`[bot] no tiene ${materialNombre} para construir`);
      }
    } catch (e) { console.error('[bot] error construyendo:', e.message); }
  }

  if (mMinar) {
    try {
      const [, x, y, z] = mMinar;
      const pos = new (require('vec3').Vec3)(Number(x), Number(y), Number(z));
      const bloque = bot.blockAt(pos);
      if (bloque && bloque.name !== 'air' && bot.canDigBlock(bloque)) {
        await bot.dig(bloque);
      } else {
        console.log(`[bot] no puede minar ese bloque (inexistente, aire, o irrompible)`);
      }
    } catch (e) { console.error('[bot] error minando:', e.message); }
  }

  if (mDatapack) {
    try {
      const [, id, descripcion] = mDatapack;
      console.log(`[bot] creando datapack: ${id} - ${descripcion}`);
      bot.chat(`/datapack create ${id} "${descripcion.replace(/"/g, "'")}"`);
    } catch (e) { console.error('[bot] error creando datapack:', e.message); }
  }

  if (mCraft) {
    try {
      const mcData = require('minecraft-data')(bot.version);
      const item = mcData.itemsByName[mCraft[1]];
      if (item) {
        const recetas = bot.recipesFor(item.id, null, 1, null);
        if (recetas.length) {
          bot.craft(recetas[0], 1, null).catch(e => console.log('[bot] craft fallo:', e.message));
        } else {
          console.log(`[bot] sin receta disponible (falta mesa de trabajo o materiales) para ${mCraft[1]}`);
        }
      }
    } catch (e) { console.error('[bot] error crafteando:', e.message); }
  }

  if (mCmd) {
    const comando = mCmd[1].trim();
    const peligroso = /^(stop|ban|kick|whitelist|op\s|deop|save-off|difficulty|gamerule|worldborder)/i.test(comando);
    if (peligroso) {
      console.log(`[bot] comando bloqueado por seguridad: /${comando}`);
    } else {
      console.log(`[bot] ejecutando comando decidido por la IA: /${comando}`);
      bot.chat(`/${comando}`);
    }
  }
}

// ---- Servidor HTTP minimo para que Render mantenga el proceso vivo y para el ping externo ----
const app = express();
app.get('/', (_req, res) => res.send('IA antagonista activa'));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), diagnostico: stats }));
app.listen(process.env.PORT || 3000, () => console.log('[http] servidor de salud escuchando'));

crearBot();
