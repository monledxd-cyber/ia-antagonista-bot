const assert = require('assert');
const path = require('path');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const vocab = require('../slm/chat/vocab.json');
const V = vocab.tokens.length;
const orig = Module._load;
const mk = (kv) => {
  Module._load = function (req) {
    if (req === 'onnxruntime-node') {
      return {
        Tensor: function (t, d, s) { this.data = d; this.dims = s; },
        InferenceSession: { create: async () => ({ run: async (f) => {
          const ids = Array.from(f.ids.data, Number);
          const prev = kv ? Array.from(f.pk.data) : [];
          const todo = kv ? prev.concat(ids) : ids;
          const lg = new Float32Array(ids.length * V).fill(-5);
          let s = kv ? prev.reduce((a, b) => a + b, 0) : 0;
          for (let i = 0; i < ids.length; i++) { s += ids[i]; lg[i * V + ((s * 7 + todo.length * 0) % V)] = 5; }
          if (!kv) { s = 0; for (let i = 0; i < ids.length; i++) { s += ids[i]; lg.fill(-5, i * V, (i + 1) * V); lg[i * V + ((s * 7) % V)] = 5; } }
          return { logits: { data: lg }, nk: { data: Float32Array.from(todo) }, nv: { data: Float32Array.from(todo) } };
        } }) },
      };
    }
    return orig.apply(this, arguments);
  };
  delete require.cache[require.resolve('../slm_chat')];
  return require('../slm_chat');
};
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv'));
  for (const f of ['vocab.json', 'palabras.json', 'clf.json', 'clf.bin']) fs.copyFileSync(path.join(__dirname, '..', 'slm', 'chat', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'modelo.onnx'), '');
  fs.writeFileSync(path.join(dir, 'modelo_kv.onnx'), '');
  fs.writeFileSync(path.join(dir, 'kv.json'), JSON.stringify({ L: 1, H: 1, dh: 1 }));
  const secuencias = [[5, 6, 7], [5, 6, 7, 8, 9], [5, 6, 20, 21], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]];
  const comp = [];
  { process.env.IA_KV = '0'; const c = mk(false).crearChat(dir); await c.cargar(); for (const q of secuencias) comp.push(Array.from(await c._paso(q)).indexOf(5)); }
  { delete process.env.IA_KV; const c = mk(true).crearChat(dir); await c.cargar(); const r = []; for (const q of secuencias) r.push(Array.from(await c._paso(q)).indexOf(5)); assert.deepStrictEqual(r, comp); }
  console.log('kv cache ok');
})().catch((e) => { console.error(e); process.exit(1); });
