const mcServer = require('flying-squid');
const Vec3 = require('vec3');
const escenario = process.argv[2] || 'base';
const puerto = Number(process.argv[3] || 25599);
const serv = mcServer.createMCServer({
  motd: 'prueba', port: puerto, 'max-players': 5, 'online-mode': false, logging: false, gameMode: 0, difficulty: 1,
  generation: { name: 'superflat', options: { worldHeight: 80 } }, kickTimeout: 20000, plugins: {}, modpe: false, 'view-distance': 5,
  'player-list-text': { header: { text: 'x' }, footer: { text: 'y' } }, 'everybody-op': true, 'max-entities': 100, version: '1.21.4',
});
const estado = (n) => serv.registry.blocksByName[n].defaultState;
serv.on('listening', () => console.log('LISTO'));
serv.on('error', (e) => console.log('ERROR_SERVIDOR ' + e.message));
const huecos = new Set();
async function pozo(p) {
  const base = p.position.floored();
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let dy = 0; dy < 4; dy++) await serv.setBlock(serv.overworld, base.offset(dx, dy, dz), estado('dirt'));
}
async function lago(p, r, prof, gap) {
  const c = p.position.floored();
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.hypot(dx, dz) > r) continue;
    for (let dy = 1; dy <= gap; dy++) await serv.setBlock(serv.overworld, c.offset(dx, -dy, dz), estado('air'));
    for (let dy = 1 + gap; dy <= prof + gap; dy++) await serv.setBlock(serv.overworld, c.offset(dx, -dy, dz), estado('water'));
  }
  const t0 = Date.now();
  let dentro = true, fuera = false, n = 0;
  const iv = setInterval(async () => {
    try {
      const q = p.position, b = await serv.overworld.getBlock(new Vec3(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z)));
      const d = Math.hypot(q.x - c.x, q.z - c.z);
      if (++n % 10 === 0) console.log(`AGUA pos ${q.x.toFixed(1)} ${q.y.toFixed(1)} ${q.z.toFixed(1)} d=${d.toFixed(1)} bloque=${b && b.name}`);
      if (!fuera && d > r + 0.8 && b && b.name !== 'water') { fuera = true; console.log(`AGUA_FUERA seg=${((Date.now() - t0) / 1000).toFixed(1)}`); }
    } catch (e) { /* ignorar */ }
  }, 500);
  return iv;
}
async function recursos(p) {
  const c = p.position.floored();
  const pon = (x, y, z, n) => serv.setBlock(serv.overworld, c.offset(x, y, z), estado(n));
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63 + 0.4, r = 12 + (i % 4) * 7, x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    for (let dy = 0; dy < 5; dy++) await pon(x, dy, z, 'oak_log');
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 3; dy <= 5; dy++) if (!(dx === 0 && dz === 0 && dy < 5)) await pon(x + dx, dy, z + dz, 'oak_leaves');
  }
  for (let x = 18; x <= 28; x++) for (let z = -5; z <= 5; z++) for (let dy = -3; dy <= 4; dy++) {
    const m = (x * 7 + z * 13 + dy * 5) % 23;
    await pon(x, dy, z, m === 0 ? 'coal_ore' : m === 1 && dy < 3 ? 'iron_ore' : 'stone');
  }
}
async function arboles(p) {
  const base = p.position.floored();
  for (const [dx, dz] of [[6, 0], [-6, 4], [4, -7]]) for (let dy = 0; dy < 5; dy++) await serv.setBlock(serv.overworld, base.offset(dx, dy, dz), estado('oak_log'));
}
serv.on('newPlayer', (p) => p.once('spawned', () => {
  if (p.username.startsWith('rival')) { console.log('RIVAL_UNIDO'); return; }
  console.log('BOT_UNIDO ' + p.username);
  setTimeout(async () => {
    try {
      if (escenario === 'pozo') await pozo(p);
      if (escenario === 'agua') await lago(p, Number(process.env.LAGO_R || 9), Number(process.env.LAGO_PROF || 2), Number(process.env.LAGO_GAP || 0));
      if (escenario === 'base' || escenario === 'rival') await arboles(p);
      if (escenario === 'recursos') await recursos(p);
      if (escenario === 'rival') {
        let n = 0;
        const iv = setInterval(() => {
          if (p.health <= 0 || ++n > 12) return clearInterval(iv);
          try { p.takeDamage({ damage: 3, velocity: new Vec3(0.3, 0.3, 0.3) }); console.log('DANO hp=' + p.health); } catch (e) { console.log('DANO_ERR ' + e.message); }
        }, 2500);
      }
      if (escenario === 'mob') {
        const t = serv.registry.entitiesByName.zombie.id;
        for (let i = 0; i < 2; i++) serv.spawnMob(t, p.world, p.position.offset(5 + i, 0, 3), {});
      }
      console.log('ESCENARIO_LISTO ' + escenario);
    } catch (e) { console.log('ERROR_ESCENARIO ' + e.message); }
  }, 4000);
}));
process.on('SIGTERM', () => process.exit(0));
