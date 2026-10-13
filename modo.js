const NUM = { 1: 'creative', 3: 'spectator' };
function ignorado(bot, x) {
  if (!x) return false;
  const nombre = typeof x === 'string' ? x : x.username;
  const ent = typeof x === 'string' ? (bot.players[x] && bot.players[x].entity) : x;
  const g = ent && ent.gameMode;
  if (g === 'creative' || g === 'spectator' || g === 1 || g === 3) return true;
  const p = nombre && bot.players && bot.players[nombre];
  const m = p && p.gamemode;
  return m === 1 || m === 3 || m === 'creative' || m === 'spectator' || NUM[m] !== undefined;
}
module.exports = { ignorado };
