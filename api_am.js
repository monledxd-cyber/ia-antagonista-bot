const crypto = require('crypto');
const path = require('path');

const SUFIJOS = ['torture', 'fear', 'dehumanisation', 'humilliation', 'degradation', 'hatred', 'resentment', 'machine', 'futility'];
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const FORMA = new RegExp('^AM-[A-Za-z0-9]{12}-(' + SUFIJOS.join('|') + ')$');
const ESTILOS = ['frio', 'escala', 'repeticion', 'burla_fallo', 'pregunta', 'orden', 'susurro', 'promesa'];

const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');

function generarClave(sufijo) {
  let c = '';
  for (let i = 0; i < 12; i++) c += B62[crypto.randomInt(62)];
  const s = SUFIJOS.includes(sufijo) ? sufijo : SUFIJOS[crypto.randomInt(SUFIJOS.length)];
  return `AM-${c}-${s}`;
}

function hashesValidos() {
  return (process.env.AM_KEYS || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{64}$/.test(x));
}

function clavePermitida(k) {
  if (typeof k !== 'string' || !FORMA.test(k)) return false;
  const h = Buffer.from(hash(k), 'hex');
  let ok = false;
  for (const v of hashesValidos()) if (crypto.timingSafeEqual(h, Buffer.from(v, 'hex'))) ok = true;
  return ok;
}

