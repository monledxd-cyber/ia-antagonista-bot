const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // fuerza IPv4 antes que IPv6 en toda la app

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvpPlugin = require('mineflayer-pvp').plugin;
const { autoCrystal } = require('mineflayer-autocrystal');
const { status: statusPing } = require('minecraft-server-util');
const express = require('express');
const { parseFlatSnbt } = require('./snbt');
const { preguntarIA: preguntarIA_real } = require('./openrouter');

// Cola de llamadas al LLM: 1 a la vez, con un minimo entre llamadas. Evita el
// error 402 in_flight_budget_exhausted de OpenRouter (varias llamadas
// simultaneas chocando) y reduce el gasto de tokens. El combate cuerpo a
// cuerpo (atacar/bot.pvp) NO pasa por aqui, asi que esto no frena reflejos.
const COOLDOWN_ENTRE_LLAMADAS_MS = 1_500;
let colaLlamadas = Promise.resolve();
let ultimaLlamadaTs = 0;
// Si OpenRouter falla por configuracion (key o creditos), el bot se quedaba mudo y
// parecia caido. Avisa por chat, como maximo una vez cada 2 minutos.
let ultimoAvisoIA = 0;
function avisarFalloIA(bot, e) {
  const m = /OpenRouter error (\d+)/.exec(e && e.message || '');
  if (!m || Date.now() - ultimoAvisoIA < 120_000) return;
  const motivos = { 401: 'la API key no es valida o expiro', 402: 'la cuenta de OpenRouter no tiene creditos', 404: 'el modelo no existe', 429: 'demasiadas peticiones' };
  if (!motivos[m[1]]) return;
  ultimoAvisoIA = Date.now();
  try { bot.chat(`[aviso tecnico] No puedo pensar: OpenRouter ${m[1]}, ${motivos[m[1]]}.`); } catch (err) { /* ignorar */ }
}
function preguntarIA(...args) {
  const miTurno = colaLlamadas.then(async () => {
    const espera = Math.max(0, COOLDOWN_ENTRE_LLAMADAS_MS - (Date.now() - ultimaLlamadaTs));
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    ultimaLlamadaTs = Date.now();
    return preguntarIA_real(...args);
  });
  colaLlamadas = miTurno.catch(() => {}); // si esta falla, no traba la cola para la siguiente
  return miTurno;
}

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
const ultimaFallaJugador = new Map(); // nombre -> texto describiendo la ultima accion fallida

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

// Estado real del propio bot: vida, hambre, armadura puesta, y si tiene items
// clave (flechas, totem, pearls, comida) -- para que el LLM no pida [USAR:bow]
// o [CRAFTEAR:...] sin tener nada, ni invente que tiene equipo que no tiene.
function obtenerEstadoPropio(bot) {
  try {
    const inv = bot.inventory.items();
    const tiene = (nombre) => inv.some(i => i.name === nombre);
    const cont = (nombre) => inv.filter(i => i.name === nombre).reduce((a, i) => a + i.count, 0);
    const armadura = [5, 6, 7, 8]
      .map(slot => bot.inventory.slots[slot])
      .filter(Boolean).map(i => i.name);
    return {
      vida: bot.health, hambre: bot.food,
      armadura: armadura.length ? armadura.join(',') : 'ninguna',
      flechas: cont('arrow'), tiene_arco: tiene('bow'), tiene_ballesta: tiene('crossbow'),
      totems: cont('totem_of_undying'), pearls: cont('ender_pearl'),
      cristales: cont('end_crystal'), escudo: tiene('shield'),
      comida: inv.filter(i => /bread|apple|beef|porkchop|chicken|carrot|potato|stew|cod|salmon/.test(i.name)).length > 0,
    };
  } catch (e) { return null; }
}

// Distancia (bloques) bajo la cual se considera que un jugador es una amenaza cercana
const DISTANCIA_PELIGRO = 4;
const DURACION_HUIDA_MS = 1500;

