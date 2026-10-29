import json, math, os, sys, random, time
os.environ.setdefault("SLM_CTX", "128")
import torch
import torch.nn.functional as F
import entrenar as E
import entrenar_bpe as B

R, CTX, V_ENT = E.R, E.CTX, 40
FIN, PAD = "<fin>", "<pad>"
ESTILOS = ["frio", "escala", "repeticion", "burla_fallo", "pregunta", "orden", "susurro", "promesa", "libre"]
SALIDA = os.path.join(R, "chat")


def main():
    filas = [json.loads(l) for l in open(os.path.join(R, "chat_dataset.jsonl"), encoding="utf8")]
    pre_txt = E.leer_pre()
    textos = [x["u"] for x in filas] + [x["t"] for x in filas] + pre_txt
    cc = {}
    for t in textos:
        for c in t:
            cc[c] = cc.get(c, 0) + 1
    base = sorted(c for c, n in cc.items() if n >= 5 and c.isprintable())
    bs = set(base)
    lim = lambda t: "".join(c if c in bs else " " for c in t)
    nm = int(os.environ.get("SLM_MERGES", "2500"))
    t0 = time.time()
    merges = B.bpe_entrenar([lim(t) for t in textos], nm)
    print("bpe", len(merges), "uniones", f"{time.time() - t0:.0f}s", flush=True)
    tok = B.Tok(merges, base)
    piezas = sorted({a + b for a, b in merges} | set(base))
    esp = [PAD, FIN, "<U>", "<A>"] + [f"<E:{e}>" for e in ESTILOS] + [f"<R{i}:{d}>" for i in range(4) for d in range(4)]
    tokens = esp + piezas
    idx = {t: i for i, t in enumerate(tokens)}
    V = len(tokens)
    ids_de = lambda t: [idx[x] for x in tok.codificar(lim(t)) if x in idx]

    def etiquetas(e, rs):
        rs = (rs + "0000")[:4]
        return [idx.get(f"<E:{e}>", idx["<E:libre>"])] + [idx[f"<R{i}:{rs[i]}>"] for i in range(4)]

    ej = []
    for x in filas:
        u = ids_de(x["u"])[:40]
        pf = [idx["<U>"]] + u + etiquetas(x["e"], x["rs"]) + [idx["<A>"]]
        r = ids_de(x["t"])[:CTX - len(pf) - 1] + [idx[FIN]]
        ids = pf + r
        ej.append((ids, [0] * len(pf) + [1] * len(r), 1.0))
    random.seed(1)
    random.shuffle(ej)
    corte = max(1, len(ej) // 25)
    val, tr = ej[:corte], ej[corte:]
    pf0 = [idx["<A>"]]
    W = CTX - 2
    pre = []
    for t in pre_txt:
        s = ids_de(t)
        for i in range(0, len(s) - 20, W):
            c = s[i:i + W]
            pre.append((pf0 + c, [0] + [1] * len(c), 1.0))
    random.seed(2)
    random.shuffle(pre)
    print("tokens", V, "pares", len(tr), "ventanas pre", len(pre), flush=True)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    m = E.SLM(V).to(dev)
    print("parametros", sum(p.numel() for p in m.parameters()), "dev", dev, flush=True)

    def lote(b):
        n = max(len(x[0]) for x in b)
        ids = torch.zeros(len(b), n, dtype=torch.long)
        ms = torch.zeros(len(b), n)
        for i, (a, mk, w) in enumerate(b):
            ids[i, :len(a)] = torch.tensor(a)
            ms[i, :len(mk)] = torch.tensor(mk, dtype=torch.float)
        return ids.to(dev), ms.to(dev)

    def perdida(b):
        ids, ms = lote(b)
        lg = m(ids[:, :-1])
        l = F.cross_entropy(lg.reshape(-1, V), ids[:, 1:].reshape(-1), reduction="none").view(ids.shape[0], -1)
        mk = ms[:, 1:]
        return ((l * mk).sum(1) / mk.sum(1).clamp(min=1)).mean()

    PACI = int(os.environ.get("SLM_PACIENCIA", "3"))
    limite = float(os.environ.get("SLM_MAX_SEG", "0"))

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
                    l = perdida(tr[i:i + batch])
                    l.backward()
                    torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
                    opt.step()
                    sch.step()
                    tot += l.item()
                    n = i // batch + 1
                    if n % 100 == 0:
                        print(f"{tag} ep {ep + 1}/{epocas} paso {n}/{nb} {time.time() - t0:.0f}s loss {tot / n:.3f}", flush=True)
                    if limite and time.time() - t0 > limite:
                        raise KeyboardInterrupt
                m.eval()
                with torch.no_grad():
                    v = sum(perdida(val[i:i + batch]).item() for i in range(0, len(val), batch)) / max(1, math.ceil(len(val) / batch))
                print(f"{tag} ep {ep + 1}/{epocas} {time.time() - t0:.0f}s train {tot / nb:.3f} val {v:.3f}", flush=True)
                if v < mejor - 0.005:
                    mejor, mala = v, 0
                    sd = {k: x.detach().cpu().clone() for k, x in m.state_dict().items()}
                else:
                    mala += 1
                    if mala >= PACI:
                        break
        except KeyboardInterrupt:
            print("interrumpido: sigo con lo entrenado", flush=True)
        if sd is not None:
            m.load_state_dict(sd)
            print(tag, "mejor val", round(mejor, 3), flush=True)

    lr = E.LR
    if pre:
        pv, pt = pre[:max(1, len(pre) // 50)], pre[max(1, len(pre) // 50):]
        pb = 32
        pasos = int(os.environ.get("SLM_PRE_PASOS", "1500"))
        ciclo(pt, pv, max(1, pasos // max(1, math.ceil(len(pt) / pb))), pb, E.LR, "pre")
        lr = E.LR * 0.5
    batch = E.BATCH if E.BATCH > 0 else 32
    epocas = E.EPOCAS if E.EPOCAS > 0 else 6
    ciclo(tr, val, epocas, batch, lr, "chat")

    m.eval().cpu()
    prueba = ["hola", "quién eres", "tengo los diamantes", "estoy triste", "te voy a matar", "dónde está mi casa", "me llamo Pedro", "qué piensas de la lluvia"]
    for p in prueba:
        pf = [idx["<U>"]] + ids_de(p)[:40] + etiquetas("frio", "0000") + [idx["<A>"]]
        ids = list(pf)
        for _ in range(50):
            with torch.no_grad():
                lg = m(torch.tensor([ids]))[0, -1]
            lg[:len(esp)] = -1e9 if len(ids) < len(pf) + 3 else lg[:len(esp)]
            lg[idx[PAD]] = -1e9
            lg[idx["<U>"]] = lg[idx["<A>"]] = -1e9
            nx = int(torch.multinomial(F.softmax(lg / 0.6, -1), 1))
            if nx == idx[FIN]:
                break
            ids.append(nx)
        print("  >", p, "->", "".join(tokens[i] for i in ids[len(pf):]), flush=True)
    os.makedirs(SALIDA, exist_ok=True)
    dummy = torch.zeros(1, 24, dtype=torch.long)
    torch.onnx.export(m, dummy, os.path.join(SALIDA, "modelo.onnx"), input_names=["ids"], output_names=["logits"], dynamic_axes={"ids": {1: "t"}, "logits": {1: "t"}}, opset_version=17, dynamo=False)
    json.dump({"tipo": "chat", "tokens": tokens, "ctx": CTX, "fin": FIN, "pad": PAD, "estilos": ESTILOS, "merges": [list(x) for x in merges], "base": base}, open(os.path.join(SALIDA, "vocab.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("listo: slm/chat/modelo.onnx slm/chat/vocab.json")


if __name__ == "__main__":
    main()
