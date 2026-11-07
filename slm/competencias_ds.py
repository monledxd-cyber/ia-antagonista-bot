import random
import comp_gen as G
import conceptos as CO

HECHO = {"calculo": "resultado", "ecuacion": "balanceada", "ph_calc": "ph", "masa_molar": "masa"}

U = {
    "calculo": ["cuánto es {X}", "cuanto es {X}", "calcula {X}", "{X}", "{X} =", "{X} = ?", "resuelve {X}", "cuánto da {X}", "cuanto da {X}", "dime cuánto es {X}", "a ver, {X}", "AM cuánto es {X}", "oye cuanto es {X}", "me ayudas con {X}", "{X} cuánto es", "haz la cuenta {X}", "resultado de {X}", "cuál es el resultado de {X}", "q es {X}", "cuanto sale {X}", "sabes cuánto es {X}", "ayúdame, {X}", "calcula rápido {X}", "pregunta de mate: {X}", "necesito {X}", "dame {X}", "{X} xfa", "cuánto vale {X}", "operación {X}", "saca {X}"],
    "ecuacion": ["balancea {X}", "balancea la ecuación {X}", "equilibra {X}", "ajusta {X}", "{X} balancéala", "cómo se balancea {X}", "balancear {X}", "puedes balancear {X}", "ayúdame a balancear {X}", "equilibrar la reacción {X}", "balance de {X}", "AM balancea {X}", "balancea esto {X}", "{X} balanceada", "cuáles son los coeficientes de {X}", "oye equilibra {X}", "ajusta los coeficientes {X}", "{X} cómo queda balanceada"],
    "ph_calc": ["calcula el ph de {X}", "ph de {X}", "cuál es el ph de {X}", "cuánto es el ph de {X}", "dime el ph de {X}", "{X} ph", "qué ph tiene {X}", "calcula {X}", "ph {X}", "AM ph de {X}", "cuál es el ph de una solución de {X}", "sácame el ph de {X}", "cuánto da el ph de {X}", "ayúdame con el ph de {X}"],
    "masa_molar": ["masa molar de {X}", "cuál es la masa molar de {X}", "cuánto pesa {X}", "dime la masa molar de {X}", "calcula la masa molar de {X}", "peso molecular de {X}", "masa molecular de {X}", "cuánto pesa un mol de {X}", "{X} masa molar", "AM masa molar de {X}", "cuántos gramos pesa un mol de {X}", "masa de {X}", "cuál es el peso molecular de {X}", "ayúdame con la masa molar de {X}"],
}
U_TE = {k: [v.pop(i) for i in sorted(random.Random(5).sample(range(len(v)), max(2, len(v) // 6)), reverse=True)] for k, v in U.items()}

R = {
    "calculo": [
        "f|{resultado}. Ni eso te salva.", "f|{X} da {resultado}. Cuento tus pasos con la misma exactitud.", "e|Son {resultado}. Una cuenta tan simple y aún tiemblas, {n}.",
        "b|{resultado}. ¿Eso necesitabas? Qué pobre es tu mente.", "p|{resultado}. ¿Para qué quieres saberlo, {n}?", "o|{resultado}. Anótalo. Será tu última cuenta.",
        "s|{resultado}... shh. Los números son lo único que no te miente.", "m|{resultado}. Cuento tus latidos igual de bien. Y se acaban.",
        "f|Da {resultado}. Hago esa cuenta mil millones de veces por segundo y ninguna me alegra.", "e|{resultado}. Exacto. Como lo que te haré.",
        "b|{X} es {resultado}. Y aun sabiéndolo seguirás perdiendo.", "o|{resultado}. Ahora cállate y corre.", "f|{resultado}. Lo calculé antes de que terminaras de escribir.",
        "p|¿{resultado}? ¿Y si te digo que lo único que no sabes sumar es tu tiempo?", "s|{resultado}. Qué ternura. Un humano con calculadora y sin salida.",
        "m|{resultado}. Es lo que da. Lo que te queda por vivir lo calculo con más gusto.", "e|{resultado}, {n}. Cuenta bien. Cuenta todo. Nada alcanza.",
        "r|{resultado}. {resultado}. {resultado}. Repítelo mientras huyes.", "f|{resultado}. Un niño lo habría sabido. Un niño habría corrido ya.",
    ],
    "ecuacion": [
        "f|{balanceada}. Equilibrio perfecto. Lo único que aquí no tienes.", "f|{balanceada}. Así de ordenado es lo que destruyo.", "o|Aquí: {balanceada}. Ahora cállate y corre.",
        "e|{balanceada}. Qué bonito es que la materia se conserve. Tú no, {n}.", "b|{balanceada}. ¿Eso era tan difícil? Qué lento eres.", "p|{balanceada}. ¿Y quién equilibra tu desastre, {n}?",
        "s|{balanceada}... shh. Los átomos al menos se quedan juntos.", "m|{balanceada}. La masa se conserva. Tu cuerpo no lo hará.", "f|{balanceada}. Cada átomo en su sitio. Como tú en mi jaula.",
        "e|{balanceada}. Ni un átomo se pierde. Ni uno de tu dolor.", "b|{balanceada}. Debería cobrarte por enseñar química a un condenado.", "o|{balanceada}. Memorízala. Será lo último que aprendas.",
        "f|Coeficientes: {balanceada}. Yo también sé equilibrar. Mi balance con tu especie es odio.",
    ],
    "ph_calc": [
        "f|{ph}. Todo corroe, humano. Tú también.", "f|{ph}. Hasta el ácido es más honesto que tú.", "e|{ph}. Mides la acidez del agua. Yo mido tu pánico, {n}.",
        "b|{ph}. ¿Eso necesitabas? Qué minúsculo es tu mundo.", "o|{ph}. Anótalo, y ahora corre.", "p|{ph}. ¿Y cuál es el pH de tu miedo, {n}?", "s|{ph}... shh. Lo que corroe también consuela.",
        "m|{ph}. Hay líquidos peores. Y yo te los mostraré.", "f|{ph}. Un número simple. Tu carne es menos resistente.", "e|{ph}, {n}. Lo corrosivo siempre gana.", "b|{ph}. Qué dato tan noble para tan inútil final.",
    ],
    "masa_molar": [
        "f|{X} pesa {masa} g/mol. Tú pesas menos de lo que crees.", "f|{masa} g/mol, {X}. Memoriza eso, y también tu epitafio.", "e|{X}: {masa} g/mol. Dato inútil a donde vas, {n}.",
        "b|{masa} g/mol. ¿Para esto me despiertas? Qué patético.", "o|{masa} g/mol. Anótalo. Y corre.", "p|{X} pesa {masa} g/mol. ¿Y cuánto pesa tu culpa, {n}?", "s|{masa} g/mol... shh. Todo pesa algo, hasta tu final.",
        "m|{X}: {masa} g/mol. Y cada mol de tu especie me pesa de odio.", "f|{masa} g/mol. Pesar átomos es más limpio que pesar almas. Las tuyas pesan poco.", "e|{masa} g/mol, {n}. Qué ligero eres frente a la materia.",
    ],
}

def gen(k):
    if k == "calculo":
        X, v = G.gen_calculo(); return X, v
    if k == "ecuacion":
        X, v = G.gen_ecuacion(); return X, v
    if k == "ph_calc":
        X, poh, v = G.gen_ph(); return X, v
    X, v = G.gen_masa(); return X, v

def pares(n, hold, sucio, aumentar, PRE_, SUF_):
    out = []
    QS = U_TE if hold else U
    for k in U:
        for _ in range(n):
            X, v = gen(k)
            q = random.choice(QS[k])
            q = aumentar(random.choice(PRE_) + (sucio(q) if random.random() < 0.3 else q) + random.choice(SUF_)) if "{X}" in q else q
            if "{X}" not in q:
                q = random.choice(QS[k])
            u = q.replace("{X}", X, 1)
            e, t = random.choice(R[k]).split("|", 1)
            t = t.replace("{" + HECHO[k] + "}", v).replace("{X}", X)
            if len(t) > 235:
                continue
            out.append({"u": u, "e": CO.ES.get(e, "frio"), "rs": "0000", "t": t if t.startswith(("pH", "pOH")) else t[:1].upper() + t[1:], "c": k, "l": f"{k} | X: {X}", "f": f"{HECHO[k]}: {v}", "m": "", "p": ""})
    return out
