const path = require('path');
const mineflayer = require(path.resolve(__dirname, '..', 'node_modules', 'mineflayer'));
const bot = mineflayer.createBot({ host: '127.0.0.1', port: Number(process.argv[2]), username: 'jugador_prueba', version: '1.21.4', auth: 'offline' });
const frases = ['hola, como estas?', 'tengo miedo de los creepers', 'te voy a matar', 'que haces?', 'tengo una espada de diamante', 'voy a minar hierro', 'cuantas veces has muerto?', 'donde estas?'];
bot.once('spawn', () => { let i = 0; setInterval(() => { if (i < frases.length) { console.log('DIJE ' + frases[i]); bot.chat(frases[i++]); } }, 9000); });
bot.on('error', () => {});
bot.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
