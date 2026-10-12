// Temperamento: rasgos que derivan solos (paseo aleatorio con reversion a un objetivo segun estado y stats).
// Cada decision con peso usa estos rasgos, asi la prioridad nunca es fija ni predecible.
const R = { agresion: 1, cautela: 1, astucia: 1, paciencia: 1, crueldad: 1 };
const LIM = { agresion: [0.5, 1.8], cautela: [0.5, 1.8], astucia: [0.6, 1.8], paciencia: [0.5, 1.8], crueldad: [0.6, 3] };
let bot = null, diag = null;

function iniciar(b, d) {
  bot = b; diag = d;
  const t = setInterval(() => {
    if (!bot.entity) return;
    const st = bot._stats, hp = bot.health === undefined ? 20 : bot.health;
    const odio = st ? st.mult('odio') : 1, sad = st ? st.mult('sadismo') : 1;
    const meta = {
      agresion: 1 + (odio - 1) * 0.6 - (hp < 8 ? 0.3 : 0),
      cautela: 1 + (hp < 10 ? 0.3 : 0) - (odio - 1) * 0.3,
      astucia: 1 + (sad - 1) * 0.2,
      paciencia: 1 + (sad - 1) * 0.4,
      crueldad: sad,
    };
    for (const k of Object.keys(R)) {
      if (bot._bandits && meta[k] !== undefined && k !== 'crueldad') meta[k] += bot._bandits.sesgo(k);
      const [lo, hi] = LIM[k];
      R[k] = Math.max(lo, Math.min(hi, R[k] + (Math.random() - 0.5) * 0.22 + (meta[k] - R[k]) * 0.15));
    }
    if (diag) diag.estado.temperamento = Object.entries(R).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' | ');
  }, 20_000);
  if (t.unref) t.unref();
  bot.once('end', () => clearInterval(t));
}
const rasgo = (n) => R[n] || 1;
// peso = base * producto(rasgo^exp) * ruido 0.7-1.3
const peso = (base, exps = {}) => { let w = base; for (const [k, e] of Object.entries(exps)) w *= Math.pow(rasgo(k), e); return w * (0.7 + Math.random() * 0.6); };
function elegir(lista) {
  const ws = lista.map((x) => Math.max(0, x.w));
  const tot = ws.reduce((a, b) => a + b, 0);
  if (!tot) return lista[0];
  let r = Math.random() * tot;
  for (let i = 0; i < lista.length; i++) { r -= ws[i]; if (r <= 0) return lista[i]; }
  return lista[lista.length - 1];
}
module.exports = { iniciar, rasgo, peso, elegir, rasgos: () => ({ ...R }) };
