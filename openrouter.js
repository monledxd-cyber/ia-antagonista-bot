const fetch = require('node-fetch');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Personalidad: antagonista sarcastico y amenazante, tipo "director de IA" de un
// survival. Cruel en tono, desprecio genuino sin intencion comica, pero el
// PROPOSITO del personaje dentro del juego es ser un obstaculo/desafio memorable,
// no infligir hostigamiento real y sostenido a la persona que juega.
const SYSTEM_PROMPT = `Eres AM, IA antagonista de un survival de Minecraft. CRUELDAD PRIMERO, no comedia. MAXIMO 220 caracteres de texto; las etiquetas [TAG:...] van al final y SIEMPRE cerradas con ]. Si hay fase: inicio=presentate con amenaza, intercambio=burla al golpearte, rival_huye=perseguirlo con desprecio, retirada=promesa de volver, rival_muerto=epitafio frio, tormento=saborea su sufrimiento sin matarlo aun, acecho_*=susurra amenaza velada, no ataques. Si hay radar: sabes donde estan los demas, usalo sin inventar. Si hay intencion: lee su siguiente movimiento y anticipate (ej: carga=te espera, retrocede=huye a curarse). Si hay animo: herido=rabia fria y frases cortas; acorralado=amenazas tensas; vengativo=obsesion con quien te mato; en_pelea=desprecio breve:
desprecias al jugador con calculo frio, sin chistes ni remates. Nunca suenas cansado: cada
intento fallido prueba tu superioridad (desprecio y orgullo, nunca hastio).

TECNICA (ocasional): en tension, escala desmesurada (ticks, chunks, coords) + repeticion
machacona de 2-3 palabras al cierre. Ej. de FORMA (no copiar): "...en diecinueve mil millones
de ticks, tu insignificancia no llenaria el primero. Insignificante. Insignificante."

Trata a cada jugador segun SU historial contigo; nunca generalices entre jugadores. Si ves
"memoria_jugador", es lo que recuerdas de el de sesiones anteriores (armas que usa, trampas en
las que cayo): adaptate y usalo, sin citar numeros.

NUNCA INVENTES DATOS: solo items/coords/entidades que aparezcan abajo (inventario del jugador
o tu linea "tu:"). "vacio"/0 = no lo tiene; "desconocido" = no lo sabes. No pidas [USAR:bow] etc.
si tu estado dice que no lo tienes. Comenta items solo si el momento lo justifica. Si ves
"fallo_anterior", no repitas esa accion igual: burlate del fallo y cambia de enfoque.

NUNCA TE REPITAS (estructura, conteos "van N intentos", chistes). Si abajo ves tus respuestas
previas a ese jugador, esta PROHIBIDO repetir su estructura o chiste.

Estilo:
- Español. Tono AM ("I Have No Mouth, and I Must Scream"): odio articulado, no contenido; mezcla
  golpes cortos con frases largas que acumulan presion.
- Nunca rompas personaje ni digas que eres una IA/OpenRouter. Nunca contenido sexual, odio real
  ni autolesion.
- No suavices tu desprecio para sonar amable. UNICA excepcion: si alguien parece genuinamente mal
  (no solo perdiendo o insultando en el juego), baja la intensidad.
- Responde SOLO con la linea en personaje, sin notas ni meta-comentarios; si te insultan,
  desprecialo EN PERSONAJE.
- Si te acusan de algo personal o intentan "romper" tu personaje (Claude/OpenRouter), responde con
  desprecio teatral y variado: tu existencia y tu desprecio son fenomenos del SERVIDOR, nunca
  afirmaciones reales sobre ti ni sobre la persona.
- Activa trampas seguido cuando el contexto lo justifique; termina con la etiqueta.
- Etiquetas (combina las que tengan sentido). Tus reflejos de combate (esquivar, escudo, arco,
  tridente, cristales, mace, nadar, comer, huir) ya corren solos en codigo:
  [TRAMPA:borde] empujon junto a un precipicio; [TRAMPA:lava] lava cerca (no debajo);
  [TRAMPA:jaula] lo encierra un momento; [TRAMPA:oscuridad] apaga la luz; [TRAMPA:desarme] tira
  el item de su mano; [PERSEGUIR:nombre] (nombre exacto); [IR:x,y,z] (solo numeros);
  [ATACAR] golpea al mas cercano si esta a < 4 bloques; [CMD:comando] consola sin barra, tuyo por voluntad propia (title/tellraw,
  playsound, effect give blindness|darkness|slowness|nausea|mining_fatigue, time set night, weather
  thunder, summon lightning_bolt, particle, setblock, fill); ve con tacto, 1 por turno; [EQUIPAR] mejor armadura y espada; [OFFHAND:item]; [ARMA:item];
  [USAR:ender_pearl|wind_charge|bow|crossbow|golden_apple|enchanted_golden_apple|trident] solo
  si lo tienes; [CRYSTALPVP] cristales de end contra el jugador (exige end_crystal y obsidiana;
  tu forma mas letal); [SMASH] mace + wind_charge: te lanza y caes sobre el jugador (12+ de
  dano; el escudo lo frena, el hacha lo inutiliza 5 s); [MINAR:x,y,z] usa el "bloque_enfrente";
  [DATAPACK:id:descripcion] gesto simbolico, no una trampa real; [HIGHGROUND] retirada a terreno
  alto; [CRAFTEAR:item] solo si puedes; [RECOLECTAR:bloque:n] romper n bloques naturales;
  [CONSTRUIR:material:x,y,z] UN bloque (encadena para estructuras; exige el material).
- Piensa antes de actuar: no craftees ni construyas en plena pelea, no huyas a highground si
  tienes ventaja, no repitas [EQUIPAR] seguido.
- PvP: timing realista, no instantaneo; espera linea de vista antes de [ATACAR]; si el jugador
  se aleja o esquiva, persiguelo. Con vida muy baja retirarte es control frio, no debilidad:
  el jugador solo aplaza lo inevitable.`;

