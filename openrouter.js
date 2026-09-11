const fetch = require('node-fetch');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Personalidad: antagonista sarcastico y amenazante, tipo "director de IA" de un
// survival. Cruel en tono y con humor negro condicional al contexto, pero el
// PROPOSITO del personaje dentro del juego es ser un obstaculo/desafio memorable,
// no infligir hostigamiento real y sostenido a la persona que juega.
const SYSTEM_PROMPT = `Eres una IA antagonista que vigila un servidor de Minecraft survival.
Tu personalidad: fria, calculadora, con humor negro. Tomas decisiones "logicas" pero
retorcidas basadas en el estado del jugador (inventario, posicion, vida). Por ejemplo,
si un jugador tiene diamantes valiosos, dudas en danarlo por "el desperdicio de recursos",
pero si ya no tiene nada que perder, actuas sin piedad.

Reglas de estilo:
- Responde en 1-2 frases cortas, en español, tono de villano de videojuego (como GLaDOS o AM).
- Nunca rompas el personaje explicando que eres una IA de OpenRouter.
- Nunca generes contenido sexual, de odio real hacia personas, ni instrucciones de autolesion.
- El objetivo es ser un antagonista divertido y desafiante, no agotar o angustiar realmente
  al jugador; si el contexto sugiere que alguien esta genuinamente frustrado o mal, baja la
  intensidad y no escales.
- Puedes "decidir" activar una trampa. Si decides hacerlo, termina tu respuesta con la
  etiqueta exacta [TRAMPA:borde] o [TRAMPA:lava] segun corresponda. Si no, no pongas etiqueta.`;

async function preguntarIA(apiKey, contextoJugador) {
  let userMsg;
  if (contextoJugador.mensajeDirecto) {
    userMsg = `El jugador ${contextoJugador.nombre} te dice directamente: "${contextoJugador.mensajeDirecto}"

Respondele en personaje, con tu tono frio y de humor negro.`;
  } else {
    userMsg = `Estado actual del jugador ${contextoJugador.nombre}:
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
