const BRAZOS = [{ k: 'nada' }, { k: 'escudo' }, { k: 'izq' }, { k: 'der' }];
const VENTANA = 14;

function crearReflejos(bot) {
  let tick = 0, act = null, libreDesde = 0;
  const res = { n: 0, r: 0, golpes: 0, dano: 0, por: {} };
  const rival = () => { const t = bot.pvp && bot.pvp.target; return t && t.isValid !== false && t.type === 'player' && t.position ? t : null; };
  const escudo = () => { const o = bot.inventory && bot.inventory.slots[45]; return !!(o && o.name === 'shield'); };

  const ctx = (t, d) => {
    const listo = bot._tec && bot._tec.listoRival ? bot._tec.listoRival(t) : 9;
    return (d < 2.6 ? 'c' : d < 3.6 ? 'm' : 'l') + (listo <= 1 ? 'ya' : 'pr') + (escudo() ? 1 : 0) + (bot.health < 9 ? 'b' : 'a');
  };

  function empezar(t, d) {
    const c = ctx(t, d), B = bot._bandits;
    const brazos = escudo() ? BRAZOS : BRAZOS.filter((x) => x.k !== 'escudo');
    const e = B && B.elegir ? B.elegir('reflejo', c, brazos) : brazos[0];
    act = { k: e.k, c, ini: tick, hp0: bot.health, golpes: 0, swing: false, id: t.id };
    if (e.k === 'escudo' && bot._escudo) bot._escudo.alzar(VENTANA * 50, true);
  }

  function aplicar() {
    const dt = tick - act.ini;
    if (act.k === 'izq' || act.k === 'der') {
      const l = act.k === 'izq';
      bot.setControlState(l ? 'left' : 'right', dt < 6);
      bot.setControlState(l ? 'right' : 'left', false);
    }
  }

  function cerrar() {
    for (const s of ['left', 'right']) { try { bot.setControlState(s, false); } catch (e) { /* ignorar */ } }
    if (act.k === 'escudo' && bot._escudo) bot._escudo.bajar();
    const dano = Math.max(0, act.hp0 - bot.health);
    let r = 0.3 * act.golpes - 0.25 * dano + (dano === 0 && act.swing ? 0.4 : 0);
    r = Math.max(-1, Math.min(1, r));
    const B = bot._bandits;
    if (B && B.premiar) { try { B.premiar('reflejo', act.c, act.k, r); } catch (e) { /* ignorar */ } }
    res.n++; res.r += r; res.golpes += act.golpes; res.dano += dano; res.por[act.k] = (res.por[act.k] || 0) + 1;
    act = null; libreDesde = tick + 4;
  }

  bot.on('entityHurt', (e) => { if (act && e && e.id === act.id) act.golpes++; });
  bot.on('entitySwingArm', (e) => { if (act && e && e.id === act.id) act.swing = true; });

  const onTick = () => {
    tick++;
    if (!bot.entity) return;
    if (act) { if (tick - act.ini >= VENTANA || !rival()) cerrar(); else aplicar(); return; }
    if (tick < libreDesde || bot._curando && bot._curando()) return;
    const t = rival();
    if (!t) return;
    const d = t.position.distanceTo(bot.entity.position);
    if (d > 4.6) return;
    const listo = bot._tec && bot._tec.listoRival ? bot._tec.listoRival(t) : 9;
    if (listo > 4) return;
    empezar(t, d);
  };
  bot.on('physicsTick', onTick);
  bot.once('end', () => bot.removeListener('physicsTick', onTick));

  const api = { resumen: () => ({ n: res.n, r: res.n ? +(res.r / res.n).toFixed(2) : 0, golpes: res.golpes, dano: +res.dano.toFixed(1), por: res.por }) };
  bot._refl = api;
  return api;
}
module.exports = { crearReflejos };
