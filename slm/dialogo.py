import json, os, random, re, unicodedata, sys
R = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(R, "dialogo_base.json"), encoding="utf8"))
SEM = os.path.join(R, "semilla")
random.seed(int(os.environ.get("SLM_SEED", "5")))
N = int(os.environ.get("SLM_DIALOGOS", "40000"))
EST = {"f": "frio", "e": "escala", "r": "repeticion", "b": "burla_fallo", "p": "pregunta", "o": "orden", "s": "susurro", "m": "promesa"}
PSI = {"odio": "m", "desprecio": "f", "sadismo": "s", "dominio": "o", "frustracion": "e", "hastio": "p", "fascinacion": "s", "frialdad": "f"}

def sin_acentos(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")

def aumentar(t):
    r = random.random()
    if r < 0.35:
        return t
    if r < 0.55:
        return t.lower()
    if r < 0.7:
        return sin_acentos(t).lower()
    if r < 0.8:
        return re.sub(r"[¿?¡!.,]", "", t).lower()
    if r < 0.88:
        return "AM, " + t.lower()
    if r < 0.94:
        return t + ("?" if "?" not in t else "")
    return sin_acentos(t).lower() + random.choice(["", " xd", " jaja", " bro"])

LEX = json.load(open(os.path.join(R, "lexico.json"), encoding="utf8"))
ART = {("m", "s"): ("el", "un", "mi"), ("f", "s"): ("la", "una", "mi"), ("m", "p"): ("los", "unos", "mis"), ("f", "p"): ("las", "unas", "mis")}
PRE_ = ["", "", "", "", "", "oye, ", "mira, ", "bueno, ", "pues ", "a ver, ", "dime, ", "entonces ", "ok, ", "hey, ", "AM, "]
SUF_ = ["", "", "", "", "", " bro", " jaja", " xd", " AM", ", bot", " pues", " entonces"]

def sorteo_x():
    if random.random() < 0.3:
        return random.choice(B["X"])
    w, g, n = random.choice(LEX["nouns"])
    return random.choice(ART[(g, n)]) + " " + w

def sorteo_e():
    return random.choice(B["E"]) if random.random() < 0.55 else random.choice(LEX["adj"])

def sorteo_n():
    return random.choice(B["N"]) if random.random() < 0.4 else random.choice(LEX["names"])

def cap(t):
    return t[:1].upper() + t[1:]

def llenar(t, v):
    for k, x in v.items():
        t = t.replace("{" + k + "}", x)
    return re.sub(r"\bde el\b", "del", re.sub(r"\ba el\b", "al", t))

def generico():
    out = []
    for d, fr in json.load(open(os.path.join(SEM, "psique.json"), encoding="utf8")).items():
        out += [(PSI.get(d, "f"), t) for t in fr]
    o = json.load(open(os.path.join(SEM, "otra.json"), encoding="utf8"))
    inv = {v: k[0] for k, v in EST.items()}
    inv = {"frio": "f", "escala": "e", "repeticion": "r", "burla_fallo": "b", "pregunta": "p", "orden": "o", "susurro": "s", "promesa": "m"}
    for est, fr in o.items():
        out += [(inv.get(est, "f"), t) for t in fr]
    return out

def ruido():
    fr = []
    for f in ("cess.txt", "conll.txt"):
        p = os.path.join(R, "preentrenar", f)
        if os.path.exists(p):
            fr += [l.strip() for l in open(p, encoding="utf8") if 15 <= len(l.strip()) <= 90]
    return fr

def main():
    C = B["C"]
    nombres = list(C)
    gen, rui = generico(), ruido()
    vistos, out = set(), []
    intentos = 0
    nr = 0
    while len(out) < N and intentos < N * 20:
        intentos += 1
        if rui and nr < N * 0.12 and random.random() < 0.12:
            u = random.choice(rui)
            e, t = random.choice(gen)
            rs, cat = "0000", "ruido"
            nr += 1
        else:
            cat = random.choice(nombres)
            c = C[cat]
            v = {"X": sorteo_x(), "E": sorteo_e(), "N": sorteo_n()}
            u = aumentar(random.choice(PRE_) + llenar(random.choice(c["u"]), v) + random.choice(SUF_))
            e, t = random.choice(c["r"]).split("|", 1)
            t = cap(llenar(t, v))
            rs = c["rs"] if random.random() > 0.2 else "0000"
        k = (u, t)
        if k in vistos:
            continue
        vistos.add(k)
        out.append({"u": u, "e": EST[e], "rs": rs, "t": t, "c": cat})
    random.shuffle(out)
    with open(os.path.join(R, "chat_dataset.jsonl"), "w", encoding="utf8") as fh:
        for x in out:
            fh.write(json.dumps(x, ensure_ascii=False) + "\n")
    cnt = {}
    for x in out:
        cnt[x["c"]] = cnt.get(x["c"], 0) + 1
    print(len(out), "pares", dict(sorted(cnt.items(), key=lambda a: -a[1])[:6]), "...", len(cnt), "categorias")

if __name__ == "__main__":
    main()
