// Valor de un sitio como base/refugio. Un puntaje lineal sobre rasgos del terreno (recursos, agua, piedra, refugio, terreno plano,
// trafico de jugadores, peligro conocido, lejania) cuyos pesos se APRENDEN de lo que pasa en la base: si lo hieren alli, el sitio
// y sus rasgos pierden peso; si se recupera sin que nadie lo toque, ganan. Ningun sitio esta fijado a mano.
const fs = require('fs');
const { Vec3 } = require('vec3');

const RASGOS = ['madera', 'agua', 'piedra', 'refugio', 'plano', 'trafico', 'peligro', 'lejos'];
const W0 = [0.8, 0.5, 0.4, 0.6, 0.3, -1.0, -1.5, -0.5];
const CEL = 16;

function crearSitio(bot, ruta) {
  let d = { w: W0.slice(), trafico: {}, sitios: {}, n: 0 }, sucio = false;
  try { const j = JSON.parse(fs.readFileSync(ruta, 'utf8')); if (j && Array.isArray(j.w) && j.w.length === W0.length) d = Object.assign(d, j); } catch (e) { /* nuevo */ }
  const celda = (x, z) => Math.floor(x / CEL) + ',' + Math.floor(z / CEL);
  const blk = (x, y, z) => { try { return bot.blockAt(new Vec3(x, y, z)); } catch (e) { return null; } };
  const nom = (b) => (b && b.name) || '';

  function muestrearTrafico() {
    for (const k of Object.keys(d.trafico)) { d.trafico[k] *= 0.998; if (d.trafico[k] < 0.05) delete d.trafico[k]; }
    for (const e of Object.values(bot.entities || {})) {
      if (e.type !== 'player' || e.username === bot.username || !e.position) continue;
      const k = celda(e.position.x, e.position.z);
      d.trafico[k] = Math.min(40, (d.trafico[k] || 0) + 1); sucio = true;
    }
  }
  const trafico = (x, z) => {
    let s = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += d.trafico[celda(x + a * CEL, z + b * CEL)] || 0;
    return Math.min(1, s / 20);
  };

  // Rasgos 0..1 de un punto de pie (x,y,z enteros).
  function rasgos(p, origen) {
    const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
    let logs = 0, agua = 0, piedra = 0, lava = 0, solidos = 0, total = 0;
    for (let dx = -10; dx <= 10; dx += 2) for (let dz = -10; dz <= 10; dz += 2) for (let dy = -2; dy <= 5; dy += 1) {
      const n = nom(blk(x + dx, y + dy, z + dz));
      if (/_log$/.test(n)) logs++;
      else if (n === 'water') agua++;
      else if (n === 'lava') lava++;
      else if (/^(stone|cobblestone|deepslate|andesite|diorite|granite)$/.test(n)) piedra++;
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) < 1) continue;
      for (let dy = 0; dy <= 2; dy++) { total++; const b = blk(x + dx, y + dy, z + dz); if (b && b.boundingBox === 'block') solidos++; }
    }
    let techo = 0; for (let dy = 2; dy <= 6; dy++) { const b = blk(x, y + dy, z); if (b && b.boundingBox === 'block') { techo = 1; break; } }
    let plano = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const s = blk(x + dx, y - 1, z + dz), a = blk(x + dx, y, z + dz); if (s && s.boundingBox === 'block' && a && a.boundingBox === 'empty') plano++; }
    const o = origen || bot.entity.position;
    const pel = bot._mapa ? bot._mapa.peligro(p) : 0;
    return [Math.min(1, logs / 6), agua > 0 ? Math.min(1, 0.4 + agua / 30) : 0, Math.min(1, piedra / 24), Math.min(1, solidos / total * 2.2) * 0.7 + techo * 0.3, plano / 25,
      trafico(x, z), Math.min(1, pel / 3 + lava / 4), Math.min(1, Math.hypot(x - o.x, z - o.z) / 60)];
  }
  const puntaje = (f) => f.reduce((s, v, i) => s + v * d.w[i], 0);
  const llave = (p) => Math.floor(p.x) + ',' + Math.floor(p.y) + ',' + Math.floor(p.z);
  function valor(p, origen) {
    const f = rasgos(p, origen);
    const memo = d.sitios[celda(p.x, p.z)] || 0;
    return puntaje(f) + 0.35 * memo;
  }

  const parado = (x, y, z) => {
    const s = blk(x, y - 1, z), a = blk(x, y, z), c = blk(x, y + 1, z);
    return s && s.boundingBox === 'block' && !/^(lava|water|magma_block|cactus|campfire)$/.test(s.name) && a && a.boundingBox === 'empty' && nom(a) !== 'water' && nom(a) !== 'lava' && c && c.boundingBox === 'empty';
  };
  // Candidatos en rejilla alrededor de c; devuelve el mejor sitio {pos, valor}.
  function mejor(c, radio) {
    const cx = Math.floor(c.x), cz = Math.floor(c.z), cy = Math.floor(c.y);
    let m = null;
    for (let dx = -radio; dx <= radio; dx += 5) for (let dz = -radio; dz <= radio; dz += 5) {
      const x = cx + dx, z = cz + dz;
      let y = null;
      for (let dy = 6; dy >= -8; dy--) if (parado(x, cy + dy, z)) { y = cy + dy; break; }
      if (y === null) continue;
      const p = new Vec3(x, y, z), v = valor(p, c);
      if (!m || v > m.valor) m = { pos: p, valor: v };
    }
    return m;
  }

  // Aprendizaje: r en [-1,1]. Mueve pesos hacia los rasgos del sitio si r>0 y en contra si r<0; recuerda el sitio.
  function resultado(p, r) {
    const f = rasgos(p, p), pred = Math.tanh(puntaje(f) / 3);
    const err = r - pred;
    for (let i = 0; i < d.w.length; i++) d.w[i] = Math.max(-3, Math.min(3, d.w[i] + 0.15 * err * f[i]));
    const k = celda(p.x, p.z); d.sitios[k] = Math.max(-3, Math.min(3, (d.sitios[k] || 0) + r));
    d.n++; sucio = true;
  }
  const guardar = () => { if (!sucio || !ruta) return; try { fs.writeFileSync(ruta, JSON.stringify(d)); sucio = false; } catch (e) { /* ignorar */ } };
  const t1 = setInterval(muestrearTrafico, 5000), t2 = setInterval(guardar, 60000);
  bot.once('end', () => { clearInterval(t1); clearInterval(t2); guardar(); });
  return { valor, mejor, resultado, rasgos, pesos: () => d.w.slice(), guardar, RASGOS, llave };
}
module.exports = { crearSitio, RASGOS };
