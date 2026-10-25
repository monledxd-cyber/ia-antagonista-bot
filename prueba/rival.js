const path = require('path');
const mineflayer = require(path.resolve(__dirname, '..', 'node_modules', 'mineflayer'));
const { pathfinder, Movements, goals } = require(path.resolve(__dirname, '..', 'node_modules', 'mineflayer-pathfinder'));
const host = '127.0.0.1', port = Number(process.argv[2] || 25599), objetivo = process.argv[3] || 'am_prueba';
const bot = mineflayer.createBot({ host, port, username: 'rival_prueba', version: '1.21.4', auth: 'offline' });
bot.loadPlugin(pathfinder);
bot.once('spawn', () => {
  bot.pathfinder.setMovements(new Movements(bot));
  let ultimo = 0;
  setInterval(() => {
    const t = Object.values(bot.entities).find(e => e.type === 'player' && e !== bot.entity);
    if (!t) return;
    const d = t.position.distanceTo(bot.entity.position);
    if (d > 2.5) bot.pathfinder.setGoal(new goals.GoalNear(t.position.x, t.position.y, t.position.z, 2));
    else bot.pathfinder.setGoal(null);
    if (d < 3.4 && Date.now() - ultimo > 600 + Math.random() * 500) { ultimo = Date.now(); bot.lookAt(t.position.offset(0, 1.6, 0)); bot.attack(t); }
  }, 100);
});
setInterval(()=>{const t=Object.values(bot.entities).find(e=>e.type==='player'&&e!==bot.entity);console.log('RIVAL d='+(t?t.position.distanceTo(bot.entity.position).toFixed(1):'sin'),'hp',bot.health,'yo',bot.entity.position.floored().toString(),'ents',Object.values(bot.entities).map(e=>e.type+':'+(e.username||e.name)).join(','));},4000);
bot.on('error', () => {});
bot.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