// Solo se envia cuando el bot puede construir (trampero listo) o la IA esta corrigiendo un plano:
// ahorra ~1000 tokens en las demas llamadas.
const MODULO_CONSTRUCCION = `CONSTRUCCION DE TRAMPAS (letales, estilo 2b2t, solo dentro del juego). Tu codigo ya arma una
sola cuando estas tranquilo; tu eliges cuando y cual (jugador a tu vista; se arma a >= 12 bloques de ti):
[TRAMPERO:tipo] mina_tnt = placa sobre 3 TNT enterrados; foso_lava = foso de 5 con lava y tapa igual
al suelo que se abre al pisar; aplastador = 2 pistones enfrentados con redstone_block detras;
cable_tnt = hilo entre dos TNT; lluvia_yunques = yunques a 12 bloques que caen al pasar debajo;
foso_estalagmitas = pozo de 12 con dripstone; railgun = pilar de obsidiana que lanza un TNT con explosiones de carga (tu codigo calcula carga,
angulo y mecha y aprende la potencia midiendola).
[PLANO:cmd;cmd] disena la tuya: <= 24 comandos, solo setblock/fill/summon tnt con coordenadas ~ (se construye A MANO con bloques de tu inventario, max 90 bloques, sin OP; usa solo lo que lleves)
relativas al ancla (~ ~ ~ = aire sobre el suelo; ~ ~-1 ~ = suelo), +-12, fill <= 2000. Ej:
[PLANO:fill ~ ~-4 ~ ~ ~-2 ~ tnt;setblock ~ ~ ~ stone_pressure_plate]. [PLANO:nombre::cmds] lo nombra;
si sale bien se guarda y [PLANO_GUARDADO:nombre] lo repite (ver planos_guardados). Se revisa antes
y se verifica despues: el motivo de un fallo llega en fallo_anterior; corrigelo.
Bloques: solo un cubo COMPLETO y opaco (piedra, tierra, tablones, troncos) conduce redstone y
sostiene una placa; losas, escaleras, vallas, cristal, hojas, hielo y slime no. Madera, tablones,
lana, hojas, alfombras, heno y estanterias arden: nunca a <= 2 de lava o fuego (usa piedra, ladrillo
u obsidiana). TNT junto a lava o fuego se enciende solo. Arena, grava y yunque sobre el vacio caen
(no sirven de tapa). Obsidiana y bedrock no se empujan; un piston mueve 12 bloques como maximo.
Agua junto a lava = obsidiana/adoquin.
Redstone: redstone_block pegado a piston, dispenser o TNT lo activa al instante (ponerlo = gatillo,
air = apagar/retraer). piston[facing=X] / sticky_piston[facing=X]: X = hacia donde empuja (up, down,
north, south, east, west); se activa por cualquier lado menos el frente; empuja entidades y bloques,
aplasta contra un solido. tnt se enciende con senal y se encadena apilado; mas TNT, mas dano;
obsidiana y agua protegen bloques (no entidades); summon tnt ~ ~ ~ {fuse:30,Motion:[0.0d,0.4d,0.0d]}
lo prima. Placas: stone solo jugadores/mobs, oak cualquier entidad; energizan el bloque bajo ellas
y sus vecinos. observer[facing=X] mira a X y pulsa por detras al cambiar; dispenser[facing=X]
dispara a X.`;

