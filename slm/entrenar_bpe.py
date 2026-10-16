import json, math, os, sys, random, time, re
os.environ.setdefault("SLM_CTX", "128")
import torch
import torch.nn.functional as F
import entrenar as E

R = E.R
CTX = E.CTX
LR = E.LR
PRE = re.compile(r" ?[^\W\d_]+| ?\d+| ?[^\w\s]|\s+")
FIN, PAD, SEP = "<fin>", "<pad>", "<s>"


def pretok(t):
    return PRE.findall(t)


def bpe_entrenar(textos, nmerges):
    freq = {}
    for t in textos:
        for w in pretok(t):
            freq[w] = freq.get(w, 0) + 1
    ws = list(freq)
    syms = [list(w) for w in ws]
    fr = [freq[w] for w in ws]
    pc, donde = {}, {}

    def pares(i, signo):
        s = syms[i]
        for a, b in zip(s, s[1:]):
            k = (a, b)
            pc[k] = pc.get(k, 0) + signo * fr[i]
            if signo > 0:
                donde.setdefault(k, set()).add(i)
            elif pc[k] <= 0:
                pc.pop(k, None)

    for i in range(len(ws)):
        pares(i, 1)
    merges = []
    for _ in range(nmerges):
        if not pc:
            break
        best = max(pc, key=pc.get)
        if pc[best] < 2:
            break
        merges.append(best)
        a, b = best
        for i in list(donde.get(best, ())):
            s = syms[i]
            pares(i, -1)
            out, j = [], 0
            while j < len(s):
                if j < len(s) - 1 and s[j] == a and s[j + 1] == b:
                    out.append(a + b)
                    j += 2
                else:
                    out.append(s[j])
                    j += 1
            syms[i] = out
            pares(i, 1)
        donde.pop(best, None)
        pc.pop(best, None)
    return merges


class Tok:
    def __init__(self, merges, base):
        self.rank = {tuple(m): i for i, m in enumerate(merges)}
        self.base = set(base)
        self.cache = {}

    def palabra(self, w):
        r = self.cache.get(w)
        if r is not None:
            return r
        s = [c if c in self.base else " " for c in w]
        while len(s) > 1:
            mejor, bi = None, -1
            for i in range(len(s) - 1):
                k = self.rank.get((s[i], s[i + 1]))
                if k is not None and (mejor is None or k < mejor):
                    mejor, bi = k, i
            if mejor is None:
                break
            s[bi : bi + 2] = [s[bi] + s[bi + 1]]
        self.cache[w] = s
        return s

    def codificar(self, t):
        out = []
        for w in pretok(t):
            out.extend(self.palabra(w))
        return out


