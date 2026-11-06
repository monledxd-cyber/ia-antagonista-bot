import sys, time, numpy as np, onnx
from onnx import helper as h, numpy_helper as nh, TensorProto as T
import onnxruntime as ort

def construir(src, dst, H=8):
    m = onnx.load(src)
    ini = {i.name: nh.to_array(i) for i in m.graph.initializer}
    mm = [n.input[1] if n.input[1] in ini else n.input[0] for n in m.graph.node if n.op_type == "MatMul" and any(i in ini for i in n.input)]
    mm = [x for x in mm if x in ini]
    L = sum(1 for k in ini if k.endswith(".n1.weight"))
    D = ini["e.weight"].shape[1]
    dh = D // H
    eps = next((a.f for n in m.graph.node if n.op_type == "LayerNormalization" for a in n.attribute if a.name == "epsilon"), 1e-5)
    assert len(mm) == 4 * L + 1, (len(mm), L)
    W = [ini[x] for x in mm]
    N, I, V = [], [], {}
    def c(name, arr):
        I.append(nh.from_array(np.asarray(arr), name)); return name
    def op(t, ins, outs=None, **kw):
        o = outs or [f"t{len(N)}"]
        N.append(h.make_node(t, ins, o, **kw)); return o if len(o) > 1 else o[0]
    for k in ("e.weight", "p.weight", "n.weight", "n.bias"): c(k, ini[k])
    for i in range(L):
        for k in ("n1.weight", "n1.bias", "qkv.bias", "o.bias", "n2.weight", "n2.bias", "f1.bias", "f2.bias"): c(f"b.{i}.{k}", ini[f"b.{i}.{k}"])
        for j, k in enumerate(("qkv", "o", "f1", "f2")): c(f"b.{i}.{k}.W", W[4 * i + j])
    c("s.W", W[-1])
    c("i0", np.array(0, np.int64)); c("i1", np.array(1, np.int64)); c("i2", np.array(2, np.int64))
    c("neg", np.array(-1e9, np.float32)); c("rs", np.array(1 / np.sqrt(dh), np.float32)); c("sq2", np.array(np.sqrt(2), np.float32)); c("half", np.array(0.5, np.float32)); c("one", np.array(1, np.float32))
    c("sh_q", np.array([0, 0, H, dh], np.int64)); c("sh_d", np.array([0, 0, D], np.int64)); c("sp", np.array([D, D, D], np.int64))
    c("ax0", np.array([0], np.int64)); c("rc", np.array([-1, 1], np.int64)); c("rr", np.array([1, -1], np.int64))
    P = op("Gather", [op("Shape", ["pk"]), "i2"])
    t = op("Gather", [op("Shape", ["ids"]), "i1"])
    end = op("Add", [P, t])
    pos = op("Range", [P, end, "i1"])
    kpos = op("Range", ["i0", end, "i1"])
    masked = op("Less", [op("Reshape", [pos, "rc"]), op("Reshape", [kpos, "rr"])])
    x = op("Add", [op("Gather", ["e.weight", "ids"]), op("Gather", ["p.weight", pos])])
    ks, vs = [], []
    for i in range(L):
        b = f"b.{i}."
        hh = op("LayerNormalization", [x, b + "n1.weight", b + "n1.bias"], axis=-1, epsilon=eps)
        qkv = op("Add", [op("MatMul", [hh, b + "qkv.W"]), b + "qkv.bias"])
        q, k, v = op("Split", [qkv, "sp"], [f"q{i}", f"k{i}", f"v{i}"], axis=2)
        tr = lambda z: op("Transpose", [op("Reshape", [z, "sh_q"])], perm=[0, 2, 1, 3])
        q, k, v = tr(q), tr(k), tr(v)
        li = c(f"li{i}", np.array([i], np.int64))
        pki = op("Unsqueeze", [op("Gather", ["pk", f"i0" if False else li], axis=0), "ax0"]) if False else op("Gather", ["pk", li], axis=0)
        pvi = op("Gather", ["pv", li], axis=0)
        kf = op("Concat", [pki, k], axis=2); vf = op("Concat", [pvi, v], axis=2)
        ks.append(kf); vs.append(vf)
        a = op("Mul", [op("MatMul", [q, op("Transpose", [kf], perm=[0, 1, 3, 2])]), "rs"])
        a = op("Softmax", [op("Where", [masked, "neg", a])], axis=-1)
        y = op("Reshape", [op("Transpose", [op("MatMul", [a, vf])], perm=[0, 2, 1, 3]), "sh_d"])
        x = op("Add", [x, op("Add", [op("MatMul", [y, b + "o.W"]), b + "o.bias"])])
        h2 = op("LayerNormalization", [x, b + "n2.weight", b + "n2.bias"], axis=-1, epsilon=eps)
        f = op("Add", [op("MatMul", [h2, b + "f1.W"]), b + "f1.bias"])
        g = op("Mul", [op("Mul", [f, "half"]), op("Add", [op("Erf", [op("Div", [f, "sq2"])]), "one"])])
        x = op("Add", [x, op("Add", [op("MatMul", [g, b + "f2.W"]), b + "f2.bias"])])
    xf = op("LayerNormalization", [x, "n.weight", "n.bias"], axis=-1, epsilon=eps)
    op("MatMul", [xf, "s.W"], ["logits"])
    op("Concat", ks, ["nk"], axis=0); op("Concat", vs, ["nv"], axis=0)
    F = T.FLOAT
    g = h.make_graph(N, "kv", [h.make_tensor_value_info("ids", T.INT64, [1, "t"]), h.make_tensor_value_info("pk", F, [L, H, "p", dh]), h.make_tensor_value_info("pv", F, [L, H, "p", dh])],
                     [h.make_tensor_value_info("logits", F, [1, "t", W[-1].shape[1]]), h.make_tensor_value_info("nk", F, [L, H, "q", dh]), h.make_tensor_value_info("nv", F, [L, H, "q", dh])], I)
    mo = h.make_model(g, opset_imports=[h.make_opsetid("", 17)]); mo.ir_version = 8
    onnx.checker.check_model(mo)
    onnx.save(mo, dst)
    return L, H, dh

