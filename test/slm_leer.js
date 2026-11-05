const assert = require('assert');
const path = require('path');
const Module = require('module');
const dir = path.join(__dirname, '..', 'slm', 'chat');
const vocab = require(path.join(dir, 'vocab.json'));
let natural = [], S = vocab.tokens.indexOf('<S>'), L = vocab.tokens.indexOf('<L>');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'onnxruntime-node') {
    return {
      Tensor: function (t, d, s) { this.data = d; },
      InferenceSession: {
        create: async () => ({
          run: async ({ ids }) => {
            const a = Array.from(ids.data, Number), V = vocab.tokens.length;
            const tail = a.slice(a.lastIndexOf(L) + 1);
            let nx = S;
            if (tail.length < natural.length && tail.every((x, i) => x === natural[i])) nx = natural[tail.length];
            const lg = new Float32Array(a.length * V).fill(-5);
            lg[(a.length - 1) * V + nx] = 5;
            return { logits: { data: lg } };
          },
        }),
      },
    };
  }
  return orig.apply(this, arguments);
};
const { crearChat } = require('../slm_chat');
(async () => {
  const c = crearChat(dir);
  await c.cargar();
  natural = c._cod('plan v V: entrar');
  let r = await c.leer('mi plan es salir');
  assert.strictEqual(r.intencion, 'plan_v');
  assert.strictEqual(r.slots.V, 'entrar');
  assert(r.clf);
  r = await c.leer('hola buenas');
  assert.strictEqual(r.intencion, r.clf.p);
  assert.strictEqual(r.cambiada, 'plan_v');
  assert.strictEqual(r.clf.p, 'saludo');
  assert.deepStrictEqual(r.slots, {});
  assert(r.ids[r.ids.length - 1] === S);
  process.env.IA_CLF = '0';
  r = await c.leer('hola buenas');
  assert.strictEqual(r.intencion, 'plan_v');
  console.log('slm_leer ok');
  process.exit(0);
})();