function iniciarHuida(bot) {
  // Un solo listener 'end' para todos los timers (varios bot.once('end') superaban el limite de 10 y avisaban de posible leak).
  const intervalos = [];
  bot.once('end', () => intervalos.forEach(clearInterval));
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

    const conEscudo = objetivo.type === 'player' && Array.isArray(objetivo.equipment) &&
      objetivo.equipment.some(it => it && it.name === 'shield');
    if (conEscudo !== preferirHacha) { preferirHacha = conEscudo; equiparArma(bot); }

    // mineflayer-pvp maneja persecucion, timing de golpe y reintentos solo;
    // llamar attack() de nuevo contra el mismo objetivo no reinicia nada.
    bot.pvp.attack(objetivo);
  }

  let objetivoActual = null;
  let huyendoDeTnt = false;
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
  function enemigoCerca(radio) {
    if (!bot.entity) return false;
    return Object.values(bot.entities).some(e =>
      e !== bot.entity && e.position.distanceTo(bot.entity.position) < radio && (
        (e.type === 'player' && e.username !== BOT_USERNAME && e.gameMode !== 'spectator' && e.gameMode !== 'creative') ||
        (e.type === 'mob' && MOBS_HOSTILES.test(e.name || ''))
      )
    );
  }
  const chequeoInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(chequeoInterval); return; }

    // Prioridad maxima: TNT encendida cerca. Es una entidad (primed_tnt),
    // no un bloque -- se detecta igual que un mob. Huye antes que cualquier
    // otra decision de combate.
    const tntCerca = Object.values(bot.entities).find(e =>
      (/tnt/i.test(e.name || '') || /tnt/i.test(e.displayName || '') ||
       (e.kind && /tnt/i.test(e.kind))) &&
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
      huyendoDeTnt = true;
      return;
    } else if (huyendoDeTnt) {
      // La TNT ya no esta (detono o se alejo) -- limpiamos el goal de huida
      // para que el bot no quede plantado en el ultimo punto al que corria.
      huyendoDeTnt = false;
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
    }
    const jugadoresCercanos = Object.values(bot.entities).filter(e =>
      e.type === 'player' && e.username !== BOT_USERNAME &&
      e.gameMode !== 'spectator' && e.gameMode !== 'creative' &&
      e.position.distanceTo(bot.entity.position) < RANGO_VIGILANCIA
    );
    const mobsCercanos = Object.values(bot.entities).filter(e =>
      e.type === 'mob' && MOBS_HOSTILES.test(e.name || '') &&
      e.position.distanceTo(bot.entity.position) < 8
    );
    // Prioridad real por cercania efectiva: un mob pegado al bot no se ignora
    // solo porque haya un jugador lejano en rango -- pero si un jugador esta
    // en rango de ataque directo (3 bloques), ese gana siempre (desprecio a
    // los humanos por sobre los mobs, salvo amenaza inmediata).
    const jugadorEnAtaque = jugadoresCercanos.find(j => j.position.distanceTo(bot.entity.position) < 3);
    let objetivo = jugadorEnAtaque;
    if (!objetivo) {
      const candidatos = [...jugadoresCercanos, ...mobsCercanos];
      objetivo = candidatos.sort((a, b) =>
        a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
      )[0];
    }

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

  intervalos.push(chequeoInterval);

  // Esquiva de proyectiles: chequeo rapido (200ms, no 1000ms) porque una
  // flecha cruza el espacio mucho mas rapido que el ciclo de combate normal.
  // Si una flecha esta cerca y se acerca (no alejandose), hace un strafe
  // lateral corto -- no cancela lo que estaba haciendo, solo da un paso.
  let ultimoStrafeTs = 0;
  const esquivaInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(esquivaInterval); return; }
    if (Date.now() - ultimoStrafeTs < 600) return; // cooldown corto entre esquivas
    // Anti-mace: un jugador con mace por encima y a menos de 4 bloques en horizontal
    // viene a caer sobre el bot. Sale de su columna de caida y alza el escudo.
    const maceAerea = Object.values(bot.entities).find(e =>
      e.type === 'player' && e.username !== BOT_USERNAME && Array.isArray(e.equipment) &&
      e.equipment.some(it => it && it.name === 'mace') &&
      e.position.y - bot.entity.position.y >= 1.5 &&
      Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z) < 4 &&
      e.position.distanceTo(bot.entity.position) < 9
    );
    if (maceAerea) {
      ultimoStrafeTs = Date.now();
      try {
        const dx = bot.entity.position.x - maceAerea.position.x;
        const dz = bot.entity.position.z - maceAerea.position.z;
        const r = Math.hypot(dx, dz) || 1;
        const signo = Math.random() < 0.5 ? 1 : -1;
        const px = bot.entity.position.x + (-dz / r) * 4 * signo + (dx / r) * 2;
        const pz = bot.entity.position.z + (dx / r) * 4 * signo + (dz / r) * 2;
        bot.pathfinder.setGoal(new goals.GoalNear(px, bot.entity.position.y, pz, 1));
        objetivoActual = null; // al terminar, el chequeo principal vuelve a perseguir
        const offhand = bot.inventory.slots[45];
        if (offhand && offhand.name === 'shield') { bot.activateItem(true); setTimeout(() => bot.deactivateItem(), 700); }
      } catch (e) { /* ignorar */ }
      return;
    }
    const flecha = Object.values(bot.entities).find(e =>
      e.name === 'arrow' && e.velocity &&
      e.position.distanceTo(bot.entity.position) < 6 &&
      e.position.plus(e.velocity).distanceTo(bot.entity.position) < e.position.distanceTo(bot.entity.position)
    );
    if (!flecha) return;
    ultimoStrafeTs = Date.now();
    try {
      const lado = Math.random() < 0.5 ? 'left' : 'right';
      bot.setControlState(lado, true);
      setTimeout(() => bot.setControlState(lado, false), 300);
    } catch (e) { /* ignorar */ }
  }, 200);
  intervalos.push(esquivaInterval);

  // Re-equipar cada 10s por si consigue armadura/espada nueva durante la partida
  // (ej. la mina, o la saca de un cofre via CMD).
  const equipoInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(equipoInterval); return; }
    equiparAutomatico(bot);
  }, 10_000);
  intervalos.push(equipoInterval);

  // Auto-comer: si el hambre baja de 14/20, come lo mas nutritivo que tenga.
  // No gasta manzanas doradas ni comida mala, y no se pone a comer en medio
  // de una pelea (salvo hambre critica).
  const comidaInterval = setInterval(async () => {
    if (!bot.entity) { clearInterval(comidaInterval); return; }
    if (bot.food === undefined || bot.food >= 14) return;
    if (bot.food > 6 && enemigoCerca(6)) return;
    await comerAlgo(bot, null);
  }, 5_000);
  intervalos.push(comidaInterval);

  // Manzana dorada de emergencia: vida <= 8 y sin totem que lo salve, se cura
  // como lo haria un jugador real (si hay enemigo encima, solo con vida <= 5).
  const gappleInterval = setInterval(async () => {
    if (!bot.entity) { clearInterval(gappleInterval); return; }
    if (bot.health === undefined || bot.health > 8) return;
    if (enemigoCerca(4) && bot.health > 5) return;
    const dorada = bot.inventory.items().find(i => i.name === 'golden_apple' || i.name === 'enchanted_golden_apple');
    if (dorada) await comerAlgo(bot, dorada);
  }, 2_500);
  intervalos.push(gappleInterval);

  // Mejora de equipo craftenando: si tiene materiales para una pieza de mejor
  // tier que la que posee y hay una mesa de trabajo a la vista, la fabrica.
  // Solo con la zona tranquila (sin enemigos cerca) y vida razonable.
  const mejoraInterval = setInterval(() => {
    if (!bot.entity) { clearInterval(mejoraInterval); return; }
    if (enemigoCerca(14) || (bot.health !== undefined && bot.health <= 10)) return;
    mejorarEquipoCrafteando(bot).catch(() => {});
  }, 30_000);
  intervalos.push(mejoraInterval);

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
  intervalos.push(totemInterval);
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

  // Vigilante de conexion zombi: sin checkTimeoutInterval (quitado a proposito), un
  // socket muerto (ej. Aternos apaga el server sin cerrar la conexion) dejaba al bot
  // "conectado" para siempre, mudo y sin recibir chat ni llamar a la IA. El servidor
  // manda keep-alive cada ~15 s; si pasan 75 s sin NINGUN paquete, se reconecta.
  bot.once('login', () => {
    let ultimoPaquete = Date.now();
    bot._client.on('packet', () => { ultimoPaquete = Date.now(); });
    const vigilante = setInterval(() => {
      if (Date.now() - ultimoPaquete < 75_000) return;
      console.log('[bot] 75 s sin paquetes del servidor (conexion zombi), reconectando');
      registrarFallo('conexion_zombi');
      try { bot.end(); } catch (e) { /* ignorar */ }
    }, 15_000);
    bot.once('end', () => clearInterval(vigilante));
  });

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
      const PROB_HABLAR = 0.5; // 50% de veces se queda callado ese ciclo, para no sentirse mecanico
      const habladorInterval = setInterval(async () => {
        if (!bot.entity) return;
        if (Math.random() > PROB_HABLAR) return; // se salta este turno, silencio deliberado
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
            x: real.x ?? candidato.position.x, y: real.y ?? candidato.position.y, z: real.z ?? candidato.position.z,
            inventario: real.inventario,
            cerca_lava: 0, cerca_borde: 0, diamantes: real.diamantes ?? 'desconocidos',
            interacciones: hist.interacciones,
            ultimasRespuestas: hist.ultimasRespuestas,
            eventosRecientes: formatearEventos(candidato.username),
            estadoPropio: obtenerEstadoPropio(bot),
            ultimaFalla: (() => { const f = ultimaFallaJugador.get(candidato.username); if (f) ultimaFallaJugador.delete(candidato.username); return f; })(),
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
        inventario: real.inventario,
        dimension: real.dimension,
        hora_dia: real.hora_dia,
        mobs_cerca: real.mobs_cerca ?? [],
        x: real.x ?? bot.players[username]?.entity?.position?.x,
        y: real.y ?? bot.players[username]?.entity?.position?.y,
        z: real.z ?? bot.players[username]?.entity?.position?.z,
        mensajeDirecto: mensaje,
        interacciones: hist.interacciones,
        ultimasRespuestas: hist.ultimasRespuestas,
        bloqueEnfrente: obtenerBloqueEnfrente(bot),
        eventosRecientes: formatearEventos(username),
        estadoPropio: obtenerEstadoPropio(bot),
        ultimaFalla: (() => { const f = ultimaFallaJugador.get(username); if (f) ultimaFallaJugador.delete(username); return f; })(),
      });
      registrarRespuesta(username, respuesta);
      await manejarRespuesta(bot, { nombre: username }, respuesta);
    } catch (e) {
      console.error('[bot] error respondiendo chat:', e.message, e.stack);
      avisarFalloIA(bot, e);
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
      const falla = ultimaFallaJugador.get(ctx.nombre);
      if (falla) ultimaFallaJugador.delete(ctx.nombre);
      const respuesta = await preguntarIA(OPENROUTER_KEY, { ...ctx, interacciones: hist.interacciones, ultimasRespuestas: hist.ultimasRespuestas, eventosRecientes: formatearEventos(ctx.nombre), bloqueEnfrente: obtenerBloqueEnfrente(bot), estadoPropio: obtenerEstadoPropio(bot), ultimaFalla: falla });
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

// Orden de tier material, de peor a mejor. Se usa para que el bot no se
// quede con lo primero que encuentre en el inventario (ej. espada de madera)
// si tiene algo mejor (ej. espada de diamante) -- un jugador real de survival
// siempre usa su mejor equipo disponible, no el primero del inventario.
// Verificado contra minecraft-data real: los prefijos son "wooden_"/"golden_"
// (no "wood_"/"gold_"), y el oro queda entre leather y chainmail en poder
// de armadura real, pero como arma/herramienta el oro es el peor material
// util -- se deja en una posicion razonable para ambos casos sin over-fit.
const ORDEN_TIER = ['leather', 'wooden', 'golden', 'chainmail', 'stone', 'iron', 'diamond', 'netherite'];
function tierDe(nombreItem) {
  for (let i = 0; i < ORDEN_TIER.length; i++) {
    if (nombreItem.startsWith(ORDEN_TIER[i] + '_')) return i;
  }
  return -1;
}

// ---- Supervivencia: comer, craftear con mesa, herramienta correcta ----
const NO_COMER = /^(golden_apple|enchanted_golden_apple|suspicious_stew|pufferfish|poisonous_potato|rotten_flesh|spider_eye|chorus_fruit|chicken)$/;
let comiendo = false;
async function comerAlgo(bot, item) {
  if (comiendo) return;
  comiendo = true;
  try {
    let comida = item;
    if (!comida) {
      const foods = bot.registry.foodsByName || {};
      comida = bot.inventory.items()
        .filter(i => foods[i.name] && !NO_COMER.test(i.name))
        .sort((a, b) => foods[b.name].foodPoints - foods[a.name].foodPoints)[0];
    }
    if (!comida) return;
    await bot.equip(comida, 'hand');
    await bot.consume();
  } catch (e) { /* interrumpido, no es critico */ }
  finally {
    comiendo = false;
    equiparAutomatico(bot); // vuelve a empunar la mejor espada
  }
}

function irCerca(bot, pos, ms = 12000) {
  return new Promise(resolve => {
    let hecho = false;
    const fin = (v) => {
      if (hecho) return;
      hecho = true; clearTimeout(t);
      try { bot.pathfinder.setGoal(null); } catch (e) { /* ignorar */ }
      resolve(v);
    };
    const t = setTimeout(() => fin(false), ms);
    bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2)).then(() => fin(true), () => fin(false));
  });
}

