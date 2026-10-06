// Conocimiento de bloques para disenar trampas: revisa un plano ANTES de ejecutarlo, simulandolo sobre el mundo real.
// Detecta los errores clasicos: madera junto a lava, TNT junto a lava, placas sobre losas, pistones que no empujan,
// bloques con gravedad sobre el vacio, agua mezclada con lava... y devuelve el motivo para que la IA lo corrija.
const { Vec3 } = require('vec3');

const MADERA = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo)_/;
const INFLAMABLE = /(^|_)(wool|carpet|leaves|hay_block|bookshelf|vine|tnt|scaffolding|dried_kelp_block)$|(_planks|_log|_wood|_slab|_stairs|_fence|_fence_gate|_door|_trapdoor|_sign)$/;
const GRAVEDAD = /^(sand|red_sand|gravel|anvil|chipped_anvil|damaged_anvil|dragon_egg)$|_concrete_powder$/;
const INMOVIBLE = /^(obsidian|crying_obsidian|bedrock|respawn_anchor|reinforced_deepslate|barrier|enchanting_table|ender_chest|end_portal_frame|command_block)$/;
const FUENTE = /^(redstone_block|redstone_torch|redstone_wall_torch|lever|observer|target)$/;
const LLENO = [0, 0, 0, 1, 1, 1];

