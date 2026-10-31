const fs = require('fs');
const path = require('path');
const { ESTILOS } = require('./lenguaje');

const MEM_DE = { miedo_x: ['teme', 'M'], posesion_x: ['tiene', 'X'], minar_x: ['tiene', 'I'], ir_a_l: ['refugio', 'L'], dormir: ['refugio', 'L'], construir: ['refugio', 'L'], nombre_usuario: ['nombre', 'N'] };
const PSIQUE_E = { odio: 'promesa', desprecio: 'frio', sadismo: 'susurro', dominio: 'orden', frustracion: 'escala', hastio: 'pregunta', fascinacion: 'susurro', frialdad: 'frio' };
const MANO = [[/netherite_sword/, 'una espada de netherita'], [/diamond_sword/, 'una espada de diamante'], [/iron_sword/, 'una espada de hierro'], [/_axe$/, 'un hacha'], [/^(bow|crossbow)$/, 'un arco'], [/trident/, 'un tridente'], [/mace/, 'una maza']];
const BIOMA = [[/desert|badlands/, 'el desierto'], [/swamp|mangrove/, 'el pantano'], [/beach|ocean/, 'la playa'], [/peaks|mountain|hills|slopes/, 'la montaña'], [/forest|taiga|jungle|grove/, 'el bosque']];

function crearCharla(bot, o) {
  const chat = require('./slm_chat').crearChat(path.join(__dirname, 'slm', 'chat'));
  const ruta = o.ruta;
  let mem = {}, sucio = false;
  try { mem = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { mem = {}; }
  const guardar = () => { if (!sucio) return; try { fs.writeFileSync(ruta, JSON.stringify(mem)); sucio = false; } catch (e) { /* ignorar */ } };
  const gt = setInterval(guardar, 60000);
  bot.once('end', () => { clearInterval(gt); guardar(); });
  bot._charla = { guardar };

  function hechos(usuario) {
    const h = {};
    const yo = bot.entity && bot.entity.position;
    if (typeof bot.health === 'number') h.vida = Math.round(bot.health);
    if (yo) {
      const dim = String((bot.game && bot.game.dimension) || '').replace(/.*:/, '');
      let lugar = null;
      const base = bot._base && bot._base();
      if (dim === 'the_nether') lugar = 'el nether';
      else if (dim === 'the_end') lugar = 'el end';
      else if (base && yo.distanceTo(base) < 12) lugar = 'mi base';
      else if (yo.y < 45) lugar = 'la cueva';
      else { try { const b = bot.blockAt(yo); const bn = b && b.biome && b.biome.name; const m = BIOMA.find((x) => x[0].test(bn || '')); if (m) lugar = m[1]; } catch (e) { /* ignorar */ } }
      if (lugar) h.lugar = lugar;
      const e = bot.players && bot.players[usuario] && bot.players[usuario].entity;
      if (e && e.position) h.distancia = Math.max(1, Math.round(e.position.distanceTo(yo)));
    }
    const t = bot.time && bot.time.timeOfDay;
    if (typeof t === 'number') h.momento = t >= 23000 || t < 1000 ? 'el amanecer' : t < 12000 ? 'el día' : t < 13500 ? 'el atardecer' : t < 18000 ? 'la noche' : 'la madrugada';
    const it = bot.heldItem;
    h.mano = it ? (MANO.find((x) => x[0].test(it.name)) || [0, null])[1] || undefined : 'las manos vacías';
    if (h.mano === undefined) delete h.mano;
    const tg = bot.pvp && bot.pvp.target;
    h.accion = tg && tg.username === usuario ? 'cazándote' : bot.health < 12 ? 'recuperándome' : 'vigilándote';
    try { const n = o.muertes && o.muertes(); if (n > 0) h.muertes = n; } catch (e) { /* ignorar */ }
    return h;
  }

  async function responder(usuario, texto) {
    await chat.cargar();
    if (!chat.listo()) return null;
    const lg = bot._leng;
    if (!lg) return null;
    const r = lg.analizar(texto);
    const rs = lg.vector(usuario);
    const dom = bot._psique ? bot._psique.dominante() : null;
    let estilo = r.pregunta ? 'pregunta' : PSIQUE_E[dom] || ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
    if (!r.pregunta && Math.random() < 0.3) estilo = ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
    const lectura = await chat.leer(texto);
    if (!lectura) return null;
    const antes = Object.assign({}, mem[usuario]);
    const md = MEM_DE[lectura.intencion];
    if (md && lectura.slots[md[1]]) { mem[usuario] = Object.assign(mem[usuario] || {}, { [md[0]]: lectura.slots[md[1]] }); sucio = true; }
    const hs = hechos(usuario);
    let m = null;
    for (let i = 0; i < 6 && !m; i++) m = await chat.responder(texto, { estilo, rs, nombre: usuario, lectura, hechos: hs, memoria: antes });
    return m || null;
  }
  return { responder, hechos };
}
module.exports = { crearCharla };
