import json, math, os, sys, random
import torch
import torch.nn as nn
import torch.nn.functional as F

R = os.path.dirname(os.path.abspath(__file__))
D = int(os.environ.get("SLM_D", "256"))
L = int(os.environ.get("SLM_L", "6"))
H = int(os.environ.get("SLM_H", "8"))
CTX = int(os.environ.get("SLM_CTX", "192"))
EPOCAS = int(os.environ.get("SLM_EPOCAS", "20"))
BATCH = int(os.environ.get("SLM_BATCH", "64"))
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


def main():
    filas = [json.loads(l) for l in open(os.path.join(R, "dataset.jsonl"), encoding="utf8")]
    if len(filas) < 200:
        sys.exit("dataset muy pequeno (<200). Corre preparar.py con mas datos")
    chars = sorted({c for x in filas for c in x["p"] + x["t"]} | {FIN, PAD})
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
    opt = torch.optim.AdamW(m.parameters(), lr=LR, weight_decay=0.01)
    pasos = EPOCAS * math.ceil(len(tr) / BATCH)
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, total_steps=pasos)

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

    for ep in range(EPOCAS):
        m.train()
        random.shuffle(tr)
        tot = 0
        for i in range(0, len(tr), BATCH):
            opt.zero_grad()
            l = perdida(tr[i : i + BATCH])
            l.backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
            sch.step()
            tot += l.item()
        m.eval()
        with torch.no_grad():
            v = sum(perdida(val[i : i + BATCH]).item() for i in range(0, len(val), BATCH)) / max(1, math.ceil(len(val) / BATCH))
        print(f"epoca {ep + 1}/{EPOCAS} train {tot / max(1, math.ceil(len(tr) / BATCH)):.3f} val {v:.3f}")

    m.eval().cpu()
    dummy = torch.zeros(1, 24, dtype=torch.long)
    torch.onnx.export(m, dummy, os.path.join(R, "modelo.onnx"), input_names=["ids"], output_names=["logits"], dynamic_axes={"ids": {1: "t"}, "logits": {1: "t"}}, opset_version=17, dynamo=False)
    json.dump({"chars": chars, "ctx": CTX, "fin": FIN}, open(os.path.join(R, "vocab.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("listo: slm/modelo.onnx slm/vocab.json (copialos junto al bot)")


if __name__ == "__main__":
    main()