// Craftea un item. Las recetas 3x3 (espadas, picos, armaduras) NECESITAN una
// mesa de trabajo: la busca en 24 bloques y camina hasta ella si hace falta.
async function craftearConMesa(bot, nombre) {
  const mcData = require('minecraft-data')(bot.version);
  const item = mcData.itemsByName[nombre];
  if (!item) return { ok: false, motivo: 'ese item no existe' };
  const mesa = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 24 });
  const receta = bot.recipesFor(item.id, null, 1, mesa || null)[0];
  if (!receta) return { ok: false, motivo: mesa ? 'faltan materiales' : 'faltan materiales o no hay mesa de trabajo a 24 bloques' };
  if (receta.requiresTable && mesa.position.distanceTo(bot.entity.position) > 3.5) {
    if (!(await irCerca(bot, mesa.position))) return { ok: false, motivo: 'no pudo llegar a la mesa de trabajo' };
  }
  await bot.craft(receta, 1, receta.requiresTable ? mesa : null);
  return { ok: true };
}

const PIEZAS_CRAFT = [
  { p: 'sword', slot: null, tiers: ['wooden', 'stone', 'iron', 'diamond'] },
  { p: 'pickaxe', slot: null, tiers: ['wooden', 'stone', 'iron', 'diamond'] },
  { p: 'axe', slot: null, tiers: ['wooden', 'stone', 'iron', 'diamond'] },
  { p: 'shovel', slot: null, tiers: ['wooden', 'stone', 'iron', 'diamond'] },
  { p: 'helmet', slot: 5, tiers: ['iron', 'diamond'] },
  { p: 'chestplate', slot: 6, tiers: ['iron', 'diamond'] },
  { p: 'leggings', slot: 7, tiers: ['iron', 'diamond'] },
  { p: 'boots', slot: 8, tiers: ['iron', 'diamond'] },
];
let crafteandoMejora = false;
async function mejorarEquipoCrafteando(bot) {
  if (crafteandoMejora) return;
  crafteandoMejora = true;
  try {
    for (const { p, slot, tiers } of PIEZAS_CRAFT) {
      let poseido = -1;
      for (const i of bot.inventory.items()) if (i.name.endsWith('_' + p)) poseido = Math.max(poseido, tierDe(i.name));
      const puesto = slot !== null ? bot.inventory.slots[slot] : null;
      if (puesto && puesto.name.endsWith('_' + p)) poseido = Math.max(poseido, tierDe(puesto.name));
      for (const t of [...tiers].reverse()) {
        const nombre = `${t}_${p}`;
        if (tierDe(nombre) <= poseido) break;
        const r = await craftearConMesa(bot, nombre);
        if (r.ok) {
          console.log(`[bot] mejoro su equipo crafteando ${nombre}`);
          equiparAutomatico(bot);
          return; // una mejora por ciclo
        }
      }
    }
  } finally { crafteandoMejora = false; }
}