function crearAnalizador(registry, mundo) {
  const info = (n) => registry.blocksByName[n];
  const cs = registry.blockCollisionShapes;
  const esInflamable = (n) => !!n && (INFLAMABLE.test(n) && (MADERA.test(n) || !/_(slab|stairs|fence|fence_gate|door|trapdoor|sign|planks|log|wood)$/.test(n)));
  // Cubo completo en TODOS sus estados (las losas y escaleras no lo son).
  const cuboCompleto = (n) => {
    const id = cs && cs.blocks[n];
    if (id === undefined) return false;
    return (Array.isArray(id) ? id : [id]).every((i) => {
      const sh = cs.shapes[i];
      return sh && sh.length === 1 && sh[0].every((v, k) => v === LLENO[k]);
    });
  };
  // Solo un cubo completo y opaco conduce la redstone (cristal, hojas, hielo, slime, losas y escaleras no).
  const conductor = (n) => cuboCompleto(n) && !(info(n) && info(n).transparent);
  const base = (spec) => String(spec).split('[')[0];
  const estado = (spec, k) => { const m = String(spec).match(new RegExp('[\\[,]' + k + '=([a-z_0-9]+)')); return m ? m[1] : null; };

  // Aplica el plano sobre una copia virtual. cmds: setblock/fill/summon ya validados, con coordenadas ~ relativas.
  function simular(cmds, ancla) {
    const mapa = new Map();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const ops = [];
    const rel = (tok, o) => o + (tok === '~' ? 0 : Number(tok.slice(1)));
    for (const c of cmds) {
      const t = c.split(/\s+/);
      if (t[0] === 'setblock') {
        const x = rel(t[1], ancla.x), y = rel(t[2], ancla.y), z = rel(t[3], ancla.z);
        mapa.set(key(x, y, z), t[4]);
        ops.push({ x, y, z, spec: t[4] });
      } else if (t[0] === 'fill') {
        const a = [rel(t[1], ancla.x), rel(t[2], ancla.y), rel(t[3], ancla.z)];
        const b = [rel(t[4], ancla.x), rel(t[5], ancla.y), rel(t[6], ancla.z)];
        const lo = a.map((v, i) => Math.min(v, b[i])), hi = a.map((v, i) => Math.max(v, b[i]));
        const modo = t[8] || 'replace';
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
          const borde = x === lo[0] || x === hi[0] || y === lo[1] || y === hi[1] || z === lo[2] || z === hi[2];
          if (modo === 'hollow') mapa.set(key(x, y, z), borde ? t[7] : 'air');
          else if (modo === 'outline') { if (borde) mapa.set(key(x, y, z), t[7]); }
          else if (modo === 'keep') { if (!mapa.has(key(x, y, z)) && (mundo(x, y, z) || { name: 'air' }).name === 'air') mapa.set(key(x, y, z), t[7]); }
          else mapa.set(key(x, y, z), t[7]);
        }
        ops.push({ x: lo[0], y: lo[1], z: lo[2], spec: t[7], fill: true });
      }
    }
    return { mapa, ops, key };
  }

  function evaluar(cmds, ancla) {
    const errores = [], avisos = [];
    const { mapa, ops, key } = simular(cmds, ancla);
    const nombreEn = (x, y, z) => {
      const v = mapa.get(key(x, y, z));
      if (v !== undefined) return base(v);
      const b = mundo(x, y, z);
      return b ? b.name : 'desconocido';
    };
    const especEn = (x, y, z) => mapa.get(key(x, y, z)) || nombreEn(x, y, z);
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const aire = (n) => n === 'air' || n === 'cave_air' || n === 'void_air';
    const nuevo = (m) => [...m.entries()];

    // 0. Bloques inexistentes
    const vistos = new Set();
    for (const [, spec] of nuevo(mapa)) {
      const n = base(spec);
      if (!vistos.has(n)) { vistos.add(n); if (!info(n)) errores.push(`el bloque "${n}" no existe en 1.21.4`); }
    }

    for (const [k, spec] of nuevo(mapa)) {
      const [x, y, z] = k.split(',').map(Number);
      const n = base(spec);

      // 1. Lava + inflamables (la lava prende fuego a su alrededor, hasta unos 2-3 bloques)
      if (n === 'lava') {
        let malo = null;
        for (let dx = -2; dx <= 2 && !malo; dx++) for (let dy = -1; dy <= 2 && !malo; dy++) for (let dz = -2; dz <= 2 && !malo; dz++) {
          const m = nombreEn(x + dx, y + dy, z + dz);
          if (esInflamable(m)) malo = `${m} en ${x + dx},${y + dy},${z + dz}`;
        }
        if (malo) errores.push(`lava cerca de un bloque inflamable (${malo}): se quema; usa piedra, obsidiana o ladrillo`);
        for (const [dx, dy, dz] of DIRS) if (nombreEn(x + dx, y + dy, z + dz) === 'water') avisos.push(`agua pegada a lava en ${x},${y},${z}: se vuelve obsidiana o adoquin`);
      }

      // 2. TNT junto a lava o fuego se enciende solo
      if (n === 'tnt') {
        for (const [dx, dy, dz] of DIRS) {
          const m = nombreEn(x + dx, y + dy, z + dz);
          if (m === 'lava' || m === 'fire' || m === 'soul_fire') errores.push(`TNT pegado a ${m} en ${x},${y},${z}: se enciende solo`);
        }
      }

      // 3. Placas de presion: necesitan un bloque de apoyo completo; para energizar TNT, ademas que conduzca
      if (/_pressure_plate$/.test(n)) {
        const sx = x, sy = y - 1, sz = z, soporte = nombreEn(sx, sy, sz);
        if (aire(soporte)) errores.push(`placa de presion en ${x},${y},${z} sin bloque debajo`);
        else if (!cuboCompleto(soporte)) errores.push(`placa sobre ${soporte} (losa, escalera, valla...): no es un bloque completo, la placa se cae o no funciona; usa un bloque entero`);
        else {
          if (!conductor(soporte)) avisos.push(`${soporte} es transparente: la placa NO energiza lo que hay debajo; usa piedra, tierra o madera`);
          const hayTnt = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => /^(tnt|piston|sticky_piston|dispenser|dropper|redstone_lamp)$/.test(nombreEn(sx + dx, sy + dy, sz + dz)));
          if (!hayTnt) avisos.push(`la placa en ${x},${y},${z} solo energiza el bloque bajo ella y sus vecinos; no hay TNT/piston/dispenser junto a ese bloque`);
        }
      }

      // 4. Pistones: direccion, empuje y fuente de energia
      if (n === 'piston' || n === 'sticky_piston') {
        const f = estado(spec, 'facing') || 'north';
        const v = { east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], south: [0, 0, 1], north: [0, 0, -1] }[f];
        if (!v) errores.push(`piston con facing invalido "${f}"`);
        else {
          let cuenta = 0, cx = x + v[0], cy = y + v[1], cz = z + v[2];
          const primero = nombreEn(cx, cy, cz);
          if (INMOVIBLE.test(primero)) avisos.push(`el piston en ${x},${y},${z} apunta a ${primero}, que no se puede empujar`);
          while (!aire(nombreEn(cx, cy, cz)) && cuenta < 14) { cuenta++; cx += v[0]; cy += v[1]; cz += v[2]; }
          if (cuenta > 12) errores.push(`el piston en ${x},${y},${z} tendria que empujar mas de 12 bloques`);
          const frente = [x + v[0], y + v[1], z + v[2]];
          const energia = DIRS.some(([dx, dy, dz]) => {
            const p = [x + dx, y + dy, z + dz];
            if (p[0] === frente[0] && p[1] === frente[1] && p[2] === frente[2]) return false;
            return FUENTE.test(nombreEn(p[0], p[1], p[2]));
          });
          if (!energia) avisos.push(`el piston en ${x},${y},${z} no tiene una fuente de energia pegada (redstone_block, antorcha, palanca...) fuera de su frente`);
        }
      }

      // 5. Gravedad: arena, grava, yunque... sobre el vacio caen al instante
      if (GRAVEDAD.test(n) && aire(nombreEn(x, y - 1, z))) errores.push(`${n} en ${x},${y},${z} con aire debajo: cae al instante; ponle un bloque debajo o usa otro material`);

      // 6. Dispenser / observer: facing valido
      if (/^(dispenser|dropper|observer)$/.test(n)) {
        const f = estado(spec, 'facing');
        if (f && !/^(north|south|east|west|up|down)$/.test(f)) errores.push(`${n} con facing invalido "${f}"`);
      }
    }
    return { errores: [...new Set(errores)].slice(0, 4), avisos: [...new Set(avisos)].slice(0, 4), ops };
  }

  return { evaluar, cuboCompleto, conductor, esInflamable };
}

module.exports = { crearAnalizador };
