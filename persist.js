// Persistencia entre despliegues (opt-in): el disco de Render es efimero. Si defines GITHUB_TOKEN (scope "gist") e IA_GIST_ID
// (un gist PRIVADO tuyo), los JSON de memoria del propio bot se sincronizan con ese gist: se restauran al arrancar (solo los
// que faltan en disco) y se guardan cada 5 min y al recibir SIGTERM. Solo se envian los archivos de memoria listados.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const TOKEN = process.env.GITHUB_TOKEN || process.env.IA_GIST_TOKEN, ID = process.env.IA_GIST_ID;
const URL_ = 'https://api.github.com/gists/' + ID;
const cab = () => ['-H', 'Authorization: Bearer ' + TOKEN, '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: am-bot'];
const activo = () => !!(TOKEN && ID);

function restaurar(rutas) {
  if (!activo()) return false;
  try {
    const g = JSON.parse(execFileSync('curl', ['-sS', '-m', '8', ...cab(), URL_], { encoding: 'utf8', timeout: 10000, maxBuffer: 30e6 }));
    let n = 0;
    for (const r of rutas) {
      const f = g.files && g.files[path.basename(r)];
      if (f && f.content && !f.truncated && !fs.existsSync(r)) { fs.writeFileSync(r, f.content); n++; }
    }
    console.log('[persist] restaurados ' + n + ' archivos del gist');
    return true;
  } catch (e) { console.log('[persist] restaurar fallo:', e.message); return false; }
}
function cuerpo(rutas) {
  const files = {}; let sig = '';
  for (const r of rutas) {
    try { const c = fs.readFileSync(r, 'utf8'); if (c) { files[path.basename(r)] = { content: c }; sig += c.length + ':' + c.slice(-30); } } catch (e) { /* aun no existe */ }
  }
  return { files, sig };
}
function guardarYa(rutas) {
  const { files } = cuerpo(rutas);
  if (!Object.keys(files).length) return;
  try { execFileSync('curl', ['-sS', '-m', '8', '-X', 'PATCH', ...cab(), '-d', '@-', URL_], { input: JSON.stringify({ files }), timeout: 10000, stdio: ['pipe', 'ignore', 'ignore'] }); } catch (e) { /* ignorar */ }
}
function iniciar(rutas, flush) {
  if (!activo()) { console.log('[persist] sin IA_GIST_ID/GITHUB_TOKEN: la memoria se pierde al redesplegar en Render'); return; }
  let ult = '';
  const t = setInterval(async () => {
    try { if (flush) flush(); } catch (e) { /* ignorar */ }
    const { files, sig } = cuerpo(rutas);
    if (sig === ult || !Object.keys(files).length) return;
    try {
      const r = await fetch(URL_, { method: 'PATCH', headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'am-bot' }, body: JSON.stringify({ files }) });
      if (r.ok) ult = sig; else require('./diag').log('warn', 'persist', 'gist HTTP ' + r.status);
    } catch (e) { require('./diag').log('warn', 'persist', 'gist: ' + e.message); }
  }, 300_000);
  if (t.unref) t.unref();
  process.once('SIGTERM', () => { try { if (flush) flush(); } catch (e) { /* ignorar */ } guardarYa(rutas); process.exit(0); });
}
module.exports = { restaurar, iniciar, activo };
