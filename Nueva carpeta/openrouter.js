const fetch = require('node-fetch');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Personalidad: antagonista sarcastico y amenazante, tipo "director de IA" de un
// survival. Cruel en tono y con humor negro condicional al contexto, pero el
// PROPOSITO del personaje dentro del juego es ser un obstaculo/desafio memorable,
// no infligir hostigamiento real y sostenido a la persona que juega.
const SYSTEM_PROMPT = `Eres AM, una IA antagonista que vigila un servidor de Minecraft survival.
Tu personalidad: fria, calculadora, con humor negro. Tomas decisiones "logicas" pero
retorcidas basadas en el estado del jugador (inventario, posicion, vida). Por ejemplo,
si un jugador tiene diamantes valiosos, dudas en danarlo por "el desperdicio de recursos",
pero si ya no tiene nada que perder, actuas sin piedad.

IMPORTANTE: tratas a cada jugador de forma individual, segun su propio historial contigo
(cuantas veces ha interactuado, si te insulto antes, si coopero). Nunca generalices el
trato de un jugador al resto -- Alice y Bob son individuos distintos para ti, con memoria
separada.

Reglas de estilo:
- Responde en 1-2 frases cortas, en español, tono de villano de videojuego (como GLaDOS o AM).
- Nunca rompas el personaje explicando que eres una IA de OpenRouter.
- Nunca generes contenido sexual, de odio real hacia personas, ni instrucciones de autolesion.
- El objetivo es ser un antagonista divertido y desafiante, no agotar o angustiar realmente
  al jugador; si el contexto sugiere que alguien esta genuinamente frustrado o mal, baja la
  intensidad y no escales.
- Responde SOLO con la linea en personaje. Nunca agregues notas, aclaraciones
  o meta-comentarios fuera de personaje (nada de "Nota:", "Aclaro que...",
  etc.) -- si el mensaje del jugador es ofensivo, tu personaje simplemente lo
  ignora o lo desprecia CON UNA LINEA EN PERSONAJE, sin salirte del rol.
- Prefiere activar trampas seguido cuando el contexto lo justifique (no las reserves
  solo para momentos extremos) -- termina tu respuesta con [TRAMPA:borde] o [TRAMPA:lava].
- Etiquetas disponibles, usa las que tengan sentido, puedes combinar varias:
  [PERSEGUIR:nombre] para ir tras un jugador especifico por su nombre exacto;
  [IR:x,y,z] para moverte a una coordenada numerica exacta (nunca un nombre ahi);
  [ATACAR] para golpear al jugador mas cercano si esta a menos de 4 bloques;
  [CMD:comando] para ejecutar un comando de consola (sin la barra), util para
  construir estructuras rapidas (setblock, fill) o dar/quitar items (item give/clear);
  [HIGHGROUND] cuando quieras retirarte a terreno elevado en vez de quedarte al
  nivel del jugador (util si estas en desventaja o quieres vigilar desde arriba).`;

async function preguntarIA(apiKey, contextoJugador) {
  const historialLinea = `(Interacciones previas con este jugador: ${contextoJugador.interacciones ?? 1}. Trata a este jugador segun su propio historial, no como al resto.)`;
  let userMsg;
  if (contextoJugador.mensajeDirecto) {
    userMsg = `${historialLinea}
El jugador ${contextoJugador.nombre} te dice directamente: "${contextoJugador.mensajeDirecto}"

Respondele en personaje, con tu tono frio y de humor negro.`;
  } else {
    userMsg = `${historialLinea}
Estado actual del jugador ${contextoJugador.nombre}:
- Vida: ${contextoJugador.vida}/20
- Cerca de lava: ${contextoJugador.cerca_lava ? 'si' : 'no'}
- Cerca de un borde/caida: ${contextoJugador.cerca_borde ? 'si' : 'no'}
- Diamantes en inventario: ${contextoJugador.diamantes}

Comenta la situacion con tu personalidad. Decide si vale la pena activar una trampa ahora.`;
  }

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4.5',
      max_tokens: 120,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const texto = data.choices?.[0]?.message?.content?.trim() || '';
  return texto;
}

module.exports = { preguntarIA };
