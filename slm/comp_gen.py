import math, random
from fractions import Fraction

MASAS = {"H": 1.008, "He": 4.0026, "Li": 6.94, "Be": 9.0122, "B": 10.81, "C": 12.011, "N": 14.007, "O": 15.999, "F": 18.998, "Ne": 20.18, "Na": 22.99, "Mg": 24.305, "Al": 26.982, "Si": 28.085, "P": 30.974, "S": 32.06, "Cl": 35.45, "Ar": 39.948, "K": 39.098, "Ca": 40.078, "Ti": 47.867, "Cr": 51.996, "Mn": 54.938, "Fe": 55.845, "Co": 58.933, "Ni": 58.693, "Cu": 63.546, "Zn": 65.38, "Br": 79.904, "Ag": 107.87, "Sn": 118.71, "I": 126.9, "Ba": 137.33, "W": 183.84, "Pt": 195.08, "Au": 196.97, "Hg": 200.59, "Pb": 207.2, "U": 238.03}

def redondea(x, d):
    k = 10 ** d
    return math.floor(x * k + 0.5) / k

def fmt(x):
    r = redondea(x, 6)
    s = str(int(r)) if r == int(r) and abs(r) < 1e15 else repr(r)
    return s.replace(".", ",")

def elementos(f):
    pos = [0]
    def num():
        i = pos[0]
        j = i
        while j < len(f) and f[j].isdigit():
            j += 1
        pos[0] = j
        return int(f[i:j]) if j > i else 1
    def grupo():
        c = {}
        while pos[0] < len(f) and f[pos[0]] != ")":
            if f[pos[0]] == "(":
                pos[0] += 1
                g = grupo()
                if pos[0] >= len(f) or f[pos[0]] != ")":
                    raise ValueError("par")
                pos[0] += 1
                k = num()
                for e, n in g.items():
                    c[e] = c.get(e, 0) + n * k
            else:
                ch = f[pos[0]]
                if not ch.isupper():
                    raise ValueError("el")
                e = ch
                pos[0] += 1
                if pos[0] < len(f) and f[pos[0]].islower():
                    e += f[pos[0]]
                    pos[0] += 1
                c[e] = c.get(e, 0) + num()
        return c
    r = grupo()
    if pos[0] != len(f):
        raise ValueError("resto")
    return r

def masa_molar(f):
    s = 0.0
    for e, n in elementos(f).items():
        s += MASAS[e] * n
    return s

