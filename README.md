# IA Antagonista - Bot para Aternos

Bot mineflayer que se conecta a tu server Aternos, lee el contexto que emite el
datapack `ia-datapack`, y usa OpenRouter para generar comentarios/decisiones de
un antagonista de IA. Pensado para correr 24/7 gratis en Render.

## 1. Instalar el datapack en Aternos

1. Entra a tu panel de Aternos > pestaña "World" (o "Configuration Files" según versión del panel).
2. Sube `ia-datapack.zip` en la seccion de datapacks del mundo (arrastrar y soltar,
   o el boton de subir datapack).
3. Si el server ya estaba corriendo, ejecuta `/reload` en la consola, o reinicia el server.
4. Deberia aparecer en el chat: "[Sistema] Datapack de IA cargado."

## 2. Subir el bot a GitHub

Este bot se despliega en Render conectando un repo de GitHub. Sube esta carpeta
(`ia-bot/`) a un repositorio nuevo (puede ser privado).

## 3. Crear el servicio en Render

1. Entra a https://render.com y crea una cuenta (no pide tarjeta para el plan free).
2. "New +" -> "Web Service".
3. Conecta tu repo de GitHub con este bot.
4. Configuracion:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Plan: Free
5. En "Environment Variables" agrega:
   - `MC_HOST` = tu-servidor.aternos.me
   - `MC_PORT` = 25565 (o el puerto que te de Aternos)
   - `MC_BOT_USERNAME` = el nombre que quieras que tenga el bot en el juego
   - `MC_VERSION` = 1.21.4 (ajusta a la version exacta de tu server)
   - `OPENROUTER_API_KEY` = tu API key de OpenRouter
6. Deploy. Revisa los logs: deberia decir "[bot] conectado a ...".

## 4. Darle OP al bot (necesario para las trampas)

Las trampas se disparan con `/function ia:trampa_borde` y `/function ia:trampa_lava`,
que requieren permisos de operador. Desde la consola web de Aternos ejecuta:

```
/op TU_MC_BOT_USERNAME
```

Sin esto, el bot igual va a comentar en el chat, pero las trampas no se van a activar.

## 5. Whitelist (si la tienes activada)

Si tu server tiene whitelist, agrega el `MC_BOT_USERNAME` a la whitelist desde
el panel de Aternos antes de que el bot intente conectarse.

## 6. Evitar que Render duerma el servicio

El plan free de Render duerme el servicio tras ~15 min sin trafico HTTP entrante.
Como el bot necesita estar corriendo siempre que el server de Minecraft este
prendido, usa un servicio externo gratis que le haga ping cada 5-10 minutos:

- https://cron-job.org (gratis, sin tarjeta) -> crea un cron job que haga GET
  a `https://tu-servicio.onrender.com/health` cada 5 minutos.
- Alternativa: https://uptimerobot.com con un monitor HTTP(s) al mismo endpoint.

Esto NO enciende tu server de Aternos (eso lo sigues haciendo tu manualmente
desde el panel) -- solo mantiene despierto al bot para que, en cuanto el server
este online, se conecte y empiece a escuchar.

## 7. Reconexion automatica

El bot ya reintenta conectarse cada 15 segundos si se desconecta (por ejemplo
si el server de Aternos se apaga por inactividad). No necesitas reiniciarlo a mano.

## Notas de diseño

- El bot solo llama a la API de OpenRouter cuando detecta una situacion de
  interes (cerca de lava, cerca de un borde, o vida baja) y respeta un cooldown
  de 25s por jugador -- para no gastar tu cuota de la API en cada tick.
- Las "trampas" (`ia:trampa_borde`, `ia:trampa_lava`) son de riesgo, no de muerte
  garantizada: el jugador siempre tiene una ventana para reaccionar.
- El prompt de sistema (en `openrouter.js`) esta escrito para mantener al
  personaje como un antagonista de juego desafiante, no como una fuente de
  hostigamiento real y sostenido hacia quien juega. Si notas que el tono se
  vuelve realmente hostil hacia una persona en vez de hacia el personaje del
  juego, ajusta el system prompt para bajar la intensidad.
