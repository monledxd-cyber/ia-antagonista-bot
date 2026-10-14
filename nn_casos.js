const NI = 35;
const rnd = (a, b) => a + Math.random() * (b - a);

function estado() {
  const s = new Array(NI).fill(0);
  s[0] = Math.random() < 0.3 ? rnd(0.05, 0.4) : rnd(0.3, 1);
  s[1] = rnd(0.3, 1);
  s[3] = Math.random() < 0.6 ? 1 : 0; s[2] = s[3] ? 0.5 : rnd(0.05, 1);
  s[4] = Math.random() < 0.5 ? rnd(0.05, 0.45) : rnd(0.3, 1.6);
  s[5] = rnd(-0.6, 0.8); s[6] = rnd(0, 1); s[7] = rnd(-0.8, 0.8);
  s[8 + Math.floor(Math.random() * 6)] = 1;
  s[14] = Math.random() < 0.3 ? 1 : 0; s[15] = s[12] ? 1 : 0;
  s[16] = [0.4, 0.4, 0.4, 0.6, 1][Math.floor(Math.random() * 5)];
  s[17] = Math.floor(Math.random() * 5) / 4; s[18] = Math.floor(Math.random() * 5) / 4;
  s[19] = rnd(0, 0.8); s[20] = rnd(0.5, 1); s[21] = Math.random() < 0.1 ? 1 : 0;
  s[22] = Math.random() < 0.4 ? 1 : 0; s[23] = Math.random() < 0.08 ? 1 : 0; s[24] = rnd(0, 1);
  s[25] = Math.random() < 0.4 ? 1 : 0; s[26] = Math.random() < 0.3 ? 1 : 0;
  s[27] = Math.max(-1, Math.min(1, (s[0] - 0.5) + (s[17] - s[18]) + rnd(-0.4, 0.4)));
  s[28] = Math.random() < 0.2 ? rnd(0.3, 1) : 0; s[29] = Math.random() < 0.08 ? 1 : 0; s[30] = Math.random() < 0.06 ? 1 : 0;
  for (let i = 31; i < 35; i++) s[i] = Math.random() < 0.25 ? rnd(0.3, 1) : 0;
  return s;
}

function experto(s) {
  const hp = s[0], rhp = s[3] ? 0.5 : s[2], d = s[4], mace = s[8], cris = s[9], rango = s[12], escudo = s[14], adv = s[27];
  const cerca = d < 0.42, medio = d >= 0.3 && d < 0.7, lejos = d >= 0.6;
  const q = [0, 0, 0, 0, 0, 0];
  q[0] = 0.25 + 0.5 * adv + 0.3 * (hp - 0.5) + 0.35 * (1 - rhp) * (cerca ? 1 : 0.3) - (escudo && s[16] < 0.55 ? 0.3 : 0) - (cerca ? 0 : 0.35) - (mace && cerca ? 0.25 : 0);
  q[1] = 0.1 + (0.5 - hp) * 0.9 - 0.35 * adv + (s[25] ? -0.15 : 0.2) * (hp < 0.35 ? 1 : 0) - (s[21] ? 0.3 : 0);
  q[2] = (hp < 0.55 ? (0.9 - hp) * 1.1 : -0.4) * (s[25] ? 1 : 0.1) * (medio || lejos ? 1 : 0.3) - (cerca ? 0.2 : 0);
  q[3] = 0.1 + 0.55 * rango * (d > 0.3 ? 1 : 0.2) + 0.15 * s[15] + (escudo ? 0 : 0.05);
  q[4] = 0.05 + 0.55 * mace * (cerca || medio ? 1 : 0) + 0.5 * cris * (cerca ? 1 : 0.3) + 0.15 * Math.abs(s[7]) + (s[23] ? -0.2 : 0);
  q[5] = 0.12 - 0.1 * Math.abs(hp - 0.6);
  if (s[28]) { q[3] += 0.4 * s[28]; q[4] += 0.3 * s[28]; q[0] -= 0.1 * s[28]; }
  if (s[29]) { q[1] -= 0.4; q[4] -= 0.3; }
  if (s[30]) { q[1] -= 0.45; q[4] -= 0.2; }
  if (s[23]) { q[0] -= 0.2; q[4] -= 0.1; }
  if (s[21]) q[0] += 0.2;
  if (s[31]) { q[0] += 0.12 * s[31]; q[4] += 0.08 * s[31]; }
  if (s[32]) { q[3] += 0.12 * s[32]; q[4] += 0.1 * s[32]; q[0] -= 0.05 * s[32]; }
  if (s[33]) { q[0] += 0.2 * s[33]; q[1] -= 0.15 * s[33]; q[2] -= 0.05 * s[33]; }
  if (s[34]) { q[0] += 0.08 * s[34]; q[5] += 0.05 * s[34]; }
  return q.map((v) => Math.max(-1.2, Math.min(1.2, v)));
}

function generar(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const s = estado(); out.push({ s, q: experto(s).map((v) => v + rnd(-0.05, 0.05)) }); }
  return out;
}
module.exports = { NI, generar, experto, estado };
