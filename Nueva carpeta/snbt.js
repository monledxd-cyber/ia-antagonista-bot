// Parser SNBT muy acotado: solo entiende compounds planos tipo
// {nombre:"xd",vida:20.0f,x:12.5d,y:64.0d,z:-3.2d,cerca_lava:1,cerca_borde:0,diamantes:3}
// No soporta anidamiento ni listas -- suficiente para lo que emite el datapack.
function parseFlatSnbt(raw) {
  const body = raw.trim().replace(/^\{/, '').replace(/\}$/, '');
  const result = {};
  // separa por comas que no esten dentro de comillas
  const parts = body.match(/(?:[^,"]|"(?:\\.|[^"])*")+/g) || [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    let val = part.slice(idx + 1).trim();

    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    } else {
      // quita sufijos de tipo: f, d, b, s, L
      const numMatch = val.match(/^(-?\d+(?:\.\d+)?)[fdbslFDBSL]?$/);
      if (numMatch) {
        val = parseFloat(numMatch[1]);
      }
    }
    result[key] = val;
  }
  return result;
}

module.exports = { parseFlatSnbt };
