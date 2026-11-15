const datos = new Map();
let instalado = false;

function medir(clave, ms) {
  let d = datos.get(clave);
  if (!d) { d = { n: 0, ms: 0, max: 0 }; datos.set(clave, d); }
  d.n++; d.ms += ms; if (ms > d.max) d.max = ms;
}

function origen() {
  const l = String(new Error().stack).split('\n').slice(3).find((x) => !/perfil\.js|node:internal/.test(x)) || '';
  const m = /([\w.-]+\.js):(\d+)/.exec(l);
  return m ? m[1] + ':' + m[2] : '?';
}

function instalar() {
  if (instalado) return;
  instalado = true;
  const si = global.setInterval;
  global.setInterval = function (fn, ms, ...a) {
    if (typeof fn !== 'function') return si.call(this, fn, ms, ...a);
    const k = origen() + ' /' + (ms || 0) + 'ms';
    return si.call(this, function () {
      const t = process.hrtime.bigint();
      try { return fn.apply(this, arguments); } finally { medir(k, Number(process.hrtime.bigint() - t) / 1e6); }
    }, ms, ...a);
  };
}

function tabla(n = 15) {
  const s = (Date.now() - (tabla.t0 || (tabla.t0 = Date.now()))) / 1000 || 1;
  return [...datos.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, n).map(([k, d]) => ({ k, n: d.n, ms: Math.round(d.ms), prom: +(d.ms / d.n).toFixed(2), max: Math.round(d.max), pct: +(d.ms / 10 / s).toFixed(2) }));
}
const reiniciar = () => { datos.clear(); tabla.t0 = Date.now(); };
module.exports = { instalar, medir, tabla, reiniciar };