def so():
    s = ort.SessionOptions(); s.intra_op_num_threads = 1; s.inter_op_num_threads = 1; return s

def verificar(orig, kv, L, H, dh):
    a = ort.InferenceSession(orig, so(), providers=["CPUExecutionProvider"]); b = ort.InferenceSession(kv, so(), providers=["CPUExecutionProvider"])
    V = a.get_outputs()[0].shape
    rng = np.random.default_rng(1); ids = rng.integers(10, 3000, 60)
    full = lambda n: a.run(None, {"ids": ids[None, :n]})[0][0, -1]
    pk = np.zeros((L, H, 0, dh), np.float32); pv = pk.copy()
    lg, pk, pv = b.run(None, {"ids": ids[None, :30], "pk": pk, "pv": pv})
    md = np.abs(lg[0, -1] - full(30)).max()
    for n in range(30, 60):
        lg, pk, pv = b.run(None, {"ids": ids[None, n:n + 1], "pk": pk, "pv": pv})
        md = max(md, np.abs(lg[0, -1] - full(n + 1)).max())
    t0 = time.time()
    for n in range(40, 60): full(n)
    tf = time.time() - t0
    pk = np.zeros((L, H, 0, dh), np.float32); pv = pk.copy()
    lg, pk, pv = b.run(None, {"ids": ids[None, :40], "pk": pk, "pv": pv}); t0 = time.time()
    for n in range(40, 60): lg, pk, pv = b.run(None, {"ids": ids[None, n:n + 1], "pk": pk, "pv": pv})
    tk = time.time() - t0
    print("max dif %.2e | 20 pasos: completo %.2fs, kv %.2fs (x%.1f)" % (md, tf, tk, tf / tk))
    return md

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    L, H, dh = construir(src, dst, int(sys.argv[3]) if len(sys.argv) > 3 else 8)
    import json, os
    json.dump({'L': L, 'H': H, 'dh': dh}, open(os.path.join(os.path.dirname(dst), 'kv.json'), 'w'))
    verificar(src, dst, L, H, dh)
    from onnxruntime.quantization import quantize_dynamic, QuantType
    d = os.path.dirname(dst)
    quantize_dynamic(dst, os.path.join(d, 'modelo_kv_q8.onnx'), weight_type=QuantType.QInt8)
    quantize_dynamic(src, os.path.join(d, 'modelo_q8.onnx'), weight_type=QuantType.QInt8)
    os.remove(dst)
