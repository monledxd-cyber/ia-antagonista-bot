function auditar(d, nombres) {
  const r = { nunca: [], siempreFalla: [], dudosos: [], lentos: [], bien: [] };
  for (const n of [...nombres].sort()) {
    const h = d[n];
    if (!h || h.ok + h.fail + h.dudoso === 0) { r.nunca.push(n); continue; }
    const t = h.ok + h.fail + h.dudoso;
    if (h.ok === 0 && h.fail >= 5) r.siempreFalla.push(`${n} (${h.fail}x)`);
    else if (h.dudoso >= 5 && h.dudoso > h.ok * 2) r.dudosos.push(`${n} (${h.dudoso} sin cambio, ${h.ok} ok)`);
    else if (h.ms > 60000) r.lentos.push(`${n} (${Math.round(h.ms / 1000)}s)`);
    else r.bien.push(`${n} ${Math.round(100 * h.ok / t)}%`);
  }
  return r;
}

if (require.main === module) {
  const fs = require('fs');
  const ruta = process.argv[2] || 'habilidades_am.json';
  const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const nombres = Object.keys(d).filter((k) => !k.includes('@'));
  const r = auditar(d, nombres);
  for (const [k, v] of Object.entries(r)) console.log(k + ': ' + (v.join(', ') || '-'));
}
module.exports = { auditar };
