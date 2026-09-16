// Parser SNBT acotado: compounds planos + arrays de strings simples, tipo
// {nombre:"xd",vida:20.0f,x:12.5d,inventario:["minecraft:diamond","minecraft:sword"]}
// No soporta compounds anidados dentro de arrays -- suficiente para lo que
// emite el datapack.
function parseFlatSnbt(raw) {
  const body = raw.trim().replace(/^\{/, '').replace(/\}$/, '');
  const result = {};
  // separa por comas que no esten dentro de comillas NI dentro de corchetes []
  const parts = [];
  let depth = 0, dentroString = false, actual = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' && body[i - 1] !== '\\') dentroString = !dentroString;
    if (!dentroString && c === '[') depth++;
    if (!dentroString && c === ']') depth--;
    if (!dentroString && depth === 0 && c === ',') {
      parts.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) parts.push(actual);

  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    let val = part.slice(idx + 1).trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      // array de strings simples
      const inner = val.slice(1, -1);
      val = (inner.match(/"(?:\\.|[^"])*"/g) || []).map(s => s.slice(1, -1).replace(/\\"/g, '"'));
    } else if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    } else {
      const numMatch = val.match(/^(-?\d+(?:\.\d+)?)[fdbslFDBSL]?$/);
      if (numMatch) val = parseFloat(numMatch[1]);
    }
    result[key] = val;
  }
  return result;
}

module.exports = { parseFlatSnbt };
