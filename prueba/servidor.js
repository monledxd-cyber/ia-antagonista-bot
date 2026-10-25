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
      if (escenario === 'base' || escenario === 'rival') await arboles(p);
      if (escenario === 'rival') {
        let n = 0;
        const iv = setInterval(() => {
          if (p.health <= 0 || ++n > 12) return clearInterval(iv);
          try { p.takeDamage({ damage: 3, velocity: new Vec3(0.3, 0.3, 0.3) }); console.log('DANO hp=' + p.health); } catch (e) { console.log('DANO_ERR ' + e.message); }
        }, 2500);
      }
      if (escenario === 'mob') {
        const t = serv.registry.entitiesByName.zombie.id;
        for (let i = 0; i < 2; i++) serv.spawnMob(t, serv.overworld, p.position.offset(5 + i, 0, 3), {});
      }
      console.log('ESCENARIO_LISTO ' + escenario);
    } catch (e) { console.log('ERROR_ESCENARIO ' + e.message); }
  }, 4000);
}));
process.on('SIGTERM', () => process.exit(0));
