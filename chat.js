const os = require('os');
const path = require('path');
const readline = require('readline');
const { EventEmitter } = require('events');
const tmp = fs => path.join(os.tmpdir(), 'am_chat_' + fs);
const bot = new EventEmitter();
bot.username = 'AM';
bot.entity = { position: { x: 0, y: 64, z: 0 } };
const leng = require('./lenguaje').crearLenguaje(bot, tmp('leng.json'), tmp('corpus.json'));
const psi = require('./psique').crearPsique(bot, tmp('psique.json'));
const { crearSLM } = require('./slm');
const slm = crearSLM(path.join(__dirname, 'slm'));
const gr = require('./slm/gramatica');
const chatM = require('./slm_chat').crearChat(path.join(__dirname, 'slm', 'chat'));
const { ESTILOS } = require('./lenguaje');
const nombre = process.env.USER_NAME || process.argv[2] || 'tu';
const PSIQUE_E = { odio: 'promesa', desprecio: 'frio', sadismo: 'susurro', dominio: 'orden', frustracion: 'escala', hastio: 'pregunta', fascinacion: 'susurro', frialdad: 'frio' };

const INT = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'slm', 'intenciones.json'), 'utf8'));
const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const recientes = [];
const sub = (t) => t.replace(/\{n\}/g, nombre);
const elegir = (a) => { const l = a.filter((x) => !recientes.includes(x)); const f = (l.length ? l : a)[Math.floor(Math.random() * (l.length ? l.length : a.length))]; recientes.push(f); if (recientes.length > 30) recientes.shift(); return f; };
const RIV = ['hostil', 'amenaza', 'suplica', 'burla'];

async function responder(texto) {
  const r = leng.analizar(texto);
  psi.rasgo(nombre, r);
  const rs = leng.vector(nombre).map((v, i) => Math.max(v, [r.hostil, r.amenaza, r.suplica, r.burla][i]));
  const dom = psi.dominante();
  let estilo = r.pregunta ? 'pregunta' : PSIQUE_E[dom] || ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
  if (!r.pregunta && Math.random() < 0.3) estilo = ESTILOS[Math.floor(Math.random() * ESTILOS.length)];
  await chatM.cargar();
  if (chatM.listo() && process.env.AM_BIBLIOTECA !== '1') {
    let m = null;
    for (let i = 0; i < 6 && !m; i++) m = await chatM.responder(texto, { estilo, rs, nombre });
    if (m) return { f: m, estilo: 'modelo:' + estilo, dom, rs };
  }
  const mx = Math.max(...rs), tr = RIV[rs.indexOf(mx)], S = gr.semilla();
  if (mx >= 0.5 && S.rival && S.rival[tr] && Math.random() < 0.85) return { f: sub(elegir(S.rival[tr])), estilo: 'rival:' + tr, dom, rs };
  const nt = normal(texto);
  for (const [k, v] of Object.entries(INT)) if (new RegExp(v.re).test(nt)) return { f: sub(elegir(v.r)), estilo: 'intencion:' + k, dom, rs };
  const f = await slm.generar({ acc: 'otra', estilo, rs, vb: 'v0', vida: 'ok', nombre, psique: dom }, {});
  return { f, estilo, dom, rs };
}

async function main() {
  await new Promise((r) => setTimeout(r, 400));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${nombre}> ` });
  const verbose = process.env.AM_DEBUG === '1';
  rl.prompt();
  for await (const l of rl) {
    const t = l.trim();
    if (t === '/salir') break;
    if (t) {
      const { f, estilo, dom, rs } = await responder(t);
      console.log('AM> ' + (f || '...'));
      if (verbose) console.log(`   [${estilo} | ${dom} | rs ${rs.map((x) => x.toFixed(1)).join(',')}]`);
    }
    rl.prompt();
  }
  process.exit(0);
}
main();
