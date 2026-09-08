const mineflayer = require('mineflayer');
const express = require('express');
const { parseFlatSnbt } = require('./snbt');
const { preguntarIA } = require('./openrouter');

// ---- Config por variables de entorno (se configuran en Render) ----
const HOST = process.env.MC_HOST;              // ej: tuserver.aternos.me
const PORT = parseInt(process.env.MC_PORT || '25565', 10);
const BOT_USERNAME = process.env.MC_BOT_USERNAME || 'IA_Vigilante';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const VERSION = process.env.MC_VERSION || '1.21.4';

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

function crearBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    version: VERSION,
    auth: 'offline', // server cracked / offline-mode
  });

  bot.on('login', () => {
    console.log(`[bot] conectado a ${HOST}:${PORT} como ${BOT_USERNAME}`);
  });

  bot.on('spawn', () => {
    bot.chat('La vigilancia ha comenzado.');
    console.log('[bot] Recordatorio: para que las trampas (/function) funcionen, ' +
      `dale OP a "${BOT_USERNAME}" desde la consola de Aternos: /op ${BOT_USERNAME}`);
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
  bot.on('error', (err) => console.log('[bot] error de conexion:', err.message));
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
