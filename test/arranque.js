// Prueba de arranque real: levanta index.js contra un puerto cerrado y exige que NO lance excepciones al crear el bot
// (una excepcion ahi deja al bot conectado pero sin ningun manejador = "la IA no hace nada"). Uso: npm run test:arranque
const { spawn } = require('child_process');
const p = spawn('node', ['index.js'], { cwd: __dirname + '/..', env: { ...process.env, MC_HOST: '127.0.0.1', MC_PORT: '1', MC_BOT_USERNAME: 'am_test', OPENROUTER_API_KEY: 'x', PORT: '3989', IA_APRENDIZAJE: '/tmp/t_ap.json', IA_MEMORIA: '/tmp/t_mem.json', IA_BASE: '/tmp/t_base.json' } });
let out = '';
p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
setTimeout(() => {
  p.kill();
  if (/createBot lanzo excepcion|fatal evitado/.test(out)) { console.error('FALLO: excepcion al arrancar\n' + out.split('\n').filter((l) => /excepcion|fatal/.test(l)).join('\n')); process.exit(1); }
  if (!/error de conexion/.test(out)) { console.error('FALLO: no se registraron los manejadores del bot'); process.exit(1); }
  console.log('OK: arranque'); process.exit(0);
}, 7000);
