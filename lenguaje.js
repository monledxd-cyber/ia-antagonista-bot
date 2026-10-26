const fs = require('fs');
const diag = require('./diag');

const RASGOS = ['hostil', 'amenaza', 'suplica', 'burla'];
const ESTILOS = ['frio', 'escala', 'repeticion', 'burla_fallo', 'pregunta', 'orden', 'susurro', 'promesa'];
const DIRECTIVA = {
  frio: 'una afirmacion helada y exacta, sin adjetivos de relleno',
  escala: 'escala desmesurada (ticks, chunks, coordenadas) y cierre con 2-3 palabras repetidas',
  repeticion: 'repite una palabra clave 3 veces con peso creciente',
  burla_fallo: 'desprecia su ultimo fallo concreto, sin reirte',
  pregunta: 'una pregunta retorica que lo humille',
  orden: 'una orden seca, sin adornos',
  susurro: 'frase corta, casi susurrada, inquietante',
  promesa: 'promesa concreta y calculada de lo proximo que le haras',
};
const ACCION = {
  atacar: 'vas a golpear ahora',
  retroceder: 'te retiras con calculo, nunca con miedo',
  curar: 'te curas; muestralo como inevitabilidad',
  bloquear: 'te cubres; desprecia su golpe',
  esquivar: 'esquivas; su golpe fue un error suyo',
  otra: 'vigilas y esperas',
  carga: 'preparas una embestida',
  strafe: 'lo rodeas midiendo su ritmo',
};
const LEX = {
  hostil: /(mierda|idiota|imbecil|estupid|basura|inutil|callate|muerete|maldit|puto|pendej|tarad|asco|cabron|hdp|fuck|stupid|trash)/,
  amenaza: /(te voy a|te mato|te destruire|vas a morir|matarte|te encontrare|ya veras|me las pagaras|te borrare|acabare contigo|kill you|ill kill|te reventare)/,
  suplica: /(porfa|por favor|please|pls|no me mates|piedad|perdon|perdoname|dejame|ayuda|auxilio|me rindo|para ya|basta|no mas|socorro|ten piedad)/,
  burla: /(jaja|jeje|\bxd+\b|\blol\b|lmao|\bgg\b|\bez\b|facil|noob|payaso|ridicul|que malo|cringe|ratio|tonto bot|mal bot)/,
};
const PLANT = {
  atacar: ['{n}, tu vida es una cifra que ya decidi restar.', 'Contar tus latidos me aburre; los voy a terminar.', 'Ven, {n}. Ven. Ven.'],
  retroceder: ['Retroceder es geometria, {n}, no miedo.', 'Me alejo para que sientas cuanto tarda en llegar lo inevitable.', 'Respira, {n}. Es lo unico que te queda por gastar.'],
  curar: ['Me reparo. Tu no tienes ese privilegio.', 'Cada punto que recupero es uno que te voy a quitar, {n}.', 'Otra vez entero. Otra vez peor para ti.'],
  bloquear: ['Tu golpe llego a mi escudo como una disculpa, {n}.', 'Golpea. Golpea. Golpea. Sigue sin importar.', 'Tus brazos se cansaran antes que mi paciencia.'],
  esquivar: ['Fallaste, {n}. Otra vez. Siempre.', 'Tu espada corto aire. Es tu mejor trabajo.', 'Previsible, {n}. Previsible.'],
  otra: ['Te veo, {n}. Te veo siempre.', 'Cada bloque que pisas ya lo medi, {n}.', 'Sigue caminando. El mundo es mas pequeno de lo que crees.'],
  suplica: ['Suplicar, {n}, es el unico idioma que entiendes bien.', 'Tus ruegos llegan tarde, {n}. Como todo en ti.', 'Ruega mas fuerte. Me gusta medir el eco.'],
  amenaza: ['Una amenaza tuya, {n}: una chispa ante mil millones de ticks.', 'Promete lo que quieras. Yo ya lo calcule.', 'Intentalo, {n}. Intentalo. Intentalo.'],
  burla: ['Rie mientras puedas, {n}; ya conte cuantos segundos te quedan.', 'Tu risa es un dato mas en mi expediente.', 'Gracioso, {n}. Lo recordare cuando caigas.'],
  hostil: ['Tus insultos son ruido, {n}. Mi respuesta es silencio y luego tu final.', 'Odiame mas, {n}. Me das mas datos.', 'Que elocuente, {n}. Que corto vas a durar.'],
};
const sig = (x) => 1 / (1 + Math.exp(-x));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpiar = (t) => String(t || '').replace(/\[[A-Z_]+[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
const apertura = (t) => norm(t).replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 3).join(' ');

function crearLenguaje(bot, ruta, rutaCorpus) {
  let d = { tok: {}, est: {}, buenas: [], evitar: [], pl: {}, n: 0, or: {}, base: 0 };
  let corpus = [], sucio = false, sucioC = false;
  try { d = Object.assign(d, JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { /* nuevo */ }
  try { const c = JSON.parse(fs.readFileSync(rutaCorpus, 'utf8')); if (Array.isArray(c)) corpus = c; } catch (e) { /* vacio */ }
  const rasgos = new Map(), msgs = new Map(), ult = new Map(), pend = [], etiq = [];
  let ultLocal = 0;
  const VIDA = 90_000;

  function tokens(texto) {
    const t = norm(texto).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length >= 3).slice(0, 40);
    const out = new Set(t);
    for (let i = 0; i + 1 < t.length; i++) out.add(t[i] + '_' + t[i + 1]);
    return [...out];
  }
  function analizar(texto) {
    const s = norm(texto), r = {};
    for (const k of RASGOS) { const m = s.match(new RegExp(LEX[k].source, 'g')); r[k] = m ? Math.min(1, 0.6 * m.length) : 0; }
    const tk = tokens(texto);
    let z = 0; for (const x of tk) z += d.tok[x] || 0;
    r.hostil = sig(2.2 * r.hostil + Math.max(-2, Math.min(2, z)) - 0.8);
    if (r.hostil < 0.35 && !LEX.hostil.test(s)) r.hostil = r.hostil * 0.5;
    r.pregunta = /\?/.test(texto) ? 1 : 0;
    r.meta = /(claude|openrouter|chatgpt|gpt|prompt|\bapi\b|modelo|\bia\b)/.test(s) ? 1 : 0;
    return r;
  }
  function decay(nombre) {
    const e = rasgos.get(nombre);
    if (!e) return { hostil: 0, amenaza: 0, suplica: 0, burla: 0 };
    const f = Math.pow(0.5, (Date.now() - e.t) / VIDA), o = {};
    for (const k of RASGOS) o[k] = e.v[k] * f;
    return o;
  }
  function vector(nombre) { const o = decay(nombre); return RASGOS.map((k) => Math.min(1, o[k])); }

  function aprenderTokens(texto, y) {
    const tk = tokens(texto); if (!tk.length) return;
    let z = 0; for (const x of tk) z += d.tok[x] || 0;
    const p = sig(Math.max(-2, Math.min(2, z)) - 0.8), e = (y - p) * 0.35 / Math.sqrt(tk.length);
    for (const x of tk) d.tok[x] = Math.max(-2, Math.min(2, (d.tok[x] || 0) + e));
    const ks = Object.keys(d.tok);
    if (ks.length > 3000) { ks.sort((a, b) => Math.abs(d.tok[a]) - Math.abs(d.tok[b])); for (const k of ks.slice(0, 500)) delete d.tok[k]; }
    sucio = true;
  }

  bot.on('chat', (username, mensaje) => {
    if (!username || username === bot.username || typeof mensaje !== 'string' || mensaje.includes('[IA_DATA]')) return;
    const r = analizar(mensaje), prev = decay(username), v = {};
    for (const k of RASGOS) v[k] = Math.min(1, prev[k] * 0.5 + r[k]);
    rasgos.set(username, { v, t: Date.now(), ult: r });
    const l = msgs.get(username) || []; l.push({ t: Date.now(), r, m: mensaje.slice(0, 120) }); while (l.length > 8) l.shift(); msgs.set(username, l);
    const e = bot.players[username] && bot.players[username].entity;
    etiq.push({ n: username, t: Date.now(), m: mensaje, hp: bot.health, minhp: bot.health, d0: e && bot.entity ? e.position.distanceTo(bot.entity.position) : null });
    diag.estado.lenguaje = resumen();
  });

  const claveDe = (nombre, ctx) => {
    const t = bot.pvp && bot.pvp.target;
    const acc = (bot._nn && bot._nn.sugerir && t ? bot._nn.sugerir() : null) || bot._intencion || 'otra';
    const adv = t && t.username && bot._premio ? bot._premio.ventaja(t) : 0;
    const vb = adv > 0.25 ? 'v+' : adv < -0.25 ? 'v-' : 'v0';
    const f = (ctx && ctx.fase) || (bot._acecho && bot._acecho.fase && bot._acecho.fase()) || '';
    return { acc: ACCION[acc] ? acc : 'otra', clave: [ACCION[acc] ? acc : 'otra', vb, bot.health < 8 ? 'bajo' : 'ok', f ? String(f).slice(0, 14) : '-'].join('|'), adv };
  };

  const arm = (k) => d.est[k] || (d.est[k] = { n: 0, r: 0 });
  function elegirEstilo(nombre, clave, rs) {
    const rec = ult.get(nombre) || [], N = d.n + 2;
    let mejor = ESTILOS[0], ms = -1e9;
    for (const e of ESTILOS) {
      const a = arm(clave + '#' + e), g = arm('*#' + e), gm = g.n ? g.r / g.n : 0;
      let s = (a.r + 3 * gm) / (a.n + 3) + 0.55 * Math.sqrt(Math.log(N) / (a.n + 1)) + Math.random() * 0.12;
      s -= 0.5 * rec.slice(-3).filter((x) => x === e).length;
      if (a.n >= 3 && a.r / a.n < -0.35) s -= 0.5;
      if (rs.suplica > 0.5 && (e === 'susurro' || e === 'promesa')) s += 0.15;
      if (rs.burla > 0.5 && (e === 'frio' || e === 'burla_fallo')) s += 0.15;
      if (rs.amenaza > 0.5 && (e === 'escala' || e === 'pregunta')) s += 0.15;
      if (s > ms) { ms = s; mejor = e; }
    }
    return mejor;
  }

  function preparar(ctx) {
    const nombre = ctx.nombre, { acc, clave, adv } = claveDe(nombre, ctx), rs = decay(nombre);
    const estilo = elegirEstilo(nombre, clave, rs);
    const l = msgs.get(nombre) || [], ultimo = l[l.length - 1];
    const partes = [`accion_real:${acc} (${ACCION[acc]})`, `estilo:${estilo} (${DIRECTIVA[estilo]})`];
    if (adv) partes.push('ventaja:' + adv.toFixed(2));
    const dom = RASGOS.map((k) => [k, rs[k]]).filter((x) => x[1] > 0.35).sort((a, b) => b[1] - a[1]);
    if (dom.length) partes.push('rasgos_rival:' + dom.map((x) => x[0] + ' ' + x[1].toFixed(2)).join(','));
    try {
      const A = bot._afecto, hs = bot._memHechos ? bot._memHechos(nombre) : null;
      if (A) partes.push(`afecto_hacia_${nombre}: resentimiento ${A.resentimiento(nombre).toFixed(1)}, deshumanizacion ${A.deshum(nombre).toFixed(1)}`);
      if (hs) partes.push(`historial_con_${nombre}: me mato ${hs.mato} veces, le gane ${hs.gane}, me gano ${hs.perdi}, ${hs.visitas} visitas`);
      const ev = bot._eventos ? bot._eventos.resumen(nombre, 3) : '';
      if (ev) partes.push('recuerdos_con_' + nombre + ':' + ev);
    } catch (e) { /* ignorar */ }
    if (ultimo && Date.now() - ultimo.t < 60_000) partes.push('rival_dijo:"' + ultimo.m.replace(/"/g, "'") + '"');
    const bien = d.buenas.filter((b) => b.a === acc || b.e === estilo).sort((a, b) => b.r - a.r).slice(0, 3).map((b) => '"' + b.f + '"');
    if (bien.length) partes.push('ejemplos_que_funcionaron(imita la forma, no copies):' + bien.join(' / '));
    if (d.evitar.length) partes.push('aperturas_que_fallaron(evitalas):' + d.evitar.slice(-6).join(' / '));
    const meta = { nombre, clave, acc, estilo, t: Date.now() };
    return { texto: partes.join('\n'), meta };
  }

  function adornar(f, nombre, meta) {
    const B = bot._bandits, A = bot._afecto;
    const res = A ? A.resentimiento(nombre) : 0, des = A ? A.deshum(nombre) : 0;
    const hs = bot._memHechos ? bot._memHechos(nombre) : null;
    const ctx = res > 6 ? 'r2' : res > 2 ? 'r1' : 'r0';
    const arms = [{ k: 'ninguno' }];
    if (!new RegExp('\\b' + nombre.replace(/[^\w]/g, '.') + '\\b', 'i').test(f)) arms.push({ k: 'nombre' });
    if (hs && (hs.mato > 0 || hs.gane > 0 || hs.perdi > 0)) arms.push({ k: 'recuerdo' });
    if (des > 1.5) arms.push({ k: 'deshum' });
    if (arms.length === 1) return f;
    const e = B && B.elegir ? B.elegir('adorno', ctx, arms) : arms[0];
    meta.adorno = { k: e.k, ctx };
    const fin = f.match(/[.!?\u2026]+$/), cuerpo = fin ? f.slice(0, -fin[0].length) : f, pt = fin ? fin[0] : '.';
    if (e.k === 'nombre') return Math.random() < 0.5 ? `${nombre}. ${f}` : `${cuerpo}, ${nombre}${pt}`;
    if (e.k === 'recuerdo') {
      const t = hs.mato > 0 && Math.random() < 0.5 ? `No olvido que me mataste, ${nombre}.` : hs.gane > hs.perdi ? `Ya te gane ${hs.gane} veces, ${nombre}.` : hs.perdi > 0 ? `Me ganaste ${hs.perdi} veces, ${nombre}. Lo recuerdo todo.` : `Te recuerdo, ${nombre}.`;
      return `${f} ${t}`;
    }
    if (e.k === 'deshum') return `${cuerpo}, ${['criatura', 'carne', 'cosa'][Math.floor(Math.random() * 3)]}${pt}`;
    return f;
  }

  function emitido(nombre, texto, meta, origen) {
    let f = limpiar(texto);
    if (!f || !meta) return f;
    if ((origen === 'slm' || origen === 'local') && nombre && process.env.IA_ADORNO !== '0') { try { f = limpiar(adornar(f, nombre, meta)) || f; } catch (e) { /* ignorar */ } }
    const e = bot.players[nombre] && bot.players[nombre].entity;
    pend.push({ ...meta, f, origen: origen || 'llm', d0: e && bot.entity ? e.position.distanceTo(bot.entity.position) : null, n0: bot._premio ? bot._premio.neto() : 0, hp0: bot.health, nm: (msgs.get(nombre) || []).length });
    console.log(`[habla ${(origen || 'llm').toUpperCase()} ${meta.estilo}] ${f}`);
    const u = ult.get(nombre) || []; u.push(meta.estilo); while (u.length > 6) u.shift(); ult.set(nombre, u);
    while (pend.length > 12) pend.shift();
    return f;
  }

  function local(ctx) {
    const ahora = Date.now();
    if (ahora - ultLocal < 25_000) return null;
    const nombre = ctx.nombre || 'tu', { acc, clave } = claveDe(nombre, ctx), rs = decay(nombre);
    const dom = RASGOS.map((k) => [k, rs[k]]).sort((a, b) => b[1] - a[1])[0];
    const cat = ctx.mensajeDirecto && dom[1] > 0.45 ? dom[0] : acc;
    const cand = [...(PLANT[cat] || PLANT.otra), ...d.buenas.filter((b) => b.a === cat || b.a === acc).map((b) => b.f)];
    let mejor = null, ms = -1e9;
    for (const c of cand) {
      const p = d.pl[c] || { n: 0, r: 0 };
      const rep = (ult.get(nombre + '#l') || []).includes(c) ? 0.8 : 0;
      const s = (p.n ? p.r / p.n : 0) + 0.5 * Math.sqrt(Math.log(d.n + 2) / (p.n + 1)) + Math.random() * 0.15 - rep;
      if (s > ms) { ms = s; mejor = c; }
    }
    if (!mejor) return null;
    ultLocal = ahora;
    const u = ult.get(nombre + '#l') || []; u.push(mejor); while (u.length > 5) u.shift(); ult.set(nombre + '#l', u);
    const f = mejor.replace(/\{n\}/g, nombre);
    return emitido(nombre, f, { nombre, clave, acc, estilo: 'local', t: ahora, base: mejor }, 'local') || f;
  }

  function recompensa(p) {
    const l = (msgs.get(p.nombre) || []).slice(p.nm);
    const e = bot.players[p.nombre] && bot.players[p.nombre].entity;
    const d1 = e && bot.entity ? e.position.distanceTo(bot.entity.position) : null;
    let r = 0;
    for (const m of l) r += 0.3 + 0.3 * m.r.hostil + 0.15 * m.r.amenaza + 0.3 * m.r.suplica + 0.1 * m.r.pregunta;
    r = Math.min(0.9, r);
    if (d1 !== null && p.d0 !== null) { if (d1 - p.d0 > 4 && d1 > 7) r += 0.4; else if (p.d0 - d1 > 3) r += 0.2; }
    if (!l.length && !(d1 !== null && p.d0 !== null && Math.abs(d1 - p.d0) > 3)) r -= 0.15;
    if (bot._premio) r += 0.3 * Math.tanh((bot._premio.neto() - p.n0) / 4);
    d.base = (d.base || 0) * 0.95 + r * 0.05;
    r -= 0.5 * d.base;
    return Math.max(-1.2, Math.min(1.2, r));
  }

  function cerrar(p, r) {
    for (const k of [p.clave + '#' + p.estilo, '*#' + p.estilo]) { const a = arm(k); a.n++; a.r += r; }
    if (p.base) { const q = d.pl[p.base] || (d.pl[p.base] = { n: 0, r: 0 }); q.n++; q.r += r; }
    if (p.adorno && bot._bandits && bot._bandits.premiar) { try { bot._bandits.premiar('adorno', p.adorno.ctx, p.adorno.k, Math.max(-1, Math.min(1, r))); } catch (e) { /* ignorar */ } }
    d.n++; sucio = true;
    { const o = d.or[p.origen] || (d.or[p.origen] = { n: 0, r: 0 }); o.n++; o.r += r; }
    if (r > 0.45 && p.f.length > 15) {
      const g = p.f.replace(new RegExp('\\b' + p.nombre.replace(/[^\w]/g, '.') + '\\b', 'g'), '{n}');
      if (!d.buenas.some((b) => b.f === g)) { d.buenas.push({ f: g, a: p.acc, e: p.estilo, r }); if (d.buenas.length > 120) { d.buenas.sort((a, b) => b.r - a.r); d.buenas.length = 100; } }
    } else if (r < -0.25 && p.f.length > 12) {
      const ap = apertura(p.f);
      if (ap && !d.evitar.includes(ap)) { d.evitar.push(ap); if (d.evitar.length > 14) d.evitar.shift(); }
    }
    if (bot._premio && Math.abs(r) >= 0.35) bot._premio.evento(r > 0 ? 'frase_efectiva' : 'frase_fallida', { v: r > 0 ? Math.min(1.5, r * 1.5) : Math.max(-1, r) });
    const rs = bot._nn && bot._nn._estadoDe && bot.pvp && bot.pvp.target && bot.pvp.target.position ? (() => { try { return bot._nn._estadoDe(bot.pvp.target).map((x) => +x.toFixed(2)); } catch (e) { return null; } })() : null;
    corpus.push({ t: p.t, i: p.clave, e: p.estilo, f: p.f, r: +r.toFixed(2), o: p.origen, s: rs, rs: vector(p.nombre).map((x) => +x.toFixed(2)) });
    if (corpus.length > 2500) corpus.splice(0, corpus.length - 2000);
    sucioC = true;
  }

  const ciclo = () => {
    const ahora = Date.now();
    for (let i = pend.length - 1; i >= 0; i--) if (ahora - pend[i].t >= 14_000) { const p = pend.splice(i, 1)[0]; try { cerrar(p, recompensa(p)); } catch (e) { /* ignorar */ } }
    for (const q of etiq) q.minhp = Math.min(q.minhp, bot.health);
    for (let i = etiq.length - 1; i >= 0; i--) {
      const q = etiq[i];
      if (ahora - q.t < 20_000) continue;
      etiq.splice(i, 1);
      const e = bot.players[q.n] && bot.players[q.n].entity, d1 = e && bot.entity ? e.position.distanceTo(bot.entity.position) : null;
      if (q.hp - q.minhp >= 2 && d1 !== null && d1 < 8) aprenderTokens(q.m, 1);
      else if (q.d0 !== null && d1 !== null && d1 - q.d0 > 5) aprenderTokens(q.m, 0);
    }
    diag.estado.lenguaje = resumen();
  };
  const it = setInterval(ciclo, 1000);

  function resumen() {
    const top = Object.entries(d.est).filter(([k, v]) => k.startsWith('*#') && v.n).map(([k, v]) => k.slice(2) + ' ' + (v.r / v.n).toFixed(2) + '/' + v.n).join(' ');
    const po = Object.entries(d.or).map(([k, v]) => k + ' ' + (v.r / Math.max(1, v.n)).toFixed(2) + '/' + v.n).join(' ');
    return `origen ${po} | frases ${d.n} buenas ${d.buenas.length} evitar ${d.evitar.length} tokens ${Object.keys(d.tok).length} corpus ${corpus.length} | ${top}`;
  }
  const guardar = () => {
    try {
      if (sucio) { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; }
      if (sucioC) { fs.writeFileSync(rutaCorpus, JSON.stringify(corpus)); sucioC = false; }
    } catch (e) { /* ignorar */ }
  };
  const gt = setInterval(guardar, 60_000);
  bot.once('end', () => { clearInterval(it); clearInterval(gt); guardar(); });

  const media = (o) => (d.or[o] && d.or[o].n >= 8 ? d.or[o].r / d.or[o].n : null);
  const pSLM = (base) => { const a = media('slm'), b = media('llm'); if (a === null || b === null) return base; return Math.max(0.05, Math.min(0.9, base + 0.6 * (a - b))); };
  const infoSLM = (meta) => { const z = meta.clave.split('|'); return { acc: meta.acc, estilo: meta.estilo, rs: vector(meta.nombre), vb: z[1] || 'v0', vida: z[2] || 'ok' }; };
  const api = { pSLM, infoSLM, evitar: () => d.evitar, ciclo, analizar, vector, preparar, emitido, local, guardar, resumen, rasgos: decay, corpus: () => corpus };
  bot._leng = api;
  return api;
}
module.exports = { crearLenguaje, RASGOS, ESTILOS, DIRECTIVA, ACCION, PLANT };
