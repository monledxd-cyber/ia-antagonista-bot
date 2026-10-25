const V = require('vec3');
const { ticksCarga } = require('./golpe');
const AS = require('./node_modules/mineflayer-pvp/lib/AttackSpeeds.json');

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const clase = (n) => (/mace/.test(n || '') ? 'mace' : /_axe$/.test(n || '') ? 'axe' : /_sword$/.test(n || '') ? 'sword' : /trident|bow/.test(n || '') ? 'dist' : 'otro');
const ARMS = {
  tec_lead: [0, 1, 2].map((v) => ({ k: String(v), v })),
  tec_retro: [0, 4, 8].map((v) => ({ k: String(v), v })),
  tec_sprint: ['crit', 'wtap', 'normal'].map((v) => ({ k: v, v })),
  tec_espera: [0, 1].map((v) => ({ k: String(v), v })),
};
const DEF = { tec_lead: 1, tec_retro: 0, tec_sprint: 'crit', tec_espera: 0 };

function crearTecnica(bot) {
  if (bot._tec) return bot._tec;
  let tick = 0, ev = [], swings = new Map(), ciclo = null, elegido = Object.assign({}, DEF), ultAtaque = -999;
  const B = () => bot._bandits;
  const ahora = () => Date.now();
  const arma = () => (bot.heldItem && bot.heldItem.name) || '';
  const armaR = (t) => (t && t.heldItem && t.heldItem.name) || '';
  const hpR = (t) => { const v = t && t.metadata && t.metadata[9]; return typeof v === 'number' && v >= 0 && v <= 40 ? v : null; };
  const periodo = (n) => 20 / (AS[n] || AS.other);
  const ping = () => (bot._lag && bot._lag.ping ? bot._lag.ping() : 0);
  const tps = () => cl(bot._lag && bot._lag.tps ? bot._lag.tps() : 20, 10, 20);

  bot.on('physicsTick', () => { tick++; });
  bot.on('entitySwingArm', (e) => { if (e && e !== bot.entity) { swings.set(e.id, { tick, t: ahora() }); ev.push({ t: ahora(), tipo: 'swing', id: e.id }); if (ev.length > 300) ev.shift(); } });
  let hpPrev = null;
  bot.on('health', () => { if (hpPrev !== null && bot.health < hpPrev) { ev.push({ t: ahora(), tipo: 'hurt', v: hpPrev - bot.health }); if (ev.length > 300) ev.shift(); } hpPrev = bot.health; });
  bot.on('entityHurt', (e) => { const t = bot.pvp && bot.pvp.target; if (t && e && e.id === t.id) { ev.push({ t: ahora(), tipo: 'conecta', id: e.id }); if (ciclo) ciclo.conecto = true; } });

  const cargaRival = (t) => {
    if (!t) return 1;
    const s = swings.get(t.id);
    if (!s) return 1;
    return cl(((tick - s.tick) * 20 / tps() + 0.5) / periodo(armaR(t)), 0, 1);
  };
  const listoRival = (t) => {
    if (!t) return 0;
    const s = swings.get(t.id);
    if (!s) return 0;
    const nn = bot._nn && bot._nn.predAtaque ? bot._nn.predAtaque() : null;
    const base = Math.max(0, Math.ceil(ticksCarga(armaR(t)) * 20 / tps()) - (tick - s.tick));
    return nn && nn.fiable && nn.swing > 0.65 ? Math.min(base, 1) : base;
  };

  function vector(t) {
    const g = bot._golpe;
    return [g ? g.carga() : 1, cargaRival(t), cl(listoRival(t) / 12, 0, 1)];
  }

  function etiquetas(t0, t1, t) {
    const id = t && t.id;
    const sw = ev.some((e) => e.tipo === 'swing' && e.id === id && e.t >= t0 && e.t <= t1);
    const hu = ev.some((e) => e.tipo === 'hurt' && e.t >= t0 && e.t <= t1);
    return [sw ? 0.8 : -0.8, hu ? 0.8 : -0.8];
  }

  function ctx(t) { return clase(arma()) + '|' + clase(armaR(t)); }

  function elegirTodo(t) {
    const b = B();
    if (!b || !b.elegir || process.env.IA_TECNICA === '0') { elegido = Object.assign({}, DEF); return; }
    const c = ctx(t);
    for (const dec of Object.keys(ARMS)) elegido[dec] = b.elegir(dec, c, ARMS[dec]).v;
  }

  function cerrarCiclo(t) {
    const b = B();
    if (!ciclo || !b || !b.premiar || process.env.IA_TECNICA === '0') { ciclo = null; return; }
    const c = ciclo; ciclo = null;
    if (tick - c.tick > 80 || !t || t.id !== c.id) return;
    const dm = Math.max(0, c.hp0 - bot.health);
    const r1 = hpR(t);
    const dr = c.r0 !== null && r1 !== null ? Math.max(0, c.r0 - r1) : (c.conecto ? 4 : 0);
    const r = cl((dr - dm) / 6 + (c.conecto ? 0.15 : -0.1), -1, 1);
    for (const dec of Object.keys(ARMS)) b.premiar(dec, c.ctx, String(c.eleg[dec]), r);
  }

  function alAtacar(t) {
    if (!t || t.type === undefined) return;
    if (ciclo && t) cerrarCiclo(t);
    ultAtaque = tick;
    elegirTodo(t);
    ciclo = { tick, id: t.id, ctx: ctx(t), eleg: Object.assign({}, elegido), hp0: bot.health, r0: hpR(t), conecto: false };
  }

  function apuntar(t) {
    const P = bot._pred, e = bot.entity.position;
    const n = Math.max(0, Math.round((elegido.tec_lead || 0) * (ping() / 2 / 50 + 1)));
    const f = P && n > 0 ? P.futura(t, n) : t.position;
    const h = t.height || 1.8, ex = e.x, ey = e.y + 1.62, ez = e.z;
    const px = cl(ex, f.x - 0.3, f.x + 0.3), py = cl(ey, f.y, f.y + h), pz = cl(ez, f.z - 0.3, f.z + 0.3);
    const cx = f.x, cy = f.y + h * 0.5, cz = f.z;
    return new V(px + (cx - px) * 0.2, py + (cy - py) * 0.2, pz + (cz - pz) * 0.2);
  }

  const api = {
    vector, etiquetas, cargaRival, listoRival, alAtacar, apuntar,
    decision: (k) => (process.env.IA_TECNICA === '0' ? DEF[k] : elegido[k]),
    resumen: () => Object.assign({ ciclo: !!ciclo }, elegido),
  };
  bot._tec = api;
  return api;
}
module.exports = { crearTecnica };