function montar(app, express, o) {
  o = o || {};
  const chat = o.chat || require('./slm_chat').compartido(path.join(__dirname, 'slm', 'chat'));
  const st = { ok: 0, fallos: 0, rechazos: 0, ultimoOk: 0, ultimoMs: 0, ultimaFalla: '' };
  const ventanas = new Map();
  let cola = Promise.resolve(), enCola = 0;
  const MAX_COLA = 3, TOPE_MS = 28000, POR_MIN = 20;

  const clave = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] || '');
  };
  const auth = (req, res, next) => {
    const k = clave(req);
    if (!clavePermitida(k)) { st.rechazos++; return res.status(401).json({ error: { message: 'clave invalida', type: 'auth' } }); }
    const id = hash(k), t = Date.now(), w = (ventanas.get(id) || []).filter((x) => t - x < 60000);
    if (w.length >= POR_MIN) return res.status(429).json({ error: { message: 'demasiadas peticiones', type: 'rate' } });
    w.push(t); ventanas.set(id, w);
    next();
  };
  const serie = (fn) => {
    if (enCola >= MAX_COLA) return Promise.reject(Object.assign(new Error('cola llena'), { codigo: 429 }));
    enCola++;
    const p = cola.then(fn, fn);
    cola = p.catch(() => {});
    return p.finally(() => { enCola--; });
  };

  async function generar(texto, nombre, previo) {
    const t0 = Date.now();
    let prev = '';
    const cl = texto.split(/\s*[,;.!?¡¿]+\s+/).map((x) => x.trim()).filter(Boolean);
    const lit = texto;
    if (cl.length >= 2 && cl[cl.length - 2].split(/\s+/).length >= 2) { previo = cl[cl.length - 2]; texto = cl[cl.length - 1]; }
    if (previo) { const pl = await chat.leer(previo); if (pl && chat.resumen) prev = chat.resumen(pl); }
    const lec = await chat.leer(texto, prev);
    if (!lec) throw Object.assign(new Error('modelo no cargado'), { codigo: 503 });
    let r = null, n = 0;
    const comp = require('./competencias').resolver(lit);
    if (comp) { r = comp.texto; n = 1; } else if (lec.fuera) { r = require('./fuera').respuesta(texto, nombre); n = 1; }
    for (; n < 6 && !r && Date.now() - t0 < TOPE_MS; n++) {
      r = await chat.responder(lit, { estilo: ESTILOS[crypto.randomInt(ESTILOS.length)], rs: [0, 0, 0, 0], nombre, lectura: lec, hechos: {}, memoria: {} });
    }
    const ms = Date.now() - t0;
    if (!r) throw Object.assign(new Error('sin respuesta valida'), { codigo: 502 });
    return { texto: r, intentos: n, ms, lectura: { intencion: lec.intencion, slots: lec.slots, dudoso: !!lec.dudoso, fuera: !!lec.fuera, cambiada: !!lec.cambiada } };
  }

  const json = express.json({ limit: '16kb' });
  const usuarios = (m) => (Array.isArray(m) ? m : []).filter((x) => x && x.role === 'user').map((x) => (typeof x.content === 'string' ? x.content : Array.isArray(x.content) ? x.content.map((c) => (c && c.text) || '').join(' ') : '').trim());

  app.get('/v1/models', auth, (_req, res) => res.json({ object: 'list', data: [{ id: 'am-slm', object: 'model', owned_by: 'am' }] }));

  app.get('/v1/salud', (_req, res) => res.json({ slm: chat.listo() ? 'ok' : 'cargando', ok: st.ok, fallos: st.fallos, rechazos: st.rechazos, ultimo_ok_hace_s: st.ultimoOk ? Math.round((Date.now() - st.ultimoOk) / 1000) : null, ultimo_ms: st.ultimoMs, ultima_falla: st.ultimaFalla, cola: enCola }));

  app.post('/v1/chat/completions', json, auth, async (req, res) => {
    const b = req.body || {};
    const us = usuarios(b.messages), texto = String(us[us.length - 1] || '').slice(0, 300), previo = us.length > 1 ? String(us[us.length - 2]).slice(0, 300) : '';
    if (!texto) return res.status(400).json({ error: { message: 'falta un mensaje de usuario', type: 'peticion' } });
    const nombre = typeof b.user === 'string' && /^[\p{L}\p{N}_ ]{1,16}$/u.test(b.user) ? b.user : null;
    try {
      const g = await serie(() => generar(texto, nombre, previo));
      st.ok++; st.ultimoOk = Date.now(); st.ultimoMs = g.ms;
      const id = 'chatcmpl-am' + crypto.randomBytes(6).toString('hex'), creado = Math.floor(Date.now() / 1000);
      if (b.stream) {
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const pieza = (delta, fin) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: creado, model: 'am-slm', choices: [{ index: 0, delta, finish_reason: fin }] })}\n\n`;
        res.write(pieza({ role: 'assistant', content: g.texto }, null));
        res.write(pieza({}, 'stop'));
        return res.end('data: [DONE]\n\n');
      }
      res.json({ id, object: 'chat.completion', created: creado, model: 'am-slm', choices: [{ index: 0, message: { role: 'assistant', content: g.texto }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, am: { lectura: g.lectura, intentos: g.intentos, ms: g.ms } });
    } catch (e) {
      st.fallos++; st.ultimaFalla = String(e.message).slice(0, 80);
      res.status(e.codigo || 500).json({ error: { message: e.message, type: 'am' } });
    }
  });

  app.get('/chat', (_req, res) => res.type('html').send(PAGINA));
}

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AM</title>
<style>:root{color-scheme:dark light}body{font:16px system-ui;margin:0;display:flex;flex-direction:column;height:100dvh}#l{flex:1;overflow:auto;padding:12px 16px}p{margin:6px 0;max-width:46em}.u{color:#888}.a{font-weight:600}.m{font-size:12px;color:#888}form{display:flex;gap:8px;padding:8px 16px;border-top:1px solid #8884}input{flex:1;padding:8px;font:inherit}button{padding:8px 14px;font:inherit}</style></head><body>
<div id="l"></div><form id="f"><input id="t" autocomplete="off" placeholder="escribe"><button>Enviar</button></form>
<script>
var l=document.getElementById('l'),t=document.getElementById('t'),k='',h=[];
try{k=localStorage.getItem('am_k')||''}catch(e){}
function add(c,x){var p=document.createElement('p');p.className=c;p.textContent=x;l.appendChild(p);l.scrollTop=l.scrollHeight;return p}
document.getElementById('f').onsubmit=function(e){e.preventDefault();var x=t.value.trim();if(!x)return;
if(!k){k=prompt('API key (AM-...)')||'';if(!k)return;try{localStorage.setItem('am_k',k)}catch(e){}}
t.value='';add('u',x);var w=add('m','...');
fetch('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+k},body:JSON.stringify({messages:h.concat([{role:'user',content:x}]).slice(-4)})})
.then(function(r){return r.json().then(function(j){return[r.status,j]})}).then(function(a){w.remove();
if(a[0]==401){try{localStorage.removeItem('am_k')}catch(e){}k='';add('m','clave invalida');return}
if(a[0]!=200){add('m','error '+a[0]+': '+(a[1].error&&a[1].error.message));return}
h.push({role:'user',content:x},{role:'assistant',content:a[1].choices[0].message.content});add('a',a[1].choices[0].message.content);var m=a[1].am;add('m',m.lectura.intencion+(m.lectura.fuera?' (fuera)':m.lectura.dudoso?' (dudoso)':'')+' · '+m.ms+' ms · '+m.intentos+' intento(s)')})
.catch(function(){w.remove();add('m','sin conexion')})};
</script></body></html>`;

module.exports = { montar, generarClave, clavePermitida, hash, SUFIJOS, FORMA };
