import glob, os, random, re
R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, "conceptos")
ES = {"f": "frio", "e": "escala", "r": "repeticion", "b": "burla_fallo", "p": "pregunta", "o": "orden", "s": "susurro", "m": "promesa"}

def cargar():
    C, dom = [], "general"
    for f in sorted(glob.glob(os.path.join(D, "*.txt"))):
        if f.endswith("remates.txt"):
            continue
        dom = os.path.basename(f)[:-4]
        for l in open(f, encoding="utf8"):
            l = l.rstrip("\n")
            if not l.strip() or l.startswith("#"):
                continue
            if l.startswith("@"):
                t = [x.strip() for x in l[1:].split("|") if x.strip()]
                C.append({"t": t, "h": [], "a": [], "d": dom})
            elif l.startswith("- ") and C:
                C[-1]["h"].append(l[2:].strip())
            elif l.startswith("+ ") and C and "|" in l:
                e, x = l[2:].split("|", 1)
                C[-1]["a"].append((e.strip(), x.strip()))
    return C

def remates():
    P, S, k = [], [], None
    for l in open(os.path.join(D, "remates.txt"), encoding="utf8"):
        l = l.rstrip("\n")
        if l.startswith("## "):
            k = l[3:]
        elif "|" in l:
            e, x = l.split("|", 1)
            (P if k == "pre" else S).append((e, x))
    return P, S

Q1 = ["qué es {X}", "que es {X}", "qué es un {X}", "qué son {X}", "define {X}", "defíneme {X}", "explícame qué es {X}", "explícame {X}", "dime qué es {X}", "sabes qué es {X}", "qué significa {X}", "qué quiere decir {X}", "en qué consiste {X}", "cuéntame sobre {X}", "háblame de {X}", "q es {X}", "que significa {X}", "a qué llamamos {X}", "para qué sirve {X}", "para qué sirven {X}", "me puedes explicar {X}", "no entiendo {X}", "ayúdame con {X}, qué es", "dime algo de {X}", "qué sabes de {X}", "concepto de {X}", "definición de {X}", "{X} qué es", "qué se entiende por {X}", "cómo funciona {X}", "cómo se define {X}", "me explicas {X}", "AM, qué es {X}", "oye qué es {X}", "explica {X} fácil", "qué es eso de {X}", "pregunta: qué es {X}", "{X}?", "de qué trata {X}", "qué entiendes por {X}"]
Q2 = ["diferencia entre {X} y {X2}", "qué diferencia hay entre {X} y {X2}", "{X} vs {X2}", "en qué se distinguen {X} y {X2}", "no entiendo la diferencia entre {X} y {X2}", "{X} o {X2}, cuál es cuál", "cómo se diferencian {X} y {X2}", "explícame {X} y {X2}", "qué es {X} y qué es {X2}", "diferencias de {X} con {X2}", "compara {X} y {X2}", "{X} y {X2} son lo mismo"]
Q3 = ["¿y {X}?", "y {X}?", "¿y qué es {X}?", "y {X} qué es", "¿y {X} entonces?", "ahora {X}", "ok, ¿y {X}?", "y de {X} qué me dices"]
def partir(l, frac, seed):
    l = list(l)
    random.Random(seed).shuffle(l)
    k = max(1, int(len(l) * frac))
    return l[k:], l[:k]

Q1_TR, Q1_TE = partir(Q1, 0.15, 21)
Q2_TR, Q2_TE = partir(Q2, 0.25, 22)
Q3_TR, Q3_TE = partir(Q3, 0.25, 23)

def termino(c):
    t = random.choice(c["t"])
    if random.random() < 0.15 and " " not in t and t[-1] in "aeiou":
        t = t + "s"
    return t

def plantilla(q, X, X2=None):
    u = q.replace("{X}", X)
    if X2:
        u = u.replace("{X2}", X2)
    return u

def componer(hechos, pre, post, a=None):
    h = " ".join(hechos)
    r = random.random()
    if a and r < 0.35:
        return a
    e, x = random.choice(post)
    if r < 0.8:
        return e, h + " " + x
    pe, px = random.choice(pre)
    return pe, px + " " + h

def pares(n, hold, sucio, aumentar, PRE_, SUF_):
    C = cargar()
    pre, post = remates()
    q1 = Q1_TE if hold else Q1_TR
    q2 = Q2_TE if hold else Q2_TR
    q3 = Q3_TE if hold else Q3_TR
    por = {}
    for c in C:
        por.setdefault(c["d"], []).append(c)
    out = []
    for c in C:
        for _ in range(n):
            r = random.random()
            p = ""
            if r < 0.18 and len(por[c["d"]]) > 1:
                o = random.choice([x for x in por[c["d"]] if x is not c])
                X, X2 = termino(c), termino(o)
                u = plantilla(random.choice(q2), X, X2)
                hs = [c["h"][0], o["h"][0]]
                if sum(len(x) for x in hs) > 200:
                    continue
                e, t = componer(hs, pre, post)
                l = f"definicion | X: {X} | X2: {X2}"
            elif r < 0.30 and len(por[c["d"]]) > 1:
                o = random.choice([x for x in por[c["d"]] if x is not c])
                X = termino(c)
                u = plantilla(random.choice(q3), X)
                p = f"definicion | X: {termino(o)}"
                e, t = componer([random.choice(c["h"])], pre, post, random.choice(c["a"]) if c["a"] else None)
                l = f"definicion | X: {X}"
            else:
                X = termino(c)
                u = plantilla(random.choice(q1), X)
                e, t = componer([random.choice(c["h"])], pre, post, random.choice(c["a"]) if c["a"] else None)
                l = f"definicion | X: {X}"
            if len(t) > 235:
                continue
            u = aumentar(random.choice(PRE_) + (sucio(u) if random.random() < 0.3 else u) + random.choice(SUF_))
            out.append({"u": u, "e": ES.get(e, "frio"), "rs": "0000", "t": t[:1].upper() + t[1:], "c": "definicion", "l": l, "f": "", "m": "", "p": p})
    return out
