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


VB = {"atacar": ["v+", "v0"], "retroceder": ["v-", "v0"], "curar": ["v-", "v0"], "bloquear": ["v0", "v-"], "esquivar": ["v0", "v-"], "carga": ["v+", "v+"], "strafe": ["v0", "v0"], "otra": ["v0", "v0"]}
RIVAL = {"hostil": 0, "amenaza": 1, "suplica": 2, "burla": 3}
RIVAL_ESTILO = {"hostil": "frio", "amenaza": "susurro", "suplica": "frio", "burla": "burla_fallo"}
R_SEMILLA = float(os.environ.get("SLM_R_SEMILLA", "0.5"))


def semilla():
    out = []
    for ruta in sorted(glob.glob(os.path.join(R, "semilla", "*.json"))):
        acc = os.path.basename(ruta)[:-5]
        try:
            with open(ruta, encoding="utf8") as f:
                d = json.load(f)
        except Exception:
            continue
        for est, frases in d.items():
            for i, t in enumerate(frases):
                t = limpio(t)
                if not 12 <= len(t) <= MAXLEN:
                    continue
                if acc == "rival":
                    rs = [0, 0, 0, 0]
                    rs[RIVAL[est]] = 0.9
                    p = prefijo("otra", RIVAL_ESTILO[est], rs, "v0", "ok")
                else:
                    vb = VB.get(acc, ["v0"])[i % len(VB.get(acc, ["v0"]))]
                    p = prefijo(acc, est, [0, 0, 0, 0], vb, "bajo" if acc == "curar" else "ok")
                out.append({"p": p, "t": t, "r": R_SEMILLA})
    return out


def main():
    filas = []
    for arch, minimo in (("corpus_am.json", MIN_R), ("corpus_lote.json", -9)):
        for e in cargar(os.path.join(RAIZ, arch)):
            f = limpio(e.get("f"))
            if e.get("n"):
                f = re.sub(r"\b" + re.escape(e["n"]) + r"\b", "{n}", f)
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
    filas += semilla()
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
