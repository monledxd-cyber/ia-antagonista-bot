// Memoria entre sesiones: un JSON por jugador (visitas, muertes, arma favorita, trampas sufridas). Se resume en una linea para la IA.
const fs = require('fs');
const path = require('path');

function crearMemoria(ruta) {
  const ARCHIVO = ruta || process.env.IA_MEMORIA || path.join(__dirname, 'memoria_jugadores.json');
  let datos = {};
  try { datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) || {}; } catch (e) { datos = {}; }
  let sucio = false;
  const get = (n) => (datos[n] = datos[n] || { visitas: 0, primera: Date.now(), ultima: Date.now(), muertes: 0, mato: 0, trampas: 0, armas: {}, huyo: 0, obs: {}, n: 0, lugares: {} });
  const guardar = () => {
    if (!sucio) return;
    try { fs.writeFileSync(ARCHIVO, JSON.stringify(datos)); sucio = false; } catch (e) { /* disco de solo lectura */ }
  };
  const timer = setInterval(guardar, 30_000);
  if (timer.unref) timer.unref();
  const marca = (n, campo, inc = 1) => { const j = get(n); j[campo] = (j[campo] || 0) + inc; j.ultima = Date.now(); sucio = true; };
  const recT = {};
  const dias = (t) => Math.max(0, Math.round((Date.now() - t) / 86400000));
  return {
    entra: (n) => { marca(n, 'visitas'); },
    murio: (n) => marca(n, 'muertes'),
    mato: (n) => marca(n, 'mato'),
    trampa: (n) => marca(n, 'trampas'),
    huyo: (n) => marca(n, 'huyo'),
    dijo: (n, txt) => {
      if (!/(mat|voy a|te voy|ya ver|cuidado|muere|maldit|odio|vengar|kill|gonna|will |destroy|noob|miedo|cobarde)/i.test(txt)) return;
      const j = get(n); j.dijo = j.dijo || []; j.dijo.push({ t: Date.now(), s: String(txt).slice(0, 80) }); if (j.dijo.length > 5) j.dijo.shift(); sucio = true;
    },
    pos: (n, p) => { const j = get(n); j.ult = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), t: Date.now() }; j.horas = j.horas || new Array(24).fill(0); j.horas[new Date().getHours()]++; sucio = true; },
    ultimo: (n) => (datos[n] && datos[n].ult) || null,
    zonaHabitual: (n) => { const b = Object.entries((datos[n] && datos[n].lugares) || {}).sort((a, c) => c[1] - a[1])[0]; return b && b[1] > 20 ? { x: b[0].split(',')[0] * 32 + 16, z: b[0].split(',')[1] * 32 + 16 } : null; },
    rencor: (n) => (datos[n] ? datos[n].mato * 2 + datos[n].trampas : 0),
    tactica: (n, k) => {
      const r = (recT[n] = recT[n] || []);
      const u = r.find((x) => x.k === k);
      if (u && Date.now() - u.t < 15000) { u.t = Date.now(); return; }
      r.push({ k, t: Date.now() }); if (r.length > 8) r.shift();
      const j = get(n); j.tac = j.tac || {}; const a = (j.tac[k] = j.tac[k] || { u: 0, w: 0 }); a.u++; sucio = true;
    },
    victoria: (n, k) => { const j = get(n); j.tac = j.tac || {}; const a = (j.tac[k] = j.tac[k] || { u: 0, w: 0 }); a.w++; a.u = Math.max(a.u, a.w); sucio = true; },
    resultado: (n, gano) => {
      const j = get(n); j.tac = j.tac || {};
      for (const x of (recT[n] || []).filter((y) => Date.now() - y.t < 60000)) { const a = (j.tac[x.k] = j.tac[x.k] || { u: 1, w: 0 }); if (gano) a.w++; else a.w = Math.max(0, a.w - 0.5); }
      recT[n] = []; sucio = true;
    },
    mejor: (n) => { const t = (datos[n] && datos[n].tac) || {}; const l = Object.entries(t).filter(([, a]) => a.u >= 3).sort((a, b) => b[1].w / b[1].u - a[1].w / a[1].u); return l.length ? l[0][0] : null; },
    arma: (n, item) => { if (!item) return; const a = get(n).armas; a[item] = (a[item] || 0) + 1; sucio = true; },
    // Observacion periodica del jugador: tags = ['escudo','arco','sprint','agachado','elytra',...], pos = {x,z}
    observa: (n, tags, pos) => {
      const j = get(n); j.n = (j.n || 0) + 1; j.ultima = Date.now(); sucio = true;
      for (const t of tags) j.obs[t] = (j.obs[t] || 0) + 1;
      if (pos) { const k = Math.floor(pos.x / 32) + ',' + Math.floor(pos.z / 32); j.lugares[k] = (j.lugares[k] || 0) + 1; }
    },
    // Porcentajes de cada tendencia (solo con datos suficientes): { escudo, arco, sprint, agachado, elytra, armaMain }
    perfil: (n) => {
      const j = datos[n];
      if (!j || !(j.n > 20)) return null;
      const r = {};
      for (const k of ['escudo', 'arco', 'sprint', 'agachado', 'elytra']) r[k] = Math.round(100 * (j.obs[k] || 0) / j.n);
      const arma = Object.entries(j.armas).sort((a, b) => b[1] - a[1])[0];
      r.arma = arma ? arma[0] : null;
      return r;
    },
    resumen: (n) => {
      const j = datos[n];
      if (!j) return '';
      const arma = Object.entries(j.armas).sort((a, b) => b[1] - a[1])[0];
      const pct = (k) => (j.n > 20 ? Math.round(100 * (j.obs[k] || 0) / j.n) : 0);
      const tend = ['escudo', 'arco', 'elytra', 'agachado', 'sprint'].filter((k) => pct(k) >= 15).map((k) => `${k}${pct(k)}%`).join(',');
      const base = Object.entries(j.lugares || {}).sort((a, b) => b[1] - a[1])[0];
      const zona = base && base[1] > 20 ? ` zona_habitual=${base[0].split(',').map((v) => v * 32 + 16).join(',')}(x,z)` : '';
      return `${j.visitas} visitas, visto hace ${dias(j.ultima)}d; murio ${j.muertes}x, me mato ${j.mato}x, ${j.trampas} trampas sufridas` + (j.dijo && j.dijo.length ? `; dijo: "${j.dijo[j.dijo.length - 1].s}" hace ${dias(j.dijo[j.dijo.length - 1].t)}d` : '') + (arma ? `; usa ${arma[0]}` : '') + (j.tac && Object.keys(j.tac).length ? '; tacticas(exito/usos): ' + Object.entries(j.tac).map(([k, a]) => `${k} ${Math.round(a.w * 10) / 10}/${a.u}`).join(',') : '') + (tend ? `; tendencias ${tend}` : '') + zona;
    },
    guardar,
    detener: () => { clearInterval(timer); guardar(); },
  };
}
module.exports = { crearMemoria };
