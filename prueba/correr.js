const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const segundos = Number(process.argv[2] || 60);
const escenario = process.argv[3] || 'base';
const puerto = Number(process.env.PRUEBA_PUERTO || 25599);

if (!fs.existsSync(path.join(__dirname, 'node_modules', 'flying-squid'))) execSync('npm install --no-audit --no-fund', { cwd: __dirname, stdio: 'inherit' });
if (!fs.existsSync(path.join(raiz, 'node_modules', 'mineflayer'))) execSync('npm install --no-audit --no-fund', { cwd: raiz, stdio: 'inherit' });

const tmp = path.join(os.tmpdir(), 'am_prueba_' + puerto);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
for (const f of fs.readdirSync(raiz)) if (/\.js$|^package(-lock)?\.json$/.test(f)) fs.copyFileSync(path.join(raiz, f), path.join(tmp, f));
fs.mkdirSync(path.join(tmp, 'test'), { recursive: true });
fs.symlinkSync(path.join(raiz, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');

const cache = path.join(__dirname, 'cache');
fs.mkdirSync(cache, { recursive: true });
for (const f of ['nn_am.json', 'nn_abasto_am.json']) if (fs.existsSync(path.join(cache, f))) fs.copyFileSync(path.join(cache, f), path.join(tmp, f));
const hijos = [];
const lineasBot = [];
const matar = () => { for (const h of hijos) { try { h.kill('SIGTERM'); } catch (e) { /* ignorar */ } } };
process.on('SIGINT', () => { matar(); process.exit(1); });

function esperar(h, marca, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('no apareció ' + marca)), ms);
    h.stdout.on('data', (d) => { if (String(d).includes(marca)) { clearTimeout(t); res(); } });
  });
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'servidor.js'), escenario, String(puerto)], { cwd: __dirname });
  hijos.push(srv);
  srv.stdout.on('data', (d) => { const s = String(d).trim(); if (s && s !== 'LISTO') console.log('[servidor] ' + s); });
  srv.stderr.on('data', (d) => console.log('[servidor!] ' + String(d).trim().slice(0, 200)));
  await esperar(srv, 'LISTO', 60000);

  const env = Object.assign({}, process.env, { MC_HOST: '127.0.0.1', MC_PORT: String(puerto), OPENROUTER_API_KEY: 'prueba', MC_BOT_USERNAME: 'am_prueba' });
  const bot = spawn(process.execPath, (process.env.PRUEBA_PROF ? ['--cpu-prof', '--cpu-prof-dir=' + process.env.PRUEBA_PROF] : []).concat(['index.js']), { cwd: tmp, env });
  hijos.push(bot);
  const recoger = (d) => { for (const l of String(d).split('\n')) if (l.trim()) lineasBot.push(l); };
  bot.stdout.on('data', recoger);
  bot.stderr.on('data', recoger);

  await new Promise((r) => setTimeout(r, segundos * 1000));
  matar();
  await new Promise((r) => setTimeout(r, 1500));
  for (const f of ['nn_am.json', 'nn_abasto_am.json']) if (fs.existsSync(path.join(tmp, f))) fs.copyFileSync(path.join(tmp, f), path.join(cache, f));

  const malas = /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|Cannot read|fatal evitado|UnhandledPromise|undefined is not|NaN/;
  const grupos = new Map();
  for (const l of lineasBot) if (malas.test(l) && !/^\s+at /.test(l)) { const k = l.replace(/\d+/g, 'N').slice(0, 150); grupos.set(k, (grupos.get(k) || 0) + 1); }
  const cuenta = (re) => lineasBot.filter((l) => re.test(l)).length;
  console.log(`\n== prueba ${escenario} ${segundos}s ==`);
  console.log(`lineas ${lineasBot.length} | conectado ${cuenta(/\[bot\] conectado/)} | pasos abasto ${cuenta(/\[abasto\] paso:/)} | muertes ${cuenta(/\[muerte\]/)} | atascos ${cuenta(/\[atasco\]/)} | tactica ${cuenta(/\[tactica\]/)} | percepcion ${cuenta(/\[percepcion\]/)}`);
  for (const k of ['[meta]', '[afecto]', '[atasco]', '[percepcion]', '[tactica]', '[muerte]', '[nado]']) { const l = lineasBot.filter((x) => x.includes(k)).slice(-2); for (const x of l) console.log('  ' + x.slice(0, 160)); }
  if (grupos.size) { console.log('\nERRORES:'); for (const [k, n] of [...grupos.entries()].sort((a, b) => b[1] - a[1])) console.log(`  x${n} ${k}`); }
  console.log(grupos.size ? '\nRESULTADO: FALLA' : '\nRESULTADO: OK');
  fs.writeFileSync(path.join(__dirname, 'ultima_prueba.log'), lineasBot.join('\n'));
  process.exit(grupos.size ? 1 : 0);
})().catch((e) => { console.log('FALLO PRUEBA: ' + e.message); matar(); process.exit(2); });