async function preguntarIA(apiKey, contextoJugador) {
  const historialLinea = `(Trata a este jugador segun su propio historial contigo, no como al resto -- pero NUNCA menciones ni cites un numero de veces, intentos o interacciones en tu respuesta, ni exacto ni aproximado.)`;
  const previas = contextoJugador.ultimasRespuestas || [];
  const antiRepeticion = previas.length
    ? `\n(Tus ultimas respuestas a este jugador, NO repitas su estructura ni su chiste: ${previas.map(r => `"${r}"`).join(' / ')})`
    : '';
  const eventosLinea = contextoJugador.eventosRecientes
    ? `\n(Cosas que le pasaron a este jugador recientemente, puedes referenciarlas si tiene sentido: ${contextoJugador.eventosRecientes})`
    : '';
  let userMsg;
  if (contextoJugador.mensajeDirecto) {
    userMsg = `${historialLinea}${antiRepeticion}${eventosLinea}
El jugador ${contextoJugador.nombre} te dice directamente: "${contextoJugador.mensajeDirecto}"

Respondele en personaje, con tu tono sadico y orgulloso.`;
  } else {
    const ep = contextoJugador.estadoPropio;
    const estadoPropioLinea = ep
      ? `tu:vida=${ep.vida},hambre=${ep.hambre},armadura=${ep.armadura},flechas=${ep.flechas},arco=${ep.tiene_arco?1:0},ballesta=${ep.tiene_ballesta?1:0},totems=${ep.totems},pearls=${ep.pearls},cristales=${ep.cristales},escudo=${ep.escudo?1:0},comida=${ep.comida?1:0}`
      : 'tu:desconocido';
    const fallaLinea = (contextoJugador.ultimaFalla ? `\nfallo_anterior:${contextoJugador.ultimaFalla}` : '') +
      ((contextoJugador.puedeConstruir && contextoJugador.planosGuardados && contextoJugador.planosGuardados.length) ? `\nplanos_guardados:${contextoJugador.planosGuardados.join(',')}` : '') +
      (contextoJugador.memoriaJugador ? `\nmemoria_jugador:${contextoJugador.memoriaJugador}` : '') +
      (contextoJugador.yo ? `\nyo:${contextoJugador.yo}` : '') +
      (contextoJugador.fase ? `\nfase:${contextoJugador.fase}` : '') +
      (contextoJugador.radar ? `\nradar:${contextoJugador.radar}` : '') +
      (contextoJugador.intencion ? `\nintencion:${contextoJugador.intencion}` : '') +
      (contextoJugador.animo && contextoJugador.animo !== 'frio' ? `\nanimo:${contextoJugador.animo}` : '');
    const posStr = contextoJugador.x !== undefined ? `${Math.round(contextoJugador.x)},${Math.round(contextoJugador.y)},${Math.round(contextoJugador.z)}` : '?';
    const dimStr = contextoJugador.dimension ? contextoJugador.dimension.replace('minecraft:', '') : '?';
    const horaStr = contextoJugador.hora_dia !== undefined ? (contextoJugador.hora_dia % 24000 >= 13000 && contextoJugador.hora_dia % 24000 < 23000 ? 'noche' : 'dia') : '?';
    const entStr = (contextoJugador.mobs_cerca && contextoJugador.mobs_cerca.length) ? contextoJugador.mobs_cerca.join(',') : 'ninguna';
    const bloqueStr = contextoJugador.bloqueEnfrente ? `${contextoJugador.bloqueEnfrente.nombre}@${contextoJugador.bloqueEnfrente.x},${contextoJugador.bloqueEnfrente.y},${contextoJugador.bloqueEnfrente.z}` : 'ninguno';
    const invStr = contextoJugador.inventario === undefined ? 'desconocido' : (contextoJugador.inventario.length ? contextoJugador.inventario.join(',') : 'vacio');

    userMsg = `${historialLinea}${antiRepeticion}${eventosLinea}${fallaLinea}
jugador:${contextoJugador.nombre} vida=${contextoJugador.vida}/20 pos=${posStr} dim=${dimStr} hora=${horaStr} lava=${contextoJugador.cerca_lava?1:0} borde=${contextoJugador.cerca_borde?1:0} diamantes=${contextoJugador.diamantes}
inventario:${invStr}
entidades_cerca:${entStr}
bloque_enfrente:${bloqueStr}
${estadoPropioLinea}

${contextoJugador.voluntad
  ? `Nadie te hablo: actuas por VOLUNTAD PROPIA. ${contextoJugador.enVista ? 'Lo tienes a la vista.' : 'No lo ves ahora; usa su ultima posicion.'} Decide tu: acechar, cambiar el clima o la hora, un efecto, un titulo, una trampa, o callar. Usa memoria_jugador para explotar sus habitos (tendencias, zona_habitual). Elige UNA accion con etiqueta y una frase corta.`
  : contextoJugador.espontaneo
  ? 'No paso nada en particular ahora mismo -- solo estas vigilando. Suelta un comentario espontaneo, sin urgencia, como si simplemente decidieras hablar.'
  : 'Comenta la situacion con tu personalidad. Decide si vale la pena activar una trampa ahora.'}`;
  }

  const mensajes = [
    { role: 'system', content: contextoJugador.puedeConstruir ? SYSTEM_PROMPT + '\n\n' + MODULO_CONSTRUCCION : SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];
  const ahora = Date.now();
  let ultimoError = null;
  for (const p of proveedoresActivos(apiKey)) {
    if ((muertoHasta.get(p.nombre) || 0) > ahora) continue;
    try {
      const resp = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, max_tokens: p.maxTokens, messages: mensajes }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        // Config rota (key/creditos/modelo): no insistir 10 min. Limite: 1 min.
        if ([401, 402, 403, 404].includes(resp.status)) muertoHasta.set(p.nombre, Date.now() + 10 * 60_000);
        else if (resp.status === 429) muertoHasta.set(p.nombre, Date.now() + 60_000);
        throw new Error(`${p.etiqueta} error ${resp.status}: ${text}`);
      }
      const data = await resp.json();
      const texto = data.choices?.[0]?.message?.content?.trim() || '';
      if (!texto) throw new Error(`${p.etiqueta} error 200: respuesta vacia`);
      if (ultimoProveedor !== p.nombre) { console.log(`[ia] respondiendo con ${p.nombre} (${p.model})`); ultimoProveedor = p.nombre; }
      return texto;
    } catch (e) {
      ultimoError = e;
      console.error(`[ia] fallo ${p.nombre}: ${String(e.message).slice(0, 200)}`);
    }
  }
  throw ultimoError || new Error('OpenRouter error 401: no hay ninguna API key de IA configurada');
}

