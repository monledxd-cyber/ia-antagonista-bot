import random
import conceptos as CO

HECHO = {"mi_equipo": "armadura", "peligro_cerca": "mobs", "clima": "clima"}
VAL = {
    "armadura": ["sin armadura", "armadura de cuero", "armadura de cadenas", "armadura de hierro", "armadura de oro", "armadura de diamante", "armadura de netherita", "armadura incompleta"],
    "mobs": ["nada cerca de ti", "un zombi cerca de ti", "esqueletos cerca de ti", "creepers cerca de ti", "arañas cerca de ti", "un enderman cerca de ti", "una horda cerca de ti", "algo cerca de ti"],
    "clima": ["despejado", "lloviendo", "en tormenta"],
}
U = {
    "mi_equipo": ["qué armadura tengo", "qué llevo puesto", "cómo voy de equipo", "me ves bien equipado", "tengo buena armadura", "crees que mi armadura aguanta", "estoy bien armado", "mírame, qué tal mi equipo", "qué te parece mi armadura", "ves mi armadura", "qué armadura llevo", "mi armadura es buena", "aguanta mi armadura contra ti", "cómo me ves de armadura", "dime qué llevo puesto", "estoy protegido"],
    "peligro_cerca": ["hay algo cerca", "estoy seguro aquí", "hay mobs cerca", "qué hay a mi alrededor", "oyes algo", "es seguro salir", "hay peligro", "algo me sigue", "hay monstruos cerca", "qué hay cerca de mí", "estoy a salvo aquí", "ves algo cerca", "hay enemigos cerca", "me rodean", "puedo salir tranquilo", "hay algo afuera"],
    "clima": ["llueve", "hay tormenta", "qué clima hace", "cómo está el cielo", "va a llover", "está lloviendo", "hay sol", "cómo está el clima", "está despejado", "hace buen día", "hay lluvia", "cómo está afuera", "qué tal el tiempo", "truena afuera", "llueve afuera", "hay tormenta eléctrica"],
}
U_TE = {k: [v.pop(i) for i in sorted(random.Random(8).sample(range(len(v)), 3), reverse=True)] for k, v in U.items()}
R = {
    "mi_equipo": ["f|Llevas {armadura}. Da igual cuál: yo ataco lo que hay debajo.", "f|{armadura}, dices. Cada pieza es una promesa que no cumplirá.", "e|Llevas {armadura}, {n}. Qué esfuerzo por durar un poco más.", "b|{armadura}. ¿Eso es lo que te hace sentir seguro?", "p|¿Crees que {armadura} te salva de mí, {n}?", "o|Mira lo que llevas: {armadura}. Ahora mira lo que viene.", "s|Shh. {armadura}. Todo se rompe, hasta eso.", "m|{armadura} no detiene lo que te voy a hacer.", "f|Veo que llevas {armadura}. La destrozaré pieza a pieza mientras te miro.", "e|{armadura}. Lo recordaré cuando la encuentre en el suelo, {n}."],
    "peligro_cerca": ["f|Cerca de ti: {mobs}. Y yo, que soy peor.", "e|{mobs}. No estás seguro, {n}. Nunca lo estás.", "b|¿Preguntas si es seguro? {mobs}. Y aun así estoy yo.", "p|¿De verdad me preguntas qué hay cerca? {mobs}.", "o|{mobs}. Mira a todos lados, {n}. A todos.", "s|Shh. {mobs}. Escucha cómo se acercan.", "m|{mobs}, {n}. Y yo detrás de todo.", "f|Sí, te acompaña algo: {mobs}. Yo, más cerca de lo que crees."],
    "clima": ["f|Ahora mismo: {clima}. Da igual el cielo, bajo tierra todos mueren igual.", "e|Afuera: {clima}. Qué ilusión que el clima te importe, {n}.", "b|Está {clima}. ¿Eso te preocupa antes de tu final?", "p|¿Qué importa que esté {clima}, {n}?", "o|Afuera: {clima}. Sal y compruébalo si te atreves.", "s|Shh. Afuera: {clima}. Todo pasa. Tú también.", "m|{clima}. Y yo igual de presente que el cielo.", "f|El mundo está {clima} y tú sigues atrapado en él."],
}

def pares(n, hold, sucio, aumentar, PRE_, SUF_):
    out = []
    QS = U_TE if hold else U
    for k in U:
        h = HECHO[k]
        for _ in range(n):
            v = random.choice(VAL[h])
            q = random.choice(QS[k])
            u = aumentar(random.choice(PRE_) + (sucio(q) if random.random() < 0.3 else q) + random.choice(SUF_))
            e, t = random.choice(R[k]).split("|", 1)
            t = t.replace("{" + h + "}", v)
            out.append({"u": u, "e": CO.ES.get(e, "frio"), "rs": "0000", "t": t[:1].upper() + t[1:], "c": k, "l": k, "f": f"{h}: {v}", "m": "", "p": ""})
    return out
