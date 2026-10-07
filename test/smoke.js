// Prueba rapida sin servidor: carga todos los modulos y comprueba memoria, trampas y validador. Uso: npm test
const assert = require('assert');
const { EventEmitter } = require('events');
const { Vec3 } = require('vec3');
const reg = require('prismarine-registry')('1.21.4');
for (const f of ['../combate', '../trampas', '../bloques', '../abasto', '../memoria']) require(f);

const { crearMemoria } = require('../memoria');
const m = crearMemoria(require('os').tmpdir() + '/mem_test_' + process.pid + '.json');
for (let i = 0; i < 30; i++) m.observa('P', i % 2 ? ['escudo', 'sprint'] : ['sprint'], { x: 100, z: 200 });
assert(m.perfil('P').sprint === 100 && m.perfil('P').escudo === 50);
m.detener(); try { require('fs').unlinkSync(require('os').tmpdir() + '/mem_test_' + process.pid + '.json'); } catch (e) { /* ok */ }

const { crearTrampero, validarPlano } = require('../trampas');
assert(!validarPlano('op @a;say hola').ok, 'el validador debe rechazar comandos fuera de la lista');
const bot = new EventEmitter();
Object.assign(bot, { username: 'am', registry: reg, entity: { position: new Vec3(0, 64, 0) }, entities: {}, game: { dimension: 'minecraft:overworld', minY: -64 },
  chat() {}, blockAt: (p) => ({ name: p.y <= 63 ? 'stone' : 'air', position: p, boundingBox: p.y <= 63 ? 'block' : 'empty' }), world: { raycast: () => null } });
const t = crearTrampero(bot, { tranquilo: () => true });
const j = { position: new Vec3(20, 64, 0), username: 'P', yaw: 0, velocity: new Vec3(0, 0, 0), type: 'player' };
bot.entities[1] = j;
for (const k of ['mina_tnt', 'foso_lava', 'aplastador', 'canon', 'cable_tnt', 'lluvia_yunques', 'foso_estalagmitas']) assert(t.construir(k, j).ok, 'trampa ' + k);
t.detener();
console.log('OK: smoke test');
process.exit(0);