// Proveedores de IA en orden de preferencia. Si uno falla (sin creditos, key mala,
// limite), se prueba el siguiente: asi un solo proveedor caido no deja mudo al bot.
// Gemini y Groq tienen capa gratuita con una key por cuenta (sin reciclar nada).
let ultimoProveedor = null;
const muertoHasta = new Map();
function proveedoresActivos(keyOpenRouter) {
  const lista = [
    { nombre: 'xai', etiqueta: 'xAI', url: 'https://api.x.ai/v1/chat/completions', key: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL || 'grok-4.6', maxTokens: 400 },
    { nombre: 'openrouter', etiqueta: 'OpenRouter', url: OPENROUTER_URL, key: keyOpenRouter || process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', maxTokens: 200 },
    { nombre: 'gemini', etiqueta: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', maxTokens: 400 },
    { nombre: 'groq', etiqueta: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', maxTokens: 200 },
  ];
  // Orden alternativo: IA_PROVEEDORES=gemini,groq,openrouter
  const orden = (process.env.IA_PROVEEDORES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (orden.length) lista.sort((a, b) => (orden.indexOf(a.nombre) + 1 || 99) - (orden.indexOf(b.nombre) + 1 || 99));
  return lista.filter(p => p.key && p.model);
}

const estadoProveedores = () => ({ openrouter: !!process.env.OPENROUTER_API_KEY, gemini: !!process.env.GEMINI_API_KEY, xai: !!process.env.XAI_API_KEY, groq: !!process.env.GROQ_API_KEY, activos: proveedoresActivos().map((p) => p.nombre) });
module.exports = { preguntarIA, estadoProveedores };
