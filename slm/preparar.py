import json, os, sys, random, re, glob

R = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(R)
MIN_R = float(os.environ.get("SLM_MIN_R", "0.0"))
MAXLEN = 170
ESTILO_ARCH = [("sarcasmo", "burla_fallo"), ("gana", "burla_fallo"), ("muerte", "burla_fallo"), ("respawn", "burla_fallo"), ("provoc", "pregunta"), ("hablan", "pregunta"), ("amenaza", "frio"), ("rencor", "frio"), ("sadismo", "susurro"), ("odio", "escala"), ("atacan", "escala"), ("desprecio", "escala")]


def estilo_de(nombre):
    n = nombre.lower()
    for k, v in ESTILO_ARCH:
        if k in n:
            return v
    return "libre"


def q(x):
    return str(min(3, int(max(0.0, x) * 4)))


def prefijo(acc, est, rs, vb, vida):
    rs = (list(rs or []) + [0, 0, 0, 0])[:4]
    return f"{acc}|{est}|{''.join(q(x) for x in rs)}|{vb}|{vida}>"


def limpio(t):
    t = re.sub(r"\[[A-Z_]+[^\]]*\]", "", t or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def cargar(ruta):
    try:
        with open(ruta, encoding="utf8") as f:
            d = json.load(f)
        return d if isinstance(d, list) else []
    except Exception:
        return []


def main():
    filas = []
    for arch, minimo in (("corpus_am.json", MIN_R), ("corpus_lote.json", -9)):
        for e in cargar(os.path.join(RAIZ, arch)):
            f = limpio(e.get("f"))
            if not (12 <= len(f) <= MAXLEN) or e.get("r", 0) < minimo:
                continue
            partes = (e.get("i") or "otra|v0|ok|-").split("|") + ["v0", "ok"]
            filas.append({"p": prefijo(partes[0], e.get("e", "frio"), e.get("rs"), partes[1], partes[2]), "t": f, "r": e.get("r", 0.5)})
    for ruta in glob.glob(os.path.join(R, "datos", "*.txt")):
        est = estilo_de(os.path.basename(ruta))
        with open(ruta, encoding="utf8", errors="ignore") as fh:
            for linea in fh:
                f = limpio(linea)
                if 12 <= len(f) <= MAXLEN:
                    filas.append({"p": prefijo("otra", est, [0, 0, 0, 0], "v0", "ok"), "t": f, "r": 0.0})
    vistos, out = set(), []
    for x in filas:
        k = (x["p"], x["t"].lower())
        if k in vistos:
            continue
        vistos.add(k)
        out.append(x)
    random.seed(7)
    random.shuffle(out)
    with open(os.path.join(R, "dataset.jsonl"), "w", encoding="utf8") as f:
        for x in out:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"{len(out)} ejemplos -> slm/dataset.jsonl")
    if len(out) < 3000:
        print("pocos ejemplos: ideal >= 5000 (usa generar_lote.js y slm/datos/*.txt)")


if __name__ == "__main__":
    main()
