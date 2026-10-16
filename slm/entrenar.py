import json, math, os, sys, random, time
import torch
import torch.nn as nn
import torch.nn.functional as F

R = os.path.dirname(os.path.abspath(__file__))
D = int(os.environ.get("SLM_D", "256"))
L = int(os.environ.get("SLM_L", "6"))
H = int(os.environ.get("SLM_H", "8"))
CTX = int(os.environ.get("SLM_CTX", "192"))
EPOCAS = int(os.environ.get("SLM_EPOCAS", "0"))
BATCH = int(os.environ.get("SLM_BATCH", "0"))
LR = float(os.environ.get("SLM_LR", "0.0006"))
FIN = "\n"
PAD = "\x00"


class Bloque(nn.Module):
    def __init__(self):
        super().__init__()
        self.n1 = nn.LayerNorm(D)
        self.qkv = nn.Linear(D, 3 * D)
        self.o = nn.Linear(D, D)
        self.n2 = nn.LayerNorm(D)
        self.f1 = nn.Linear(D, 4 * D)
        self.f2 = nn.Linear(4 * D, D)

    def forward(self, x):
        B, T, _ = x.shape
        q, k, v = self.qkv(self.n1(x)).split(D, dim=2)
        q = q.view(B, T, H, D // H).transpose(1, 2)
        k = k.view(B, T, H, D // H).transpose(1, 2)
        v = v.view(B, T, H, D // H).transpose(1, 2)
        a = (q @ k.transpose(-2, -1)) / math.sqrt(D // H)
        m = torch.triu(torch.ones(T, T, device=x.device, dtype=torch.bool), 1)
        a = a.masked_fill(m, float("-inf")).softmax(-1)
        y = (a @ v).transpose(1, 2).reshape(B, T, D)
        x = x + self.o(y)
        return x + self.f2(F.gelu(self.f1(self.n2(x))))


class SLM(nn.Module):
    def __init__(self, V):
        super().__init__()
        self.e = nn.Embedding(V, D)
        self.p = nn.Embedding(CTX, D)
        self.b = nn.ModuleList([Bloque() for _ in range(L)])
        self.n = nn.LayerNorm(D)
        self.s = nn.Linear(D, V, bias=False)

    def forward(self, ids):
        T = ids.shape[1]
        x = self.e(ids) + self.p(torch.arange(T, device=ids.device))
        for b in self.b:
            x = b(x)
        return self.s(self.n(x))


NORM = {"\u2014": "-", "\u2013": "-", "\u00ab": '"', "\u00bb": '"', "\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'", "\u2026": "...", "\ufeff": "", "\u00a0": " "}


def leer_pre():
    import glob, re
    out = []
    for r in glob.glob(os.path.join(R, "preentrenar", "*.txt")):
        txt = open(r, encoding="utf8", errors="ignore").read()
        for a, b in NORM.items():
            txt = txt.replace(a, b)
        out.append(re.sub(r"\s+", " ", txt))
    return out


def ej_pre(idx, V, FIN, CTX, textos):
    if not textos:
        return []
    pref = [idx[c] for c in "otra|libre|0000|v0|ok>" if c in idx]
    if len(pref) != len("otra|libre|0000|v0|ok>"):
        print("prefijo de preentrenar no cabe en el vocabulario: lo omito")
        return []
    ventana = CTX - len(pref) - 2
    ventana = min(ventana, 150)
    out = []
    for txt in textos:
        i = 0
        while i < len(txt):
            w = txt[i : i + ventana]
            i += ventana
            malos = sum(1 for c in w if c not in idx)
            if len(w) < 40 or malos > len(w) * 0.03:
                continue
            ids = pref + [idx.get(c, idx[" "]) for c in w]
            out.append((ids, [0] * len(pref) + [1] * len(w), 1.0))
    random.seed(2)
    random.shuffle(out)
    print("preentrenar:", len(out), "ventanas de", len(textos), "archivos")
    return out


def main():
    filas = [json.loads(l) for l in open(os.path.join(R, "dataset.jsonl"), encoding="utf8")]
    minimo = int(os.environ.get("SLM_MIN", "200"))
    if len(filas) < minimo:
        sys.exit(f"dataset muy pequeno (<{minimo}). Corre preparar.py con mas datos o usa SLM_MIN=100 para probar")
    textos = leer_pre()
    frec = {}
    for t in textos:
        for c in t:
            frec[c] = frec.get(c, 0) + 1
    chars = sorted({c for x in filas for c in x["p"] + x["t"]} | {FIN, PAD} | {c for c, n in frec.items() if n >= 300 and c.isprintable()})
    idx = {c: i for i, c in enumerate(chars)}
    V = len(chars)
    ej = []
    for x in filas:
        p, t = x["p"], x["t"] + FIN
        ids = [idx[c] for c in p + t][:CTX]
        mask = [0] * len(p) + [1] * (len(ids) - len(p))
        ej.append((ids, mask[: len(ids)], max(0.2, 1 + x.get("r", 0))))
    random.seed(1)
    random.shuffle(ej)
    corte = max(1, len(ej) // 20)
    val, tr = ej[:corte], ej[corte:]
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    m = SLM(V).to(dev)
    print("parametros", sum(p.numel() for p in m.parameters()), "vocab", V, "dev", dev)
    global EPOCAS, BATCH
    if BATCH <= 0:
        BATCH = 16 if len(tr) < 4000 else 64
    if EPOCAS <= 0:
        EPOCAS = max(20, math.ceil(3000 / max(1, math.ceil(len(tr) / BATCH))))
    PACI = int(os.environ.get("SLM_PACIENCIA", "5"))

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

    def ciclo(tr, val, epocas, batch, lr, tag):
        opt = torch.optim.AdamW(m.parameters(), lr=lr, weight_decay=0.1)
        nb = math.ceil(len(tr) / batch)
        sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=epocas * nb)
        print(tag, "lote", batch, "epocas", epocas, "pasos", epocas * nb)
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
                m.eval()
                with torch.no_grad():
                    v = sum(perdida(val[i : i + batch]).item() for i in range(0, len(val), batch)) / max(1, math.ceil(len(val) / batch))
                print(f"{tag} epoca {ep + 1}/{epocas} {time.time() - t0:.0f}s train {tot / nb:.3f} val {v:.3f}")
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

    pre = ej_pre(idx, V, FIN, CTX, textos)
    lr = LR
    if pre:
        pv, pt = pre[: max(1, len(pre) // 50)], pre[max(1, len(pre) // 50) :]
        pb = 32
        pasos = int(os.environ.get("SLM_PRE_PASOS", "1500"))
        ciclo(pt, pv, max(1, pasos // max(1, math.ceil(len(pt) / pb))), pb, LR, "pre")
        lr = LR * 0.5
    ciclo(tr, val, EPOCAS, BATCH, lr, "ajuste")

    m.eval().cpu()
    dummy = torch.zeros(1, 24, dtype=torch.long)
    torch.onnx.export(m, dummy, os.path.join(R, "modelo.onnx"), input_names=["ids"], output_names=["logits"], dynamic_axes={"ids": {1: "t"}, "logits": {1: "t"}}, opset_version=17, dynamo=False)
    import re
    cuenta = {}
    for x in filas:
        for w in re.findall(r"[^\W\d_]+", x["t"].lower()):
            cuenta[w] = cuenta.get(w, 0) + 1
    palabras = sorted(cuenta, key=lambda w: -cuenta[w])[:30000]
    acc = sorted({x["p"].split("|")[0] for x in filas})
    est = sorted({x["p"].split("|")[1] for x in filas})
    json.dump({"chars": chars, "ctx": CTX, "fin": FIN, "acc": acc, "est": est, "palabras": palabras}, open(os.path.join(R, "vocab.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("listo: slm/modelo.onnx slm/vocab.json (copialos junto al bot)")


if __name__ == "__main__":
    main()