// Antes de minar, empuna la herramienta que mas rapido rompe ese bloque
// (no pica piedra con el puño ni con la espada).
async function equiparMejorHerramienta(bot, bloque) {
  let mejor = null;
  let mejorT = bloque.digTime(null, false, false, false);
  for (const it of bot.inventory.items()) {
    const t = bloque.digTime(it.type, false, false, false);
    if (t < mejorT) { mejorT = t; mejor = it; }
  }
  if (mejor && !(bot.heldItem && bot.heldItem.type === mejor.type)) await bot.equip(mejor, 'hand');
}

// Arma cuerpo a cuerpo: espada por defecto; hacha contra jugadores con escudo
// (un golpe de hacha lo inutiliza 5 s, segun la wiki de Minecraft). Si no tiene
// ninguna, usa pico/pala/hacha en vez del puño. Nunca cambia a media mineria/comida.
let preferirHacha = false;
let manoOcupada = false;
function equiparArma(bot) {
  if (manoOcupada || comiendo) return;
  const items = bot.inventory.items();
  const mejor = (re) => items.filter(i => re.test(i.name)).sort((a, b) => tierDe(b.name) - tierDe(a.name))[0];
  const espada = mejor(/_sword$/), hacha = mejor(/_axe$/);
  const elegida = (preferirHacha ? (hacha || espada) : (espada || hacha)) || items.find(i => i.name === 'mace') || mejor(/_(pickaxe|shovel)$/);
  if (!elegida || (bot.heldItem && bot.heldItem.name === elegida.name)) return;
  bot.equip(elegida, 'hand').catch(() => {});
}

