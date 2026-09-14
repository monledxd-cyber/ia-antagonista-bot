const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // fuerza IPv4 antes que IPv6 en toda la app

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
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

// Solo reaccionamos si hay una situacion "interesante": cerca de lava, cerca de
// un borde, o vida baja. Si no, ignoramos el reporte para no gastar API de balde.
function esSituacionInteresante(ctx) {
  return ctx.cerca_lava === 1 || ctx.cerca_borde === 1 || (typeof ctx.vida === 'number' && ctx.vida <= 6);
}

// Distancia (bloques) bajo la cual se considera que un jugador es una amenaza cercana
const DISTANCIA_PELIGRO = 4;
const DURACION_HUIDA_MS = 1500;

function iniciarHuida(bot) {
  let huyendo = false;
  let atacando = false;
  const PROBABILIDAD_ATACAR = 0.4; // 40% de las veces ataca en vez de huir

  function atacar(objetivo) {
    if (atacando || !objetivo || !bot.entity) return;
    atacando = true;
    try {
      bot.lookAt(objetivo.position.offset(0, objetivo.height || 1.6, 0), true);
      bot.attack(objetivo);
    } catch (e) { /* el objetivo puede haberse movido/desconectado */ }
    setTimeout(() => { atacando = false; }, 600); // cooldown ~= tiempo de recarga de un golpe
  }

  function huirDe(entidadAmenaza) {
    if (huyendo || !entidadAmenaza || !bot.entity) return;

    // Decide arbitrariamente entre atacar o huir, no siempre lo mismo.
    if (Math.random() < PROBABILIDAD_ATACAR) {
      atacar(entidadAmenaza);
      return;
    }

    huyendo = true;

    // Calcula direccion opuesta a la amenaza y gira el bot hacia alla
    const dx = bot.entity.position.x - entidadAmenaza.position.x;
    const dz = bot.entity.position.z - entidadAmenaza.position.z;
    const yaw = Math.atan2(-dx, -dz) + Math.PI; // mirar en direccion contraria

    try {
      bot.look(yaw, 0, true);
      bot.setControlState('forward', true);
      bot.setControlState('sprint', true);
      bot.setControlState('jump', true); // ayuda a superar obstaculos bajos mientras huye
    } catch (e) { /* el bot puede haberse desconectado justo en este instante */ }

    setTimeout(() => {
      try {
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
      } catch (e) { /* ignorar */ }
      huyendo = false;
    }, DURACION_HUIDA_MS);
  }

  // Huir al recibir daño (de cualquier fuente: jugador, mob, caida, etc.)
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
      const atacante = Object.values(bot.entities).find(e =>
        e.type === 'player' && bot.entity && e.position.distanceTo(bot.entity.position) < DISTANCIA_PELIGRO + 2
      );
      huirDe(atacante || null);
    }
  });

  // Revision periodica: si un jugador esta demasiado cerca, huir preventivamente
  const chequeoInterval = setInterval(() => {
    if (!bot.entity) {
      clearInterval(chequeoInterval);
      return;
    }
    const jugadorCercano = Object.values(bot.entities).find(e =>
      e.type === 'player' &&
      e.username !== BOT_USERNAME &&
      e.position.distanceTo(bot.entity.position) < DISTANCIA_PELIGRO
    );
    if (jugadorCercano) huirDe(jugadorCercano);
  }, 800);

  bot.once('end', () => clearInterval(chequeoInterval));
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
  const delay = Math.min(base * Math.pow(2, intentosFallidos), 5 * 60_000);
  const jitter = Math.floor(Math.random() * 2000); // evita que todos los reintentos caigan en el mismo instante
  return delay + jitter;
}

async function crearBot() {
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
    // Aternos puede tardar 90-120s en terminar de spawnear un jugador (confirmado
    // por el proyecto Slobos-AFK-Aternos-Bot, que documenta este mismo comportamiento).
    // Un timeout corto aqui mata conexiones que solo estaban siendo lentas, no rotas.
    checkTimeoutInterval: 600_000,
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
    bot.pathfinder.setMovements(new Movements(bot));
    iniciarHuida(bot);
  });

  // Responde cuando un jugador real escribe en el chat (no reportes del datapack)
  const ultimoContexto = new Map(); // nombre -> ultimo ctx real del datapack

  bot.on('chat', async (username, mensaje) => {
    if (username === BOT_USERNAME) return; // ignora sus propios mensajes
    if (mensaje.includes('[IA_DATA]')) return; // por si acaso, nunca deberia pasar por aqui

    const real = ultimoContexto.get(username) || {};
    try {
      const respuesta = await preguntarIA(OPENROUTER_KEY, {
        nombre: username,
        vida: real.vida ?? 'desconocida',
        cerca_lava: real.cerca_lava ?? 0,
        cerca_borde: real.cerca_borde ?? 0,
        diamantes: real.diamantes ?? 'desconocidos',
        mensajeDirecto: mensaje,
      });
      await manejarRespuesta(bot, { nombre: username }, respuesta);
    } catch (e) {
      console.error('[bot] error respondiendo chat:', e.message);
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
    ultimoContexto.set(ctx.nombre, ctx);

    // El datapack ya filtra cuando reportar (peligro o cada ~15s); aqui solo
    // aplicamos el cooldown para no llamar a la API mas seguido de lo debido.

    const ahora = Date.now();
    const ultima = lastCall.get(ctx.nombre) || 0;
    if (ahora - ultima < COOLDOWN_MS) return;
    lastCall.set(ctx.nombre, ahora);

    try {
      const respuesta = await preguntarIA(OPENROUTER_KEY, ctx);
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
    intentosFallidos++;
    const delay = proximoDelay();
    console.log(`[bot] desconectado, reintentando en ${Math.round(delay / 1000)}s (intento fallido #${intentosFallidos})...`);
    console.log(`[diag] estadisticas totales: ${JSON.stringify(stats)}`);
    setTimeout(crearBot, delay);
  });

  return bot;
}

async function manejarRespuesta(bot, ctx, respuestaCruda) {
  let texto = respuestaCruda;

  const mTrampa = texto.match(/\[TRAMPA:(borde|lava)\]/);
  if (mTrampa) texto = texto.replace(mTrampa[0], '').trim();

  const mIr = texto.match(/\[IR:(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mIr) texto = texto.replace(mIr[0], '').trim();

  const mAtacar = texto.match(/\[ATACAR\]/);
  if (mAtacar) texto = texto.replace(mAtacar[0], '').trim();

  const mCmd = texto.match(/\[CMD:([^\]]+)\]/);
  if (mCmd) texto = texto.replace(mCmd[0], '').trim();

  if (texto) bot.chat(texto);

  if (mTrampa && mTrampa[1] === 'borde') bot.chat('/function ia:trampa_borde');
  if (mTrampa && mTrampa[1] === 'lava') bot.chat('/function ia:trampa_lava');

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
