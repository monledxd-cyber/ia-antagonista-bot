import random
import conceptos as CO

T = """H hidrógeno 1 nm g|He helio 4 gn g|Li litio 7 al s|Be berilio 9 at s|B boro 11 md s|C carbono 12 nm s|N nitrógeno 14 nm g|O oxígeno 16 nm g|F flúor 19 ha g|Ne neón 20 gn g|Na sodio 23 al s|Mg magnesio 24 at s|Al aluminio 27 om s|Si silicio 28 md s|P fósforo 31 nm s|S azufre 32 nm s|Cl cloro 35 ha g|Ar argón 40 gn g|K potasio 39 al s|Ca calcio 40 at s|Sc escandio 45 tr s|Ti titanio 48 tr s|V vanadio 51 tr s|Cr cromo 52 tr s|Mn manganeso 55 tr s|Fe hierro 56 tr s|Co cobalto 59 tr s|Ni níquel 59 tr s|Cu cobre 64 tr s|Zn zinc 65 tr s|Ga galio 70 om s|Ge germanio 73 md s|As arsénico 75 md s|Se selenio 79 nm s|Br bromo 80 ha l|Kr kriptón 84 gn g|Rb rubidio 85 al s|Sr estroncio 88 at s|Y itrio 89 tr s|Zr circonio 91 tr s|Nb niobio 93 tr s|Mo molibdeno 96 tr s|Tc tecnecio 98 tr s|Ru rutenio 101 tr s|Rh rodio 103 tr s|Pd paladio 106 tr s|Ag plata 108 tr s|Cd cadmio 112 tr s|In indio 115 om s|Sn estaño 119 om s|Sb antimonio 122 md s|Te telurio 128 md s|I yodo 127 ha s|Xe xenón 131 gn g|Cs cesio 133 al s|Ba bario 137 at s|La lantano 139 la s|Ce cerio 140 la s|Pr praseodimio 141 la s|Nd neodimio 144 la s|Pm prometio 145 la s|Sm samario 150 la s|Eu europio 152 la s|Gd gadolinio 157 la s|Tb terbio 159 la s|Dy disprosio 163 la s|Ho holmio 165 la s|Er erbio 167 la s|Tm tulio 169 la s|Yb iterbio 173 la s|Lu lutecio 175 la s|Hf hafnio 178 tr s|Ta tantalio 181 tr s|W wolframio 184 tr s|Re renio 186 tr s|Os osmio 190 tr s|Ir iridio 192 tr s|Pt platino 195 tr s|Au oro 197 tr s|Hg mercurio 201 tr l|Tl talio 204 om s|Pb plomo 207 om s|Bi bismuto 209 om s|Po polonio 209 om s|At astato 210 ha s|Rn radón 222 gn g|Fr francio 223 al s|Ra radio 226 at s|Ac actinio 227 ac s|Th torio 232 ac s|Pa protactinio 231 ac s|U uranio 238 ac s|Np neptunio 237 ac s|Pu plutonio 244 ac s|Am americio 243 ac s|Cm curio 247 ac s|Bk berkelio 247 ac s|Cf californio 251 ac s|Es einstenio 252 ac s|Fm fermio 257 ac s|Md mendelevio 258 ac s|No nobelio 259 ac s|Lr laurencio 266 ac s|Rf rutherfordio 0 x x|Db dubnio 0 x x|Sg seaborgio 0 x x|Bh bohrio 0 x x|Hs hasio 0 x x|Mt meitnerio 0 x x|Ds darmstatio 0 x x|Rg roentgenio 0 x x|Cn copernicio 0 x x|Nh nihonio 0 x x|Fl flerovio 0 x x|Mc moscovio 0 x x|Lv livermorio 0 x x|Ts tenesino 0 x x|Og oganesón 0 x x"""
CAT = {"nm": "un no metal", "al": "un metal alcalino", "at": "un metal alcalinotérreo", "md": "un metaloide", "ha": "un halógeno", "gn": "un gas noble", "om": "un metal del bloque p", "tr": "un metal de transición", "la": "un lantánido", "ac": "un actínido"}
EST = {"g": "un gas", "s": "un sólido", "l": "un líquido"}
RAD = {"Tc", "Pm"}
UN = "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve".split()
DE = {3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa"}
CE = {1: "ciento", 2: "doscientos", 3: "trescientos"}

def pw(n):
    if n < 30:
        return UN[n]
    if n < 100:
        d, u = divmod(n, 10)
        return DE[d] if u == 0 else DE[d] + " y " + UN[u]
    if n == 100:
        return "cien"
    c, r = divmod(n, 100)
    return CE[c] + ("" if r == 0 else " " + pw(r))

E = []
for i, s in enumerate(T.split("|")):
    sim, nom, m, c, e = s.split()
    E.append({"z": i + 1, "s": sim, "n": nom, "m": int(m), "c": c, "e": e, "r": sim in RAD or i + 1 >= 84})

def hechos(x):
    n, z = x["n"], pw(x["z"])
    h = [f"El {n} tiene símbolo {x['s']} y número atómico {z}."]
    if x["c"] != "x":
        h.append(f"El {n}, símbolo {x['s']}, es {CAT[x['c']]} y es {EST[x['e']]} a temperatura ambiente.")
        h.append(f"El {n} tiene número atómico {z} y masa atómica cercana a {pw(x['m'])}.")
        if x["r"]:
            h.append(f"El {n} es un elemento radiactivo, símbolo {x['s']}.")
    else:
        h.append(f"El {n} es un elemento sintético y radiactivo de número atómico {z}, símbolo {x['s']}.")
    return h

QN = ["qué es el {X}", "háblame del {X}", "qué sabes del {X}", "dime del elemento {X}", "cuéntame sobre el {X}", "qué elemento es el {X}", "explícame el {X}", "datos del {X}", "info del {X}", "q es el {X}", "el {X}, qué es", "definición del {X}", "describe el {X}", "dime algo del {X}", "qué propiedades tiene el {X}"]
QS = ["qué elemento es {X}", "qué es {X} en la tabla periódica", "a qué elemento corresponde {X}", "qué significa {X} en química", "{X} qué elemento es", "quién es {X} en la tabla periódica", "símbolo {X}, de qué elemento", "de qué es símbolo {X}"]
QZ = ["qué elemento tiene número atómico {X}", "cuál es el elemento número {X}", "elemento con {X} protones", "qué elemento tiene {X} protones", "el elemento {X} de la tabla periódica, cuál es", "número atómico {X}, qué elemento es", "qué elemento es el número {X}", "cuál es el elemento {X}"]
QY = ["cuál es el símbolo del {X}", "símbolo del {X}", "cómo se simboliza el {X}", "con qué letras se escribe el {X}", "cuál es la sigla del {X}", "qué símbolo tiene el {X}"]
QP = ["cuántos protones tiene el {X}", "número atómico del {X}", "cuál es el número atómico del {X}", "cuántos protones hay en el {X}", "qué número atómico tiene el {X}"]
QT = ["de qué tipo es el {X}", "a qué familia pertenece el {X}", "el {X} es metal", "en qué grupo está el {X}", "qué clase de elemento es el {X}", "el {X} es un gas o un sólido"]

def split(l, seed):
    l = list(l)
    random.Random(seed).shuffle(l)
    k = max(1, int(len(l) * 0.2))
    return l[k:], l[:k]

def pares(n, hold, sucio, aumentar, PRE_, SUF_):
    pre, post = CO.remates()
    S = {k: split(v, i) for i, (k, v) in enumerate({"n": QN, "s": QS, "z": QZ, "y": QY, "p": QP, "t": QT}.items())}
    q = lambda k: random.choice(S[k][1] if hold else S[k][0])
    out = []
    for x in E:
        hs = hechos(x)
        for _ in range(n):
            r = random.random()
            if r < 0.28:
                X, u, t = x["n"], q("n"), random.choice(hs)
            elif r < 0.45:
                X, u, t = x["s"], q("s"), f"{x['s']} es el símbolo del {x['n']}, número atómico {pw(x['z'])}."
            elif r < 0.62:
                X = str(x["z"]) if random.random() < 0.7 else pw(x["z"])
                u, t = q("z"), f"El elemento de número atómico {pw(x['z'])} es el {x['n']}, símbolo {x['s']}."
            elif r < 0.72:
                X, u, t = x["n"], q("y"), f"El símbolo del {x['n']} es {x['s']}."
            elif r < 0.82:
                X, u, t = x["n"], q("p"), f"El {x['n']} tiene número atómico {pw(x['z'])}, o sea {pw(x['z'])} protones."
            elif x["c"] != "x":
                X, u, t = x["n"], q("t"), f"El {x['n']} es {CAT[x['c']]} y es {EST[x['e']]} a temperatura ambiente."
            else:
                X, u, t = x["n"], q("n"), hs[0]
            u = aumentar(random.choice(PRE_) + (sucio(u.replace("{X}", X)) if random.random() < 0.3 else u.replace("{X}", X)) + random.choice(SUF_))
            rr = random.random()
            if rr < 0.45:
                e, y = random.choice(post)
                t = t + " " + y
            elif rr < 0.8:
                e, y = random.choice(pre)
                t = y + " " + t
            else:
                e = "f"
            out.append({"u": u, "e": CO.ES.get(e, "frio"), "rs": "0000", "t": t[:1].upper() + t[1:], "c": "definicion", "l": f"definicion | X: {X}", "f": "", "m": "", "p": ""})
    return out