// Recolecta N bloques de un tipo (solo materiales naturales, para no desmontar
// construcciones): va hasta el bloque y lo rompe con la herramienta correcta.
const RECOLECTABLE = /(_log$|_ore$|^stone$|^cobblestone$|^dirt$|^sand$|^gravel$|^netherrack$|_leaves$|^clay$)/;
async function recolectarBloque(bot, nombre, cantidad = 1) {
  const def = require('minecraft-data')(bot.version).blocksByName[nombre];
  if (!def) return { ok: false, motivo: 'ese bloque no existe' };
  if (!RECOLECTABLE.test(nombre)) return { ok: false, motivo: 'solo recolectas materiales naturales (troncos, piedra, menas, tierra...)' };
  let n = 0;
  manoOcupada = true;
  try {
    for (let k = 0; k < Math.min(cantidad, 16); k++) {
      const b = bot.findBlock({ matching: def.id, maxDistance: 24 });
      if (!b) return { ok: n > 0, motivo: 'no hay mas ' + nombre + ' a 24 bloques' };
      if (!(await irCerca(bot, b.position, 15000))) return { ok: n > 0, motivo: 'no pudo llegar hasta el bloque' };
      const bloque = bot.blockAt(b.position);
      if (!bloque || !bot.canDigBlock(bloque)) return { ok: n > 0, motivo: 'no alcanzo el bloque' };
      try { await equiparMejorHerramienta(bot, bloque); } catch (e) { /* sigue con lo que tenga */ }
      await bot.dig(bloque);
      n++;
    }
    return { ok: true };
  } finally { manoOcupada = false; }
}

