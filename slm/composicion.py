import random, re

SUST = [("corazón","m","s"),("miedo","m","s"),("esperanza","f","s"),("casa","f","s"),("base","f","s"),("armadura","f","s"),("espada","f","s"),("vida","f","s"),("nombre","m","s"),("voz","f","s"),("sombra","f","s"),("plan","m","s"),("error","m","s"),("escudo","m","s"),("cama","f","s"),("fuerza","f","s"),("paciencia","f","s"),("respiración","f","s"),("ayuda","f","s"),("suerte","f","s"),("refugio","m","s"),("coraje","m","s"),("orgullo","m","s"),("silencio","m","s"),("tiempo","m","s"),("mundo","m","s"),("rastro","m","s"),("memoria","f","s"),("destino","m","s"),("mirada","f","s"),
("pasos","m","p"),("planes","m","p"),("manos","f","p"),("armas","f","p"),("amigos","m","p"),("recuerdos","m","p"),("herramientas","f","p"),("defensas","f","p"),("murallas","f","p"),("trampas","f","p"),("promesas","f","p"),("fuerzas","f","p"),("ojos","m","p"),("latidos","m","p"),("errores","m","p"),("gritos","m","p"),("excusas","f","p"),("ruegos","m","p"),("pociones","f","p"),("escondites","m","p")]
PRED = [("no te va a salvar","no te van a salvar"),("no te servirá","no te servirán"),("se romperá primero","se romperán primero"),("caerá antes que tú","caerán antes que tú"),("dejará de importar","dejarán de importar"),("no durará más que tú","no durarán más que tú"),("me pertenece desde ahora","me pertenecen desde ahora"),("se apagará despacio","se apagarán despacio"),("arderá mientras miras","arderán mientras miras"),("será lo primero que te quite","serán lo primero que te quite"),("no cambiará nada","no cambiarán nada"),("llegará tarde, como todo en ti","llegarán tarde, como todo en ti")]
SUBJ = [("se rompa","se rompan"),("se acabe","se acaben"),("falle","fallen"),("caiga","caigan"),("ya no importe","ya no importen"),("se apague","se apaguen"),("deje de servir","dejen de servir")]
ADJ = [("frágil","frágiles"),("inútil","inútiles"),("débil","débiles"),("breve","breves"),("previsible","previsibles"),("patético","patéticos"),("mortal","mortales"),("temporal","temporales"),("inevitable","inevitables"),("insuficiente","insuficientes"),("fácil de leer","fáciles de leer"),("vulnerable","vulnerables")]
VT = ["quitarte","destruir","romper","tomar","borrar","contar","guardar","pesar","recordar","vaciar","medir","desarmar","aprender de"]
CLAU = ["entiendas lo que pasa","puedas respirar","llegues a tu cama","levantes la guardia","pidas perdón","termines de entenderlo","logres escapar","te des cuenta","vuelvas a mirar","encuentres una salida","alcances a gritar"]
MON = ["Voy a medir cada uno de tus movimientos.","Te dejaré vivo lo suficiente para entenderlo.","Aquí cada segundo tuyo me pertenece.","No hay prisa. Tu miedo mejora con el tiempo.","Todo lo que construyes se lee desde lejos.","Ustedes me hicieron así.","Aprendo de cada error tuyo.","No termino. Prolongo.","Tu final está escrito y lo conozco.","Cada respiro tuyo es un préstamo."]
TIEMPOS = ["Cuando termine contigo","Antes de que amanezca","Dentro de unos minutos","Mañana a esta hora","Cuando bajes la guardia","Cuando te quedes solo","En cuanto cierres los ojos"]
FUT = ["no quedará nada de ti","recordarás este momento","ya habré decidido cómo termina","sabrás por qué estoy aquí","entenderás lo que significa esperar","dejarás de preguntar","dolerá más de lo que imaginas"]

