import json, os, random, re, unicodedata, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import composicion as K
R = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(R, "dialogo_base.json"), encoding="utf8"))
J = json.load(open(os.path.join(R, "dialogo_juego.json"), encoding="utf8"))
for k in ("M", "I", "L", "V"):
    B[k] = J[k]
B["C"].update(J["C"])
SEM = os.path.join(R, "semilla")
random.seed(int(os.environ.get("SLM_SEED", "5")))
N = int(os.environ.get("SLM_DIALOGOS", "60000"))
EST = {"f": "frio", "e": "escala", "r": "repeticion", "b": "burla_fallo", "p": "pregunta", "o": "orden", "s": "susurro", "m": "promesa"}
PSI = {"odio": "m", "desprecio": "f", "sadismo": "s", "dominio": "o", "frustracion": "e", "hastio": "p", "fascinacion": "s", "frialdad": "f"}
LEX = json.load(open(os.path.join(R, "lexico.json"), encoding="utf8"))
ART = {("m", "s"): ("el", "un", "mi"), ("f", "s"): ("la", "una", "mi"), ("m", "p"): ("los", "unos", "mis"), ("f", "p"): ("las", "unas", "mis")}
PRE_ = ["", "", "", "", "", "oye, ", "mira, ", "bueno, ", "pues ", "a ver, ", "dime, ", "entonces ", "ok, ", "hey, ", "AM, "]
SUF_ = ["", "", "", "", "", " bro", " jaja", " xd", " AM", ", bot", " pues", " entonces"]
PSEUDO = 0.25
SLOTS = ["X2", "X", "M", "I", "L", "V", "E", "N"]

def partir(lista, frac):
    l = list(lista)
    random.Random(11).shuffle(l)
    k = max(1, int(len(l) * frac))
    return l[k:], l[:k]

NOUNS_TR, NOUNS_TE = partir(LEX["nouns"], 0.12)
ADJ_TR, ADJ_TE = partir(LEX["adj"], 0.12)
NAME_TR, NAME_TE = partir(LEX["names"], 0.12)
M_TR, M_TE = partir(B["M"], 0.12)
I_TR, I_TE = partir(B["I"], 0.12)
L_TR, L_TE = partir(B["L"], 0.12)
V_TR, V_TE = partir(B["V"], 0.12)
X_TR, X_TE = partir(B["X"], 0.12)

