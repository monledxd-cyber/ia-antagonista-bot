const { generarClave, hash } = require('./api_am');
const k = generarClave(process.argv[2]);
console.log('clave: ' + k);
console.log('hash:  ' + hash(k));
console.log('Render: AM_KEYS=<hash>  (varios hashes separados por coma)');