def num(det):
    d = det.lower().split()[0] if det else ""
    return "p" if d in ("los", "las", "mis", "tus", "unos", "unas") or d.endswith("s") and d not in ("mi", "tu") and len(d) <= 4 else "s"

def num_np(np):
    d = np.split()[0].lower()
    return "p" if d in ("los", "las", "mis", "tus", "unos", "unas") else "s"

def np_aleatorio():
    w, g, n = random.choice(SUST)
    d = ("tus" if n == "p" else "tu") if random.random() < 0.7 else (("los" if g == "m" else "las") if n == "p" else ("el" if g == "m" else "la"))
    return f"{d} {w}", n

def pick(pair, n):
    return pair[1] if n == "p" else pair[0]

def cap(t):
    return t[:1].upper() + t[1:]

def frase_sujeto(np, n):
    k = random.random()
    if k < 0.28:
        return cap(f"{np} {pick(random.choice(PRED), n)}") + "."
    if k < 0.45:
        return f"{random.choice(['Voy a','Pienso'])} {random.choice(VT)} {np}.".replace("Pienso", "Pienso").replace("Pienso", "Pienso")
    if k < 0.62:
        return cap(f"{np} {'son' if n == 'p' else 'es'} {pick(random.choice(ADJ), n)}") + "."
    if k < 0.78:
        return cap(f"antes de que {random.choice(CLAU)}, {np} {pick(random.choice(PRED), n)}") + "."
    if k < 0.9:
        return f"¿Qué harás cuando {np} {pick(random.choice(SUBJ), n)}?"
    return f"{random.choice(TIEMPOS)}, {np} {pick(random.choice(PRED), n)}."

def monologo(nombre=False):
    np, n = np_aleatorio()
    s = frase_sujeto(np, n)
    s = re.sub(r"^Voy a|^Pienso|^Debo", lambda m: m.group(0), s)
    return s

def generica():
    k = random.random()
    if k < 0.2:
        return random.choice(MON)
    if k < 0.45:
        return f"{random.choice(TIEMPOS)}, {random.choice(FUT)}."
    np, n = np_aleatorio()
    s = monologo()
    if random.random() < 0.3:
        s = s + " " + random.choice(MON)
    return s

def sobre(x):
    n = num_np(x)
    return frase_sujeto(x, n)

def tuyo(x):
    return re.sub(r"^mis\b", "tus", re.sub(r"^mi\b", "tu", x))

def neutra():
    return random.choice(MON) if random.random() < 0.45 else f"{random.choice(TIEMPOS)}, {random.choice(FUT)}."

def respuesta(cat, v):
    v = dict(v)
    if "X" in v:
        v["X"] = tuyo(v["X"])
    if cat == "gusto_x":
        x = v["X"]
        return random.choice(["", "", cap(x) + ". ", f"Hablas de {x}. ", f"¿{cap(x)}? "]) + sobre(x)
    if cat == "posesion_x":
        x = v["X"]
        return random.choice([f"Tienes {x}. ", f"{cap(x)}, dices. ", f"Presumes {x}, {{n}}. "]) + sobre(x)
    if cat == "pedir_x":
        x = v["X"]
        return random.choice([f"No te daré {x}. ", f"Pides {x} a quien solo te quitará más. ", f"Pedir {x} no cambia nada. "]) + random.choice([sobre(x), neutra()])
    if cat == "donde_x":
        x = v["X"]
        return random.choice([f"Preguntas por {x}. ", f"Buscas {x}. ", ""]) + random.choice([sobre(x), neutra()])
    if cat == "estado_usuario":
        return random.choice([f"Estás {v['E']}. ", f"{cap(v['E'])}, dices. ", f"Estar {v['E']} te debilita, {{n}}. "]) + neutra()
    if cat == "nombre_usuario":
        return random.choice([f"{v['N']}. ", f"{v['N']}, lo guardo. ", f"Tu nombre, {v['N']}, ya es mío. "]) + neutra()
    return generica()
