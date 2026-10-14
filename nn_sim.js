const { experto, NI } = require('./nn_casos');

const ESTILOS = ['cuerpo', 'mace', 'arquero', 'escudo', 'cobarde'];
const nuevo = () => ({ hp: 20, rhp: 20, dist: 3 + Math.random() * 7, curas: Math.random() < 0.6 ? 1 : 0, est: ESTILOS[Math.floor(Math.random() * ESTILOS.length)], flecha: 0, conoce: Math.random() < 0.4, t: 0, esc: Math.random() < 0.7 });

function vec(e) {
  const s = new Array(NI).fill(0);
  s[0] = e.hp / 20; s[1] = 1; s[3] = e.conoce ? 0 : 1; s[2] = e.conoce ? e.rhp / 20 : 0.5;
  s[4] = Math.min(2, e.dist / 10); s[6] = 0.3; s[7] = 0;
  const idx = { cuerpo: 10, mace: 8, arquero: 12, escudo: 10, cobarde: 11 }[e.est];
  s[idx] = 1; s[14] = e.est === 'escudo' ? 1 : 0; s[15] = e.est === 'arquero' ? 1 : 0;
  s[16] = 0.4; s[17] = 0.5; s[18] = 0.5; s[20] = 1; s[25] = e.curas;
  s[27] = Math.tanh((e.hp - e.rhp) / 10); s[28] = e.flecha;
  return s;
}

function paso(e, a) {
  const hp0 = e.hp, r0 = e.rhp;
  let inc = 0, evita = false;
  const contra = e.est === 'escudo' ? 0.4 : 1;
  if (a === 0) { if (e.dist <= 3.5) e.rhp -= 6 * contra; else e.dist = Math.max(1.5, e.dist - 2.5); }
  else if (a === 1) e.dist += 2.5;
  else if (a === 2) { if (e.curas > 0 && e.dist > 3.5) { e.hp = Math.min(20, e.hp + 8); e.curas--; } }
  e.flecha = 0;
  if (e.est === 'cuerpo') { if (e.dist > 3.5) e.dist -= 2.5; else if (Math.random() < 0.8) inc = 5; }
  else if (e.est === 'mace') { if (e.dist > 4) e.dist -= 3; else if (Math.random() < 0.45) { inc = 12; evita = a === 4 && Math.random() < 0.6; } }
  else if (e.est === 'arquero') { if (e.dist < 4) e.dist += 2; else if (e.dist > 10) e.dist -= 2; else if (Math.random() < 0.7) { inc = 4; e.flecha = 0.7; } }
  else if (e.est === 'escudo') { if (e.dist > 3.5) e.dist -= 2.5; else if (Math.random() < 0.6) inc = 4; }
  else if (e.est === 'cobarde') { if (e.rhp < 8) e.dist += 3; else if (e.dist > 3.5) e.dist -= 2.5; else if (Math.random() < 0.6) inc = 4; }
  if (a === 3 && e.esc && e.est !== 'mace') inc *= 0.3;
  else if (a === 3 && e.est === 'mace') inc *= 0.6;
  if (a === 4 && e.est !== 'mace' && Math.random() < 0.5) evita = true;
  if (evita) inc = 0;
  e.hp -= inc;
  e.t++;
  let r = (e.hp - hp0) / 20 + 0.5 * (r0 - e.rhp) / 20, fin = false;
  if (e.rhp <= 0) { r += 1; fin = true; } else if (e.hp <= 0) { r -= 1; fin = true; } else if (e.t >= 25) fin = true;
  e.dist = Math.max(1.5, Math.min(14, e.dist));
  return { r, fin };
}

function jugar(politica, eps) {
  const e = nuevo(), ep = [];
  let ctx = politica.inicio ? politica.inicio() : null;
  for (;;) {
    const s = vec(e), r0 = politica.act(s, ctx, eps);
    const a = r0.a; ctx = r0.ctx;
    const { r, fin } = paso(e, a);
    ep.push({ s, a, r, fin });
    if (fin) return { ep, gana: e.rhp <= 0 };
  }
}

function polRed(red) {
  return { inicio: () => red.cero(), act: (s, h, eps) => { const o = red.step(s, h); const a = Math.random() < eps ? Math.floor(Math.random() * 6) : o.o.indexOf(Math.max(...o.o)); return { a, ctx: o.h }; } };
}
const polExperto = { act: (s, c, eps) => { const q = experto(s); return { a: Math.random() < eps ? Math.floor(Math.random() * 6) : q.indexOf(Math.max(...q)), ctx: null }; } };

function tasa(pol, n) { let g = 0; for (let i = 0; i < n; i++) if (jugar(pol, 0).gana) g++; return g / n; }

function entrenar(red, n) {
  const eps = [];
  for (let i = 0; i < n; i++) {
    const eps0 = Math.max(0.08, 0.35 * (1 - i / n));
    const mix = Math.random() < 0.35 ? polExperto : polRed(red);
    eps.push(jugar(mix, eps0).ep);
    if (eps.length > 400) eps.shift();
    for (let k = 0; k < 4; k++) {
      const ep = eps[Math.floor(Math.random() * eps.length)];
      red.tdVentana(ep, Math.max(0, Math.floor(Math.random() * ep.length) - 1), 0.008);
    }
  }
  return { win: tasa(polRed(red), 300), base: tasa(polExperto, 300) };
}
module.exports = { entrenar, jugar, polRed, polExperto, tasa, vec };