def main():
    filas = [json.loads(l) for l in open(os.path.join(R, "dataset.jsonl"), encoding="utf8")]
    minimo = int(os.environ.get("SLM_MIN", "200"))
    if len(filas) < minimo:
        sys.exit(f"dataset muy pequeno (<{minimo}). Usa SLM_MIN=100 para probar")
    pre_txt = E.leer_pre()
    textos = [x["t"] for x in filas] + pre_txt
    cc = {}
    for t in textos:
        for c in t:
            cc[c] = cc.get(c, 0) + 1
    base = sorted(c for c, n in cc.items() if n >= 5 and c.isprintable())
    bs = set(base)
    textos = ["".join(c if c in bs else " " for c in t) for t in textos]
    nm = int(os.environ.get("SLM_MERGES", "1500"))
    t0 = time.time()
    merges = bpe_entrenar(textos, nm)
    print("bpe", len(merges), "uniones", f"{time.time() - t0:.0f}s")
    tok = Tok(merges, base)
    piezas = sorted({a + b for a, b in merges} | set(base))
    parts = [x["p"].rstrip(">").split("|") for x in filas]
    acc = sorted({p[0] for p in parts} | {"otra"})
    est = sorted({p[1] for p in parts} | {"libre"})
    vbs = sorted({p[3] for p in parts} | {"v0"})
    vidas = sorted({p[4] for p in parts} | {"ok"})
    esp = [PAD, FIN, SEP] + [f"<A:{a}>" for a in acc] + [f"<E:{e}>" for e in est] + [f"<R{i}:{d}>" for i in range(4) for d in range(4)] + [f"<V:{v}>" for v in vbs] + [f"<L:{v}>" for v in vidas]
    tokens = esp + piezas
    idx = {t: i for i, t in enumerate(tokens)}
    V = len(tokens)

    def prefijo(p):
        a, e, r, v, l = (p.rstrip(">").split("|") + ["otra", "libre", "0000", "v0", "ok"])[:5]
        r = (r + "0000")[:4]
        return [idx.get(f"<A:{a}>", idx["<A:otra>"]), idx.get(f"<E:{e}>", idx["<E:libre>"])] + [idx[f"<R{i}:{r[i]}>"] for i in range(4)] + [idx.get(f"<V:{v}>", idx["<V:v0>"]), idx.get(f"<L:{l}>", idx["<L:ok>"]), idx[SEP]]

    def ids_de(t):
        return [idx[x] for x in tok.codificar(t) if x in idx]

    ej = []
    for x, tx in zip(filas, textos[: len(filas)]):
        pf = prefijo(x["p"])
        ids = (pf + ids_de(tx) + [idx[FIN]])[:CTX]
        ej.append((ids, ([0] * len(pf) + [1] * len(ids))[: len(ids)], max(0.2, 1 + x.get("r", 0))))
    random.seed(1)
    random.shuffle(ej)
    corte = max(1, len(ej) // 20)
    val, tr = ej[:corte], ej[corte:]

    pf0 = prefijo("otra|libre|0000|v0|ok>")
    W = CTX - len(pf0) - 1
    pre = []
    for t in textos[len(filas) :]:
        s = ids_de(t)
        for i in range(0, len(s) - 20, W):
            c = s[i : i + W]
            pre.append((pf0 + c, [0] * len(pf0) + [1] * len(c), 1.0))
    random.seed(2)
    random.shuffle(pre)
    print("tokens", V, "ejemplos", len(tr), "ventanas pre", len(pre))

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    m = E.SLM(V).to(dev)
    print("parametros", sum(p.numel() for p in m.parameters()), "ctx", CTX, "dev", dev)

    def lote(b):
        n = max(len(x[0]) for x in b)
        ids = torch.zeros(len(b), n, dtype=torch.long)
        ms = torch.zeros(len(b), n)
        ws = torch.zeros(len(b))
        for i, (a, mk, w) in enumerate(b):
            ids[i, : len(a)] = torch.tensor(a)
            ms[i, : len(mk)] = torch.tensor(mk, dtype=torch.float)
            ws[i] = w
        return ids.to(dev), ms.to(dev), ws.to(dev)

    def perdida(b):
        ids, ms, ws = lote(b)
        lg = m(ids[:, :-1])
        l = F.cross_entropy(lg.reshape(-1, V), ids[:, 1:].reshape(-1), reduction="none").view(ids.shape[0], -1)
        mk = ms[:, 1:]
        return ((l * mk).sum(1) / mk.sum(1).clamp(min=1) * ws).mean()

    PACI = int(os.environ.get("SLM_PACIENCIA", "5"))

    def ciclo(tr, val, epocas, batch, lr, tag):
        opt = torch.optim.AdamW(m.parameters(), lr=lr, weight_decay=0.1)
        nb = math.ceil(len(tr) / batch)
        sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=epocas * nb)
        print(tag, "lote", batch, "epocas", epocas, "pasos", epocas * nb, flush=True)
        t0 = time.time()
        mejor, sd, mala = 9e9, None, 0
        try:
            for ep in range(epocas):
                m.train()
                random.shuffle(tr)
                tot = 0
                for i in range(0, len(tr), batch):
                    opt.zero_grad()
                    l = perdida(tr[i : i + batch])
                    l.backward()
                    torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
                    opt.step()
                    sch.step()
                    tot += l.item()
                    n = i // batch + 1
                    if n % 50 == 0:
                        print(f"{tag} epoca {ep + 1}/{epocas} paso {n}/{nb} {time.time() - t0:.0f}s loss {tot / n:.3f}", flush=True)
                m.eval()
                with torch.no_grad():
                    v = sum(perdida(val[i : i + batch]).item() for i in range(0, len(val), batch)) / max(1, math.ceil(len(val) / batch))
                print(f"{tag} epoca {ep + 1}/{epocas} {time.time() - t0:.0f}s train {tot / nb:.3f} val {v:.3f}", flush=True)
                if v < mejor - 0.005:
                    mejor, mala = v, 0
                    sd = {k: x.detach().cpu().clone() for k, x in m.state_dict().items()}
                else:
                    mala += 1
                    if mala >= PACI:
                        print("val dejo de bajar: paro y uso la mejor epoca")
                        break
        except KeyboardInterrupt:
            print("interrumpido: sigo con lo entrenado hasta ahora")
        if sd is not None:
            m.load_state_dict(sd)
            print(tag, "mejor val", round(mejor, 3))

    lr = LR
    if pre:
        pv, pt = pre[: max(1, len(pre) // 50)], pre[max(1, len(pre) // 50) :]
        pb = 32
        pasos = int(os.environ.get("SLM_PRE_PASOS", "1500"))
        ciclo(pt, pv, max(1, pasos // max(1, math.ceil(len(pt) / pb))), pb, LR, "pre")
        lr = LR * 0.5
    batch = E.BATCH if E.BATCH > 0 else (16 if len(tr) < 4000 else 64)
    epocas = E.EPOCAS if E.EPOCAS > 0 else max(20, math.ceil(3000 / max(1, math.ceil(len(tr) / batch))))
    ciclo(tr, val, epocas, batch, lr, "ajuste")

    m.eval().cpu()
    dummy = torch.zeros(1, 24, dtype=torch.long)
    torch.onnx.export(m, dummy, os.path.join(R, "modelo.onnx"), input_names=["ids"], output_names=["logits"], dynamic_axes={"ids": {1: "t"}, "logits": {1: "t"}}, opset_version=17, dynamo=False)
    cuenta = {}
    for t in textos:
        for w in re.findall(r"[^\W\d_]+", t.lower()):
            cuenta[w] = cuenta.get(w, 0) + 1
    palabras = sorted(cuenta, key=lambda w: -cuenta[w])[:30000]
    json.dump({"tipo": "bpe", "tokens": tokens, "ctx": CTX, "fin": FIN, "pad": PAD, "acc": acc, "est": est, "vb": vbs, "vida": vidas, "palabras": palabras}, open(os.path.join(R, "vocab.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("listo: slm/modelo.onnx slm/vocab.json (copialos junto al bot)")


if __name__ == "__main__":
    main()