// Smash con mace (wiki): al caer >= 1.5 bloques el golpe hace 12 de dano base
// +4 por cada uno de los 3 primeros bloques, +2 los 5 siguientes, +1 despues, y
// anula el dano de caida si conecta. Sin elytra, el impulso viene de un wind charge
// lanzado a los pies. Si falla, el bot se come la caida: por eso exige vida >= 14.
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
let ultimoSmash = 0;
async function smashAttack(bot) {
  if (Date.now() - ultimoSmash < 25_000) return { ok: false, motivo: 'smash en enfriamiento' };
  const inv = bot.inventory.items();
  const maza = inv.find(i => i.name === 'mace');
  const carga = inv.find(i => i.name === 'wind_charge');
  if (!maza) return { ok: false, motivo: 'no tenias mace' };
  if (!carga) return { ok: false, motivo: 'no tenias wind_charge para impulsarte' };
  if (bot.health < 14) return { ok: false, motivo: 'poca vida para arriesgar la caida' };
  const objetivo = Object.values(bot.entities).find(e =>
    e.type === 'player' && e.username !== BOT_USERNAME &&
    e.gameMode !== 'creative' && e.gameMode !== 'spectator' &&
    e.position.distanceTo(bot.entity.position) < 8
  );
  if (!objetivo) return { ok: false, motivo: 'no habia jugador a menos de 8 bloques' };
  ultimoSmash = Date.now();
  manoOcupada = true;
  try {
    await bot.equip(carga, 'hand');
    await bot.look(bot.entity.yaw, -Math.PI / 2, true); // -pi/2 = mirar al suelo
    bot.activateItem();
    let impulsado = false;
    for (let t = 0; t < 8 && !impulsado; t++) { await dormir(100); impulsado = bot.entity.velocity.y > 0.6; }
    if (!impulsado) return { ok: false, motivo: 'el wind charge no lo impulso' };
    await bot.equip(maza, 'hand');
    let pico = bot.entity.position.y;
    for (let t = 0; t < 40; t++) { // maximo 4 s en el aire
      await dormir(100);
      if (!bot.entities[objetivo.id]) break;
      pico = Math.max(pico, bot.entity.position.y);
      const p = bot.entity.position, o = objetivo.position;
      bot.lookAt(o.offset(0, objetivo.height ? objetivo.height / 2 : 0.9, 0), true).catch(() => {});
      bot.setControlState('forward', Math.hypot(o.x - p.x, o.z - p.z) > 1.5);
      if (bot.entity.velocity.y < -0.1 && pico - p.y >= 1.6 && p.distanceTo(o) < 3.5) { bot.attack(objetivo); return { ok: true }; }
      if (bot.entity.onGround && t > 5) break;
    }
    return { ok: false, motivo: 'cayo sin alcanzar al jugador' };
  } finally { bot.setControlState('forward', false); manoOcupada = false; }
}