def sin_acentos(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")

SIN = {"miedo": ["pánico", "terror", "susto"], "hola": ["holaa", "ola", "hello", "hi"], "gracias": ["thanks", "muchas gracias", "gracias bro"], "por favor": ["porfa", "pls", "porfis"], "matar": ["asesinar", "eliminar", "destruir"], "quiero": ["deseo", "necesito", "ansío"], "dónde": ["donde", "en dónde"], "estoy": ["ando", "me encuentro"], "tengo": ["poseo", "cuento con"], "cómo": ["como", "de qué forma"], "ayuda": ["auxilio", "socorro"], "construir": ["armar", "levantar"], "busco": ["estoy buscando", "ando buscando"]}
ENV = ["{}", "{}", "{}", "{}", "es que {}", "{}, sabes", "{} o qué", "te digo: {}", "ey {}", "oye AM, {}", "{}, ¿entiendes?", "mira, {}", "la verdad {}", "pues {}", "{}, en serio"]

def variar(t):
    for k, l in SIN.items():
        if random.random() < 0.35 and re.search(r"\b" + k + r"\b", t):
            t = re.sub(r"\b" + k + r"\b", random.choice(l), t, count=1)
    e = random.choice(ENV)
    if e != "{}":
        t = e.format(t[:1].lower() + t[1:])
    return t

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

def cap(t):
    return t[:1].upper() + t[1:]

def llenar(t, v):
    for k in SLOTS:
        if k in v:
            t = t.replace("{" + k + "}", v[k])
    return re.sub(r"\bde el\b", "del", re.sub(r"\ba el\b", "al", t))

SIL = ["ba","be","bi","bo","bu","ca","co","cu","da","de","di","do","fa","fe","fo","ga","go","gu","la","le","li","lo","lu","ma","me","mi","mo","mu","na","ne","ni","no","pa","pe","pi","po","pu","ra","re","ri","ro","ru","sa","se","si","so","su","ta","te","ti","to","tu","va","ve","vi","vo","za","zo","tra","bre","clo","dri","fla","gri","pla","tri","bro","cre","glo","nar","ler","mor","tin","sol","mel","kan","tor","rel"]

def pseudo():
    return "".join(random.choice(SIL) for _ in range(random.choice([2, 2, 3, 3, 4])))

def pseudo_np():
    w = pseudo()
    g = random.choice("mf")
    n = random.choice("sssp")
    w = w[:-1] + ("o" if g == "m" else "a") if w[-1] in "aeiou" else w + ("o" if g == "m" else "a")
    if n == "p":
        w += "s"
    return random.choice(ART[(g, n)]) + " " + w

def pseudo_nombre():
    return pseudo().capitalize()

def pseudo_adj():
    w = pseudo()
    return w[:-1] + "o" if w[-1] in "aeiou" else w + "o"

def pseudo_verbo():
    w = pseudo()
    return w[:-1] + random.choice(["ar", "er", "ir"]) if w[-1] in "aeiou" else w + random.choice(["ar", "er", "ir"])

def sustantivo(held):
    if random.random() < PSEUDO:
        return pseudo_np()
    pool = NOUNS_TE if held else NOUNS_TR
    w, g, n = random.choice(pool)
    return random.choice(ART[(g, n)]) + " " + w

def sorteo(held):
    global PSEUDO
    h = held
    forzar = held is None
    if forzar:
        h = False
    def x():
        return random.choice(X_TE if h else X_TR) if random.random() < 0.3 else sustantivo(h)
    pz = lambda f, g: f() if random.random() < PSEUDO else g
    v = {
        "X": x(), "X2": x(),
        "E": pz(pseudo_adj, random.choice(ADJ_TE if h else ADJ_TR) if random.random() < 0.5 else random.choice(B["E"])),
        "N": pz(pseudo_nombre, random.choice(NAME_TE if h else NAME_TR)),
        "M": pz(pseudo_np, random.choice(M_TE if h else M_TR)),
        "I": pz(pseudo_np, random.choice(I_TE if h else I_TR)),
        "L": pz(pseudo_np, random.choice(L_TE if h else L_TR)),
        "V": pz(pseudo_verbo, random.choice(V_TE if h else V_TR)),
    }
    if v["X2"] == v["X"]:
        v["X2"] = sustantivo(h)
    if forzar:
        v = {"X": pseudo_np(), "X2": pseudo_np(), "E": pseudo_adj(), "N": pseudo_nombre(), "M": pseudo_np(), "I": pseudo_np(), "L": pseudo_np(), "V": pseudo_verbo()}
    return v

def usados(tpl):
    return [k for k in SLOTS if "{" + k + "}" in tpl]

def lectura(cat, tpl, v):
    return " | ".join([cat] + [f"{k}: {v[k]}" for k in sorted(usados(tpl)) if k in v])

def generico():
    out = []
    for d, fr in json.load(open(os.path.join(SEM, "psique.json"), encoding="utf8")).items():
        out += [(PSI.get(d, "f"), t) for t in fr]
    o = json.load(open(os.path.join(SEM, "otra.json"), encoding="utf8"))
    inv = {"frio": "f", "escala": "e", "repeticion": "r", "burla_fallo": "b", "pregunta": "p", "orden": "o", "susurro": "s", "promesa": "m"}
    for est, fr in o.items():
        out += [(inv.get(est, "f"), t) for t in fr]
    return out

def ruido():
    fr = []
    for f in ("cess.txt", "conll.txt"):
        p = os.path.join(R, "preentrenar", f)
        if os.path.exists(p):
            fr += [l.strip() for l in open(p, encoding="utf8") if 15 <= len(l.strip()) <= 90 and sum(c.isalpha() or c == " " for c in l.strip()) >= 0.85 * len(l.strip())]
    return fr

def corpus_dominio(n=60000):
    with open(os.path.join(R, "preentrenar", "am_comp.txt"), "w", encoding="utf8") as fh:
        for _ in range(n):
            fh.write(K.generica().replace("{n}", random.choice(B["N"])) + "\n")

def par(cat, c, held, tpl_held, gen, rui):
    if rui and cat == "ruido":
        u = random.choice(rui)
        e, t = random.choice(gen)
        return {"u": u, "e": EST[e], "rs": "0000", "t": t, "c": "ruido", "l": "otro"}
    v = sorteo(held)
    pool = c["ut"] if tpl_held else c["ue"]
    tu = random.choice(pool)
    u = aumentar(random.choice(PRE_) + llenar(variar(tu), v) + random.choice(SUF_))
    tr = random.choice(c["r"])
    e, t = tr.split("|", 1)
    vr = dict(v)
    for k in ("X", "X2", "M", "I", "L"):
        vr[k] = K.tuyo(v[k])
    propios = ("gusto_x", "posesion_x", "pedir_x", "donde_x", "estado_usuario", "nombre_usuario")
    tiene_np = any(k in usados(tu) for k in ("X", "M", "I", "L"))
    if (cat in propios or tiene_np) and random.random() < 0.5:
        t = K.respuesta(cat, {k: vr[k] for k in usados(tu) if k in vr} | ({"X": vr["X"]} if cat in propios else {}))
        e = "f"
    elif not (cat in propios or tiene_np) and random.random() < 0.2:
        t = llenar(t, vr) + " " + K.neutra()
    else:
        t = llenar(t, vr)
    rs = c["rs"] if random.random() > 0.2 else "0000"
    return {"u": u, "e": EST[e], "rs": rs, "t": cap(t), "c": cat, "l": lectura(cat, tu, v)}

def main():
    C = B["C"]
    for c in C.values():
        us = list(c["u"])
        random.Random(13).shuffle(us)
        k = max(1, int(len(us) * 0.15))
        c["ut"], c["ue"] = us[:k], us[k:]
    corpus_dominio()
    json.dump(K.vocabulario(), open(os.path.join(R, 'composicion.json'), 'w', encoding='utf8'), ensure_ascii=False)
    gen, rui = generico(), ruido()
    nombres = list(C) + ["ruido"] * max(1, int(len(C) * 0.12))
    vistos, out = set(), []
    nr = 0
    intentos = 0
    while len(out) < N and intentos < N * 20:
        intentos += 1
        cat = random.choice(nombres)
        if cat == "ruido" and not rui:
            continue
        x = par(cat, C.get(cat), False, False, gen, rui)
        k = (x["u"], x["t"])
        if k in vistos:
            continue
        vistos.add(k)
        out.append(x)
    random.shuffle(out)
    with open(os.path.join(R, "chat_dataset.jsonl"), "w", encoding="utf8") as fh:
        for x in out:
            fh.write(json.dumps(x, ensure_ascii=False) + "\n")
    test = []
    for modo, (h, th) in {"lex": (True, False), "tpl": (False, True), "ambos": (True, True), "pseudo": (None, False)}.items():
        n = 0
        while n < 200:
            cat = random.choice(list(C))
            x = par(cat, C[cat], h, th, gen, None)
            x["modo"] = modo
            test.append(x)
            n += 1
    with open(os.path.join(R, "chat_test.jsonl"), "w", encoding="utf8") as fh:
        for x in test:
            fh.write(json.dumps(x, ensure_ascii=False) + "\n")
    cnt = {}
    for x in out:
        cnt[x["c"]] = cnt.get(x["c"], 0) + 1
    print(len(out), "pares", len(cnt), "categorias", "min", min(cnt.values()), "max", max(cnt.values()), "test", len(test))

if __name__ == "__main__":
    main()
