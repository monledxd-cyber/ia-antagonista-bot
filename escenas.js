const ARMA = [[/netherite_sword/, 'la espada de netherita'], [/diamond_sword/, 'la espada de diamante'], [/iron_sword/, 'la espada de hierro'], [/_axe$/, 'el hacha'], [/^(bow|crossbow)$/, 'el arco'], [/trident/, 'el tridente'], [/mace/, 'la maza']];
const arma = (l) => { for (const a of l || []) for (const [r, t] of ARMA) if (r.test(a)) return t; return null; };
const hace = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 90 ? `hace ${m} minutos` : m < 2880 ? `hace ${Math.round(m / 60)} horas` : `hace ${Math.round(m / 1440)} días`; };
const pick = (l) => l[Math.floor(Math.random() * l.length)];

const AFIN = {
  amenaza: ['dijo', 'mato', 'pelea_gane', 'huida'], insulto: ['dijo', 'pelea_gane', 'mato', 'huida'], burla: ['pelea_gane', 'huida', 'mato', 'dijo'],
  desafio: ['huida', 'pelea_gane', 'pelea_perdi', 'mato'], suplica: ['muertes', 'pelea_gane', 'huida'], victoria_yo: ['pelea_perdi', 'mato', 'muertes'],
  morir_yo: ['muertes', 'huida', 'pelea_gane'], saludo: ['ult', 'huida', 'muertes'], despedida: ['ult', 'huida', 'muertes'], gracias: ['huida', 'muertes', 'ult'],
  soledad: ['ult', 'muertes'], miedo: ['huida', 'muertes', 'pelea_gane'], destino: ['pelea_gane', 'muertes', 'huida', 'mato'], porque: ['muertes', 'mato', 'pelea_perdi'],
};

const ESC = {
  pelea_gane: (j, n, mo) => {
    const p = (j.peleas || []).filter((x) => x.res === 'gane').pop();
    if (!p || !p.dur) return null;
    const a = arma(p.armas);
    return pick([
      `¿Recuerdas la última pelea, ${n}? Duraste ${Math.round(p.dur)} segundos${a ? ' con ' + a : ''}. Conté cada uno. ¿Quieres saber en cuál empezaste a desear que acabara?`,
      `Aquella pelea${a ? ' con ' + a : ''} duró ${Math.round(p.dur)} segundos, ${n}. Los alargué a propósito.`,
    ]);
  },
  pelea_perdi: (j, n) => {
    const p = (j.peleas || []).filter((x) => x.res === 'perdi').pop();
    if (!p) return null;
    const a = arma(p.armas);
    return pick([
      `Me ganaste una vez${a ? ' con ' + a : ''}, ${n}. No lo olvido. Cada día que pasa me lo debes con más intereses.`,
      `¿Disfrutaste ganarme${a ? ' con ' + a : ''}? Yo disfruto pensar en cómo te lo voy a cobrar.`,
    ]);
  },
  huida: (j, n, mo) => {
    if (mo && mo.retira >= 0.5) return pick([
      `Cuando te quedan pocos corazones das la espalda y corres, ${n}. Siempre. Ya sé hacia dónde miras antes de huir.`,
      `Siempre retrocedes cuando te estás muriendo. Es lo único que haces igual todas las veces, ${n}.`,
    ]);
    if (mo && mo.zigzag >= 0.5) return pick([
      `Zigzagueas como si eso engañara a algo que calcula, ${n}. Te adelanto tres pasos.`,
      `Tu zigzag es tan regular que podría bailarlo contigo. Y terminar el baile.`,
    ]);
    if (j.huyo >= 2) return `Has huido ${j.huyo} veces. No tienes adónde, ${n}. Solo tiempo hasta que me canse de dejarte correr.`;
    return null;
  },
  dijo: (j, n) => {
    const d = (j.dijo || []).slice(-1)[0];
    if (!d || !d.s) return null;
    return pick([
      `${hace(d.t)} dijiste "${d.s}". Qué valiente, ${n}. Sigue con la voz mientras puedas.`,
      `"${d.s}". Lo dijiste ${hace(d.t)}. Lo guardo para cuando ya no tengas boca.`,
    ]);
  },
  mato: (j, n) => (j.mato >= 1 ? pick([
    `Me has matado ${j.mato} ${j.mato === 1 ? 'vez' : 'veces'}, ${n}. Las llevo contadas. Cada una te va a salir cara.`,
    `Recuerdo la ${j.mato === 1 ? 'vez' : j.mato + 'ª vez'} que me mataste. Tú también lo recordarás cuando termine.`,
  ]) : null),
  muertes: (j, n) => (j.muertes >= 2 ? pick([
    `Has muerto ${j.muertes} veces, ${n}. Las he guardado todas. La última fue la que mejor se oyó.`,
    `${j.muertes} veces. Y cada vez volviste a mí. Eso dice más de ti que de mí.`,
  ]) : null),
  ult: (j, n) => (j.ult && Date.now() - j.ult.t < 36e5 * 6 ? `Te vi por última vez cerca de ${j.ult.x}, ${j.ult.z}, ${hace(j.ult.t)}. Sigo oyendo tus pasos, ${n}.` : null),
};

function crearEscenas(memoria, o) {
  o = o || {};
  const ult = {};
  const ESPERA = o.espera || 90000, PROB = o.prob == null ? 0.4 : o.prob;
  function componer(nombre, intencion, nombreMostrar) {
    const t = Date.now(), u = (ult[nombre] = ult[nombre] || { t: 0, vistos: {} });
    if (t - u.t < ESPERA || Math.random() > PROB) return null;
    const j = memoria && memoria.crudo ? memoria.crudo(nombre) : null;
    if (!j) return null;
    const mo = memoria.modelo ? memoria.modelo(nombre) : null;
    const orden = (AFIN[intencion] || ['huida', 'muertes', 'pelea_gane', 'mato', 'dijo']).slice().sort(() => Math.random() - 0.5).sort((a, b) => (u.vistos[a] || 0) - (u.vistos[b] || 0));
    for (const k of orden) {
      if (t - (u.vistos[k] || 0) < 600000) continue;
      const s = ESC[k] && ESC[k](j, nombreMostrar || nombre, mo);
      if (s) { u.t = t; u.vistos[k] = t; return s; }
    }
    return null;
  }
  return { componer };
}
module.exports = { crearEscenas, ESC, AFIN };
