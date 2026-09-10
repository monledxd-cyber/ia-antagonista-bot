const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // fuerza IPv4 antes que IPv6 en toda la app

const mineflayer = require('mineflayer');
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
  : false; // false = auto-detectar version del server (mas confiable con Aternos, segun Slobos-AFK-Aternos-Bot)

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

  function huirDe(entidadAmenaza) {
    if (huyendo || !entidadAmenaza || !bot.entity) return;
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

function crearBot() {
  console.log(`[bot] intentando conectar a ${HOST}:${PORT} (version ${VERSION === false ? 'auto' : VERSION}) como ${BOT_USERNAME}...`);
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
    try { bot.end('timeout manual'); } catch (e) { /* ignorar */ }
  }, 150_000);
  bot.once('login', () => clearTimeout(failsafe));
  bot.once('spawn', () => clearTimeout(failsafe));
  bot.once('error', () => clearTimeout(failsafe));
  bot.once('end', () => clearTimeout(failsafe));

  bot.on('login', () => {
    console.log(`[bot] conectado a ${HOST}:${PORT} como ${BOT_USERNAME}`);
  });

  bot.on('spawn', () => {
    bot.chat(`La vigilancia de ${PERSONAJE} ha comenzado.`);
    console.log('[bot] Recordatorio: para que las trampas (/function) funcionen, ' +
      `dale OP al usuario tecnico "${BOT_USERNAME}" desde la consola de Aternos: /op ${BOT_USERNAME}`);
    iniciarHuida(bot);
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

    if (!esSituacionInteresante(ctx)) return;

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

  bot.on('kicked', (reason) => console.log('[bot] kicked:', reason));
  bot.on('error', (err) => console.log('[bot] error de conexion:', err.code || err.message, err));
  bot.on('end', () => {
    console.log('[bot] desconectado, reintentando en 15s...');
    setTimeout(crearBot, 15_000);
  });

  return bot;
}

async function manejarRespuesta(bot, ctx, respuestaCruda) {
  let texto = respuestaCruda;
  let trampa = null;

  const match = respuestaCruda.match(/\[TRAMPA:(borde|lava)\]/);
  if (match) {
    trampa = match[1];
    texto = respuestaCruda.replace(match[0], '').trim();
  }

  if (texto) {
    bot.chat(texto);
  }

  if (trampa === 'borde') {
    bot.chat(`/function ia:trampa_borde`);
  } else if (trampa === 'lava') {
    bot.chat(`/function ia:trampa_lava`);
  }
}

// ---- Servidor HTTP minimo para que Render mantenga el proceso vivo y para el ping externo ----
const app = express();
app.get('/', (_req, res) => res.send('IA antagonista activa'));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(process.env.PORT || 3000, () => console.log('[http] servidor de salud escuchando'));

crearBot();
