// Memoria de bloques clave: escanea alrededor (rapido, por paleta de ids) y recuerda donde vio menas, agua, lava y cofres.
const fs = require('fs');
const path = require('path');

function crearClaves(bot) {
  const ARCH = process.env.IA_CLAVES || path.join(__dirname, 'claves_am.json');
  const NOMBRES = ['iron_ore', 'deepslate_iron_ore', 'coal_ore', 'deepslate_coal_ore', 'diamond_ore', 'deepslate_diamond_ore', 'gold_ore', 'deepslate_gold_ore',
    'ancient_debris', 'lava', 'water', 'chest', 'barrel', 'crafting_table', 'furnace', 'obsidian'];
  const ids = () => NOMBRES.map((n) => bot.registry.blocksByName[n]).filter(Boolean).map((b) => b.id);
  let mapa = new Map(), sucio = false;
  try { for (const c of JSON.parse(fs.readFileSync(ARCH, 'utf8'))) mapa.set(c.x + ',' + c.y + ',' + c.z, c); } catch (e) { mapa = new Map(); }
  const escanear = () => {
    if (!bot.entity) return;
    let pos;
    try { pos = bot.findBlocks({ matching: ids(), maxDistance: 48, count: 150 }); } catch (e) { return; }
    for (const p of pos) {
      const b = bot.blockAt(p);
      if (!b) continue;
      if (b.name === 'lava' && b.metadata !== 0) continue;      // solo fuentes de lava
      if (b.name === 'water' && b.metadata !== 0) continue;     // solo fuentes de agua
      if (/^(water|lava)$/.test(b.name) && mapa.size > 300) continue; // no llenar la memoria de liquidos
      const k = p.x + ',' + p.y + ',' + p.z;
      if (!mapa.has(k)) { mapa.set(k, { x: p.x, y: p.y, z: p.z, name: b.name, t: Date.now() }); sucio = true; }
    }
    while (mapa.size > 500) { mapa.delete(mapa.keys().next().value); sucio = true; }
  };
  const t1 = setInterval(escanear, 8000);
  const t2 = setInterval(() => { if (sucio) { try { fs.writeFileSync(ARCH, JSON.stringify([...mapa.values()])); sucio = false; } catch (e) { /* disco de solo lectura */ } } }, 60_000);
  [t1, t2].forEach((t) => t.unref && t.unref());
  bot.once('end', () => { clearInterval(t1); clearInterval(t2); });
  return {
    cercano(re, desde, max = 150, peligro) {
      let mejor = null, md = max;
      for (const c of mapa.values()) {
        if (!re.test(c.name) || (peligro && peligro(c, 12))) continue;
        const d = Math.hypot(c.x - desde.x, c.y - desde.y, c.z - desde.z);
        if (d < md) { md = d; mejor = c; }
      }
      return mejor;
    },
    olvidar(c) { mapa.delete(c.x + ',' + c.y + ',' + c.z); sucio = true; },
    cuantos: () => mapa.size,
    escanear,
  };
}
module.exports = { crearClaves };
