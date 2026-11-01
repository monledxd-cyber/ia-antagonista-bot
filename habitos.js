const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function crearHabitos(bot, memoria, o) {
  o = o || {};
  const est = new Map();
  const hpDe = (e) => (e.metadata && typeof e.metadata[9] === 'number' ? e.metadata[9] : null);
  function muestra(e, ahora) {
    const yo = bot.entity.position, p = e.position;
    let s = est.get(e.username);
    if (!s || ahora - s.t > 2000) { est.set(e.username, { t: ahora, x: p.x, z: p.z, dy: dist2(p, yo), signo: 0, rev: 0, seg: 0, bajo: 0, retira: 0 }); return; }
    const dt = (ahora - s.t) / 1000;
    const mx = p.x - s.x, mz = p.z - s.z, rx = p.x - yo.x, rz = p.z - yo.z, rd = Math.hypot(rx, rz) || 1;
    const rad = (mx * rx + mz * rz) / rd, lat = (-mx * rz + mz * rx) / rd;
    const v = Math.hypot(mx, mz) / dt;
    const d = rd;
    if (d < 7 && v > 0.8) {
      const sg = Math.abs(lat / dt) > 0.7 ? Math.sign(lat) : 0;
      if (sg && s.signo && sg !== s.signo) s.rev++;
      if (sg) s.signo = sg;
      s.seg += dt;
    }
    const hp = hpDe(e);
    if (hp !== null && hp <= 8 && d < 12 && v > 0.8) { s.bajo += dt; if (rad / dt > 0.8) s.retira += dt; }
    s.t = ahora; s.x = p.x; s.z = p.z;
  }
  function cerrar(n) {
    const s = est.get(n); if (!s) return;
    if (s.seg >= 3) memoria.habito(n, 'zigzag', Math.min(1, s.rev / s.seg / 1.5));
    if (s.bajo >= 1.5) memoria.habito(n, 'retira', Math.min(1, s.retira / s.bajo));
    est.delete(n);
  }
  const tick = (ahora) => {
    if (!bot.entity) return;
    const t = bot.pvp && bot.pvp.target;
    const activos = new Set();
    for (const e of Object.values(bot.entities)) {
      if (e.type !== 'player' || !e.username || e.username === bot.username || !e.position) continue;
      if (e.position.distanceTo(bot.entity.position) > 14) continue;
      if (!(t && t.username === e.username) && !(est.has(e.username))) { if (e.position.distanceTo(bot.entity.position) > 8) continue; }
      activos.add(e.username); muestra(e, ahora);
    }
    for (const n of [...est.keys()]) if (!activos.has(n)) cerrar(n);
  };
  const it = setInterval(() => tick(Date.now()), o.ms || 250);
  if (it.unref) it.unref();
  bot.once('end', () => { clearInterval(it); for (const n of [...est.keys()]) cerrar(n); });
  return { cerrar, tick, detener: () => clearInterval(it) };
}
module.exports = { crearHabitos };