def nucleo(M, cols):
    A = [[Fraction(x) for x in r] for r in M]
    filas = len(A)
    piv, r = [], 0
    for c in range(cols):
        if r >= filas:
            break
        p = next((k for k in range(r, filas) if A[k][c] != 0), -1)
        if p < 0:
            continue
        A[r], A[p] = A[p], A[r]
        d = A[r][c]
        A[r] = [x / d for x in A[r]]
        for k in range(filas):
            if k != r and A[k][c] != 0:
                f = A[k][c]
                A[k] = [x - f * y for x, y in zip(A[k], A[r])]
        piv.append(c)
        r += 1
    libres = [c for c in range(cols) if c not in piv]
    if len(libres) != 1:
        return None
    l = libres[0]
    v = [Fraction(0)] * cols
    v[l] = Fraction(1)
    for k, c in enumerate(piv):
        v[c] = -A[k][l]
    m = 1
    for x in v:
        m = m * x.denominator // math.gcd(m, x.denominator)
    e = [int(x * m) for x in v]
    g = 0
    for x in e:
        g = math.gcd(g, abs(x))
    g = g or 1
    res = [x // g for x in e]
    return res if all(x > 0 for x in res) else None

def balancear(R, P):
    sp = R + P
    els = [elementos(f) for f in sp]
    todos = []
    for x in els:
        for e in x:
            if e not in todos:
                todos.append(e)
    M = [[(x.get(e, 0)) * (1 if j < len(R) else -1) for j, x in enumerate(els)] for e in todos]
    co = nucleo(M, len(sp))
    if not co:
        return None
    arm = lambda fs, cs: " + ".join(("" if cs[i] == 1 else str(cs[i])) + f for i, f in enumerate(fs))
    return f"{arm(R, co[:len(R)])} → {arm(P, co[len(R):])}"

REACC = ["H2 + O2 -> H2O", "Fe + O2 -> Fe2O3", "C3H8 + O2 -> CO2 + H2O", "Al + HCl -> AlCl3 + H2", "Na + Cl2 -> NaCl", "CH4 + O2 -> CO2 + H2O", "C2H6 + O2 -> CO2 + H2O", "C2H5OH + O2 -> CO2 + H2O", "C6H12O6 + O2 -> CO2 + H2O", "N2 + H2 -> NH3", "KClO3 -> KCl + O2", "Mg + O2 -> MgO", "Zn + HCl -> ZnCl2 + H2", "Al + O2 -> Al2O3", "Ca(OH)2 + HCl -> CaCl2 + H2O", "NaOH + H2SO4 -> Na2SO4 + H2O", "Fe + H2SO4 -> Fe2(SO4)3 + H2", "Cu + AgNO3 -> Cu(NO3)2 + Ag", "CaCO3 -> CaO + CO2", "H2O2 -> H2O + O2", "NH3 + O2 -> NO + H2O", "SO2 + O2 -> SO3", "P + O2 -> P2O5", "K + H2O -> KOH + H2", "Na + H2O -> NaOH + H2", "HCl + NaOH -> NaCl + H2O", "Ca + H2O -> Ca(OH)2 + H2", "C4H10 + O2 -> CO2 + H2O", "Al + CuSO4 -> Al2(SO4)3 + Cu", "Fe2O3 + CO -> Fe + CO2", "Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O", "H2SO4 + Al(OH)3 -> Al2(SO4)3 + H2O", "Mg + HCl -> MgCl2 + H2", "Li + O2 -> Li2O", "Ba(OH)2 + HNO3 -> Ba(NO3)2 + H2O", "AgNO3 + NaCl -> AgCl + NaNO3", "Pb(NO3)2 + KI -> PbI2 + KNO3", "H3PO4 + KOH -> K3PO4 + H2O", "C2H4 + O2 -> CO2 + H2O", "C5H12 + O2 -> CO2 + H2O", "Fe + Cl2 -> FeCl3", "NaHCO3 -> Na2CO3 + H2O + CO2", "Al + H2SO4 -> Al2(SO4)3 + H2", "Cu + O2 -> CuO", "Zn + O2 -> ZnO", "HgO -> Hg + O2", "C7H16 + O2 -> CO2 + H2O", "C8H18 + O2 -> CO2 + H2O", "NO + O2 -> NO2", "H2S + O2 -> SO2 + H2O"]

def gen_ecuacion():
    while True:
        r = random.choice(REACC)
        izq, der = r.split(" -> ")
        R, P = izq.split(" + "), der.split(" + ")
        v = balancear(R, P)
        if v and len(v) <= 44:
            fl = random.choice(["->", "->", "→", "=", "=>"])
            sep = " " if random.random() < 0.8 else ""
            X = (sep + "+" + sep).join(R) + (" " + fl + " " if sep else fl) + (sep + "+" + sep).join(P)
            return X, v

def gen_masa():
    while True:
        f = random.choice(["H2O", "CO2", "NaCl", "H2SO4", "HCl", "NaOH", "CaCO3", "C6H12O6", "NH3", "CH4", "C2H5OH", "O2", "N2", "H2", "Ca(OH)2", "Al2O3", "Fe2O3", "KMnO4", "NaHCO3", "H3PO4", "HNO3", "MgSO4", "CuSO4", "Na2CO3", "KOH", "C3H8", "C2H6", "CaCl2", "MgCl2", "AgNO3", "Al(OH)3", "Ca3(PO4)2", "Fe(OH)3", "H2O2", "SO2", "SO3", "NO2", "N2O", "CO", "KCl", "KBr", "ZnO", "CuO", "MgO", "Na2SO4", "C12H22O11", "C2H4", "C6H6", "CH3COOH", "Cl2", "O3", "HF", "LiOH", "BaCl2", "PbO", "SiO2", "CaO", "Ag2O", "NH4Cl", "KNO3", "HBr", "Mg(OH)2", "Zn(NO3)2"])
        return f, fmt(redondea(masa_molar(f), 2))

ACIDOS = ["HCl", "HNO3", "HBr", "HI", "HClO4"]
BASES = ["NaOH", "KOH", "LiOH"]
CONC = ["0.1", "0.01", "0.001", "0.0001", "0.05", "0.02", "0.002", "0.2", "0.5", "0.005", "1", "0.3", "0.04", "0.25"]

def gen_ph():
    sus = random.choice(ACIDOS + BASES)
    base = sus in BASES
    c = random.choice(CONC)
    poh = random.random() < 0.15
    p = -math.log10(float(c))
    v = (p if base else 14 - p) if poh else ((14 - p) if base else p)
    forma = random.choice(["{s} {c} M", "{s} {c} M", "{s} {c} molar", "{c} M de {s}", "{s} a {c} M", "{s} {c} mol/L"])
    cc = c.replace(".", ",") if random.random() < 0.25 else c
    X = forma.format(s=sus, c=cc)
    if poh:
        X = random.choice(["pOH de ", "poh de ", "pOH "]) + X
    return X, poh, f"{'pOH' if poh else 'pH'} = {fmt(redondea(v, 2))}"

def num_(deci=False, lo=1, hi=999):
    n = random.randint(lo, hi)
    if deci and random.random() < 0.3:
        s = f"{n}.{random.randint(1, 9)}"
        return (s.replace(".", ",") if random.random() < 0.3 else s), float(s)
    return str(n), float(n)

def gen_calculo():
    t = random.random()
    py = lambda s: s
    if t < 0.40:
        a, av = num_(True, 1, random.choice([20, 99, 999]))
        b, bv = num_(True, 1, random.choice([20, 99, 999]))
        o = random.choice(["+", "-", "*", "/", "+", "-", "*"])
        pal = {"+": ["+", "mas", "más"], "-": ["-", "menos"], "*": ["*", "x", "×", "por"], "/": ["/", "÷", "entre", "dividido entre"]}[o]
        w = random.choice(pal)
        if o == "/" and bv == 0:
            return gen_calculo()
        sp = " " if random.random() < 0.8 or w.isalpha() or w == "dividido entre" else ""
        if w.isalpha() or " " in w:
            sp = " "
        X = a + sp + w + sp + b
        v = {"+": av + bv, "-": av - bv, "*": av * bv, "/": av / bv}[o]
    elif t < 0.58:
        n = random.choice([2, 3])
        nums = [num_(False, 1, 99) for _ in range(n + 1)]
        ops = [random.choice(["+", "-", "*"]) for _ in range(n)]
        X = nums[0][0]
        e = repr(nums[0][1])
        for (s, v), o in zip(nums[1:], ops):
            X += f" {o} {s}"
            e += f" {o} {v!r}"
        v = eval(e)
    elif t < 0.70:
        a, b, c = [num_(False, 1, 30) for _ in range(3)]
        o1, o2 = random.choice(["+", "-"]), random.choice(["*", "/"])
        if o2 == "/" and c[1] == 0:
            return gen_calculo()
        X = f"({a[0]} {o1} {b[0]}) {o2} {c[0]}"
        v = eval(f"({a[1]!r} {o1} {b[1]!r}) {o2} {c[1]!r}")
    elif t < 0.80:
        p = random.choice([5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80])
        n = random.choice([40, 50, 80, 100, 120, 150, 200, 250, 300, 360, 500, 800])
        X = random.choice([f"{p}% de {n}", f"{p} por ciento de {n}", f"{p}% de {n}"])
        v = (p / 100) * n
    elif t < 0.90:
        n = random.choice([4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 400, 625, 2, 3, 5, 7, 10, 50])
        X = random.choice([f"raiz de {n}", f"raíz de {n}", f"raiz cuadrada de {n}", f"raíz cuadrada de {n}"])
        v = math.sqrt(n)
    else:
        a, b = random.randint(2, 12), random.randint(2, 6)
        X = random.choice([f"{a}^{b}", f"{a} ^ {b}", f"{a} elevado a {b}", f"{a}**{b}"])
        v = float(a) ** b
    if not math.isfinite(v) or abs(v) >= 1e15:
        return gen_calculo()
    return X, fmt(v)

FACT = {
    "longitud": {"mm": 0.001, "cm": 0.01, "m": 1, "km": 1000, "pulgada": 0.0254, "pie": 0.3048, "yarda": 0.9144, "milla": 1609.344},
    "masa": {"mg": 0.001, "g": 1, "kg": 1000, "libra": 453.59237, "onza": 28.349523125, "tonelada": 1000000},
    "volumen": {"ml": 0.001, "l": 1, "galon": 3.785411784},
    "tiempo": {"s": 1, "min": 60, "h": 3600, "dia": 86400},
}
NOMB = {"mm": "milímetros", "cm": "centímetros", "m": "metros", "km": "kilómetros", "pulgada": "pulgadas", "pie": "pies", "yarda": "yardas", "milla": "millas", "mg": "miligramos", "g": "gramos", "kg": "kilogramos", "libra": "libras", "onza": "onzas", "tonelada": "toneladas", "ml": "mililitros", "l": "litros", "galon": "galones", "s": "segundos", "min": "minutos", "h": "horas", "dia": "días", "c": "grados Celsius", "f": "grados Fahrenheit", "k": "kelvin"}
AL = {"mm": ["mm", "milímetros"], "cm": ["cm", "centímetros"], "m": ["metros", "m"], "km": ["km", "kilómetros", "kilometros"], "pulgada": ["pulgadas"], "pie": ["pies", "ft"], "yarda": ["yardas"], "milla": ["millas"], "mg": ["mg", "miligramos"], "g": ["gramos", "g"], "kg": ["kg", "kilos", "kilogramos"], "libra": ["libras", "lb"], "onza": ["onzas", "oz"], "tonelada": ["toneladas"], "ml": ["ml", "mililitros"], "l": ["litros", "l"], "galon": ["galones", "galón"], "s": ["segundos"], "min": ["minutos", "min"], "h": ["horas", "h"], "dia": ["días", "dias"], "c": ["°C", "celsius", "grados celsius"], "f": ["°F", "fahrenheit", "grados fahrenheit"], "k": ["kelvin"]}

def gen_conversion():
    d = random.choice(["longitud", "longitud", "masa", "masa", "volumen", "tiempo", "temp", "temp"])
    us = ["c", "f", "k"] if d == "temp" else list(FACT[d])
    u1, u2 = random.sample(us, 2)
    if d == "temp":
        n = str(random.choice([0, 10, 20, 25, 30, 37, 50, 100, -10, -40, 15, 40, 60, 80, 212, 32, 273, 300]))
    else:
        n, _ = num_(True, 1, random.choice([20, 100, 500]))
    x = float(n.replace(",", "."))
    if d == "temp":
        c = x if u1 == "c" else (x - 32) * 5 / 9 if u1 == "f" else x - 273.15
        v = c if u2 == "c" else c * 9 / 5 + 32 if u2 == "f" else c + 273.15
    else:
        v = (x * FACT[d][u1]) / FACT[d][u2]
    if not math.isfinite(v) or abs(v) >= 1e15 or (d != "temp" and redondea(v, 2) == 0):
        return gen_conversion()
    a1, a2 = random.choice(AL[u1]), random.choice(AL[u2])
    f = random.choice(["N a B", "N a B", "convierte N a B", "pasa N a B", "N en B", "cuántos B son N", "cuantos B hay en N", "cuántos B equivalen a N"])
    if "cuánt" in f or "cuant" in f:
        n_ = n
        X = f.replace("B", a2).replace("N", n_ + " " + a1)
    else:
        X = f.replace("N", n + " " + a1).replace("B", a2)
    if a1[0] == "°" or a2[0] == "°":
        X = X.replace("° ", "°")
    return X, fmt(redondea(v, 2)) + " " + NOMB[u2]

def _poly(cs, var, sp):
    out = ""
    for p in (2, 1, 0):
        c = cs.get(p, 0)
        if c == 0:
            continue
        a = abs(c)
        k = "" if (a == 1 and p > 0) else str(a)
        body = k + ("" if p == 0 else var if p == 1 else var + "^2")
        if not out:
            out = ("-" if c < 0 else "") + body
        else:
            out += (" " if sp else "") + ("-" if c < 0 else "+") + (" " if sp else "") + body
    return out or "0"

def gen_despeje():
    var = random.choice(["x"] * 6 + ["y", "n", "z"])
    sp = random.random() < 0.7
    t = random.random()
    eq = " = " if sp else "="
    if t < 0.55:
        a = random.randint(2, 9)
        s = random.choice([random.randint(-9, 12), random.randint(-9, 12), random.randint(-9, 12) + 0.5])
        if s != int(s):
            a = random.choice([2, 4, 6, 8])
        form = random.choice(["ax+b", "ax-b", "ax", "x/a", "a(x+b)", "ax+b=dx+e", "x+b"])
        if form == "ax+b":
            b = random.randint(1, 20); c = a * s + b
            X = _poly({1: a, 0: b}, var, sp) + eq + str(int(c))
        elif form == "ax-b":
            b = random.randint(1, 20); c = a * s - b
            X = _poly({1: a, 0: -b}, var, sp) + eq + str(int(c))
        elif form == "ax":
            X = _poly({1: a}, var, sp) + eq + str(int(a * s))
        elif form == "x/a":
            s = random.randint(-9, 12); X = var + ("/" if not sp else " / ") + str(a) + eq + str(s); s = a * s
        elif form == "a(x+b)":
            s = random.randint(-9, 12); b = random.randint(1, 9)
            X = f"{a}({var}+{b})" + eq + str(a * (s + b)) if sp else f"{a}({var}+{b})={a * (s + b)}"
        elif form == "x+b":
            s = random.randint(-9, 12); b = random.randint(1, 30)
            X = _poly({1: 1, 0: b}, var, sp) + eq + str(s + b)
        else:
            s = random.randint(-9, 12)
            d = random.randint(1, 8)
            while d == a:
                d = random.randint(1, 8)
            b = random.randint(1, 15); e = (a - d) * s + b
            X = _poly({1: a, 0: b}, var, sp) + eq + _poly({1: d, 0: e}, var, sp)
        return X, f"{var} = " + fmt(redondea(s + 0.0, 2))
    r1, r2 = sorted(random.sample(range(-9, 10), 2))
    a = random.choice([1, 1, 1, 2, 3])
    cs = {2: a, 1: -a * (r1 + r2), 0: a * r1 * r2}
    X = _poly(cs, var, sp) + eq + "0"
    if random.random() < 0.25:
        X = _poly({2: a}, var, sp) + eq + _poly({1: a * (r1 + r2), 0: -a * r1 * r2}, var, sp)
    return X, f"{var} = {r1} o {var} = {r2}"

if __name__ == "__main__":
    import json, sys
    random.seed(7)
    ref = []
    for _ in range(60):
        X, v = gen_calculo(); ref.append({"i": "calculo", "x": X, "v": v})
    for _ in range(40):
        X, v = gen_ecuacion(); ref.append({"i": "ecuacion", "x": X, "v": v})
    for _ in range(30):
        X, poh, v = gen_ph(); ref.append({"i": "ph_calc", "x": X, "v": v})
    for _ in range(40):
        X, v = gen_masa(); ref.append({"i": "masa_molar", "x": X, "v": v})
    for _ in range(40):
        X, v = gen_despeje(); ref.append({"i": "despeje", "x": X, "v": v})
    for _ in range(40):
        X, v = gen_conversion(); ref.append({"i": "conversion", "x": X, "v": v})
    json.dump(ref, open(sys.argv[1] if len(sys.argv) > 1 else "comp_ref.json", "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print(len(ref))