function equiparAutomatico(bot) {
  equiparArma(bot);
  try {
    const piezas = [
      { match: /helmet$/, dest: 'head' },
      { match: /chestplate$/, dest: 'torso' },
      { match: /leggings$/, dest: 'legs' },
      { match: /boots$/, dest: 'feet' },
    ];
    for (const p of piezas) {
      // De todo lo que calce en este slot, se queda con el de mejor tier,
      // no con el primero que encuentre -- asi mejora su equipo solo,
      // sin esperar a que la IA lo pida explicitamente.
      const candidatos = bot.inventory.items().filter(i => p.match.test(i.name));
      if (candidatos.length === 0) continue;
      candidatos.sort((a, b) => tierDe(b.name) - tierDe(a.name));
      const mejor = candidatos[0];
      const yaEquipado = p.dest === 'hand'
        ? bot.heldItem
        : bot.inventory.slots[{ head: 5, torso: 6, legs: 7, feet: 8 }[p.dest]];
      if (yaEquipado && yaEquipado.name === mejor.name) continue; // ya tiene lo mejor puesto
      if (yaEquipado && p.dest !== 'hand' && tierDe(yaEquipado.name) >= tierDe(mejor.name)) continue;
      bot.equip(mejor, p.dest).catch(() => {});
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

  const mUsar = texto.match(/\[USAR:(ender_pearl|wind_charge|golden_apple|enchanted_golden_apple|trident|bow|crossbow)\]/);
  if (mUsar) texto = texto.replace(mUsar[0], '').trim();

  const mArma = texto.match(/\[ARMA:([a-z_:]+)\]/);
  if (mArma) texto = texto.replace(mArma[0], '').trim();

  const mCrystal = texto.match(/\[CRYSTALPVP\]/);
  if (mCrystal) texto = texto.replace(mCrystal[0], '').trim();

  const mCraft = texto.match(/\[CRAFTEAR:([a-z_:]+)\]/);
  if (mCraft) texto = texto.replace(mCraft[0], '').trim();

  const mSmash = texto.match(/\[SMASH\]/);
  if (mSmash) texto = texto.replace(mSmash[0], '').trim();

  const mRecol = texto.match(/\[RECOLECTAR:([a-z_]+)(?::(\d+))?\]/);
  if (mRecol) texto = texto.replace(mRecol[0], '').trim();

  const mConstruir = texto.match(/\[CONSTRUIR:([a-z_:]+):(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mConstruir) texto = texto.replace(mConstruir[0], '').trim();

  const mMinar = texto.match(/\[MINAR:(-?\d+),(-?\d+),(-?\d+)\]/);
  if (mMinar) texto = texto.replace(mMinar[0], '').trim();

  const mDatapack = texto.match(/\[DATAPACK:([a-z_]+):([^\]]+)\]/);
  if (mDatapack) texto = texto.replace(mDatapack[0], '').trim();

  const mCmd = texto.match(/\[CMD:((?:[^\[\]]|\[[^\]]*\])+)\]/);
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
      e.gameMode !== 'creative' && e.gameMode !== 'spectator' &&
      bot.entity && e.position.distanceTo(bot.entity.position) < 4
    );
    if (objetivo && bot.entities[objetivo.id]) {
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
        const esArma_distancia = mUsar[1] === 'bow' || mUsar[1] === 'crossbow';
        if (esArma_distancia) {
          const objetivo = Object.values(bot.entities).find(e =>
            e.type === 'player' && e.username !== BOT_USERNAME &&
            bot.entity && e.position.distanceTo(bot.entity.position) < 25
          );
          if (objetivo) {
            // Apunta con adelanto usando la velocidad real del objetivo: una
            // flecha de arco tarda ~0.5-1s en llegar segun la distancia, asi
            // que estima donde estara, no solo donde esta ahora.
            const dist = objetivo.position.distanceTo(bot.entity.position);
            const tiempoVuelo = dist / 20; // aproximacion simple de velocidad de flecha
            const posEstimada = objetivo.velocity
              ? objetivo.position.plus(objetivo.velocity.scaled(tiempoVuelo * 20))
              : objetivo.position;
            bot.lookAt(posEstimada.offset(0, objetivo.height ? objetivo.height / 2 : 0.9, 0), true);
          }
          bot.activateItem();
          setTimeout(() => bot.deactivateItem(), mUsar[1] === 'bow' ? 1000 : 1300); // tiempo real de carga
        } else {
          bot.activateItem(); // manzanas/tridente/ender pearl se usan de un golpe
        }
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
        bot.autoCrystal.enable(); // sincrona, no devuelve promesa
        setTimeout(() => { try { bot.autoCrystal.disable(); } catch (e) { /* ignorar */ } }, 10_000);
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
        ultimaFallaJugador.set(ctx.nombre, `CONSTRUIR:${materialNombre} fallo, no tenias ese material`);
      }
    } catch (e) {
      console.error('[bot] error construyendo:', e.message);
      ultimaFallaJugador.set(ctx.nombre, `CONSTRUIR fallo: ${e.message}`);
    }
  }

  if (mMinar) {
    try {
      const [, x, y, z] = mMinar;
      const pos = new (require('vec3').Vec3)(Number(x), Number(y), Number(z));
      const bloque = bot.blockAt(pos);
      if (bloque && bloque.name !== 'air' && bot.canDigBlock(bloque)) {
        manoOcupada = true;
        try {
          try { await equiparMejorHerramienta(bot, bloque); } catch (e) { /* sigue con lo que tenga */ }
          await bot.dig(bloque);
        } finally { manoOcupada = false; }
      } else {
        console.log(`[bot] no puede minar ese bloque (inexistente, aire, o irrompible)`);
        ultimaFallaJugador.set(ctx.nombre, 'MINAR fallo, esa posicion no tenia un bloque minable');
      }
    } catch (e) {
      console.error('[bot] error minando:', e.message);
      ultimaFallaJugador.set(ctx.nombre, `MINAR fallo: ${e.message}`);
    }
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
      const r = await craftearConMesa(bot, mCraft[1]);
      if (r.ok) equiparAutomatico(bot);
      else {
        console.log(`[bot] no pudo craftear ${mCraft[1]}: ${r.motivo}`);
        ultimaFallaJugador.set(ctx.nombre, `CRAFTEAR:${mCraft[1]} fallo, ${r.motivo}`);
      }
    } catch (e) {
      console.error('[bot] error crafteando:', e.message);
      ultimaFallaJugador.set(ctx.nombre, `CRAFTEAR:${mCraft[1]} fallo: ${e.message}`);
    }
  }

  if (mSmash) {
    try {
      const r = await smashAttack(bot);
      if (!r.ok) ultimaFallaJugador.set(ctx.nombre, `SMASH fallo, ${r.motivo}`);
    } catch (e) {
      console.error('[bot] error en smash:', e.message);
      ultimaFallaJugador.set(ctx.nombre, `SMASH fallo: ${e.message}`);
    }
  }

  if (mRecol) {
    try {
      const r = await recolectarBloque(bot, mRecol[1], Number(mRecol[2]) || 1);
      if (!r.ok) ultimaFallaJugador.set(ctx.nombre, `RECOLECTAR:${mRecol[1]} fallo, ${r.motivo}`);
    } catch (e) {
      console.error('[bot] error recolectando:', e.message);
      ultimaFallaJugador.set(ctx.nombre, `RECOLECTAR:${mRecol[1]} fallo: ${e.message}`);
    }
  }

  if (mCmd) {
    const comando = mCmd[1].trim();
    // Se revisa cualquier parte del comando (no solo el inicio): "execute ... run op x"
    // se saltaba la lista vieja. Tambien bloquea lo letal/destructivo: las trampas
    // son para esquivar, no para matar ni borrar el inventario.
    const peligroso = /(^|\s|run\s)(stop|ban|ban-ip|pardon|kick|whitelist|op|deop|save-off|save-on|difficulty|gamerule|worldborder|kill|damage|clear|reload|datapack\s+disable|data\s+remove|forceload|setworldspawn)(\s|$)/i.test(comando)
      || /instant_damage|wither|poison/i.test(comando) || comando.length > 200;
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
process.on('unhandledRejection', (e) => console.error('[proc] promesa rechazada sin manejar:', e && e.message ? e.message : e));
// Nombre de version visible: 'v.X.YYY.ZZ sividi toile' (chiste de DeX; quitarlo solo si el lo pide).
// package.json conserva semver puro, que npm exige.
const BOT_VERSION = `v.${require('./package.json').version} sividi toile`;
app.get('/health', (_req, res) => res.json({ status: 'ok', version: BOT_VERSION, uptime: process.uptime(), diagnostico: stats }));
app.listen(process.env.PORT || 3000, () => console.log(`[http] servidor de salud escuchando (${BOT_VERSION})`));

crearBot();
