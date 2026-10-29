const path = require('path');
const fs = require('fs');
const { crearChat } = require(path.join(__dirname, '..', 'slm_chat'));
(async () => {
  const c = crearChat(path.join(__dirname, 'chat'));
  await c.cargar();
  const filas = fs.readFileSync(path.join(__dirname, 'chat_test.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const st = {};
  const mal = [];
  for (const x of filas) {
    const r = await c.leer(x.u);
    const esp = x.l.split('|').map((s) => s.trim());
    const slotsEsp = esp.slice(1).sort().join('|');
    const slotsObt = Object.entries(r.slots).map(([k, v]) => `${k}: ${v}`).sort().join('|');
    const s = (st[x.modo] = st[x.modo] || { n: 0, int: 0, slots: 0, todo: 0 });
    s.n++;
    const okI = r.intencion === esp[0], okS = slotsEsp === slotsObt;
    if (okI) s.int++;
    if (okS) s.slots++;
    if (okI && okS) s.todo++;
    else if (mal.length < 12) mal.push(`${x.u}  =>  ${r.txt}   [esperado: ${x.l}]`);
  }
  for (const [m, s] of Object.entries(st)) console.log(m, 'intencion', (100 * s.int / s.n).toFixed(0) + '%', 'slots', (100 * s.slots / s.n).toFixed(0) + '%', 'todo', (100 * s.todo / s.n).toFixed(0) + '%', `(${s.n})`);
  console.log(mal.join('\n'));
  process.exit(0);
})();
