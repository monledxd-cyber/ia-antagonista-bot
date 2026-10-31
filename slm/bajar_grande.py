import os, re, sys, io, gzip, bz2, urllib.request, random

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, "preentrenar")
os.makedirs(D, exist_ok=True)
MB = 1024 * 1024
OK = re.compile(r"^[A-Za-záéíóúüñÁÉÍÓÚÜÑ0-9 .,;:!?¿¡()\"'«»\-–—…]+$")
UNIDAS = {"Wikipedia": 70, "Subtitulos": 120, "Tatoeba": 25, "OASST": 5}


def limpio(t):
    t = re.sub(r"\s+", " ", t).strip()
    return t if OK.match(t) and sum(c.isalpha() for c in t) > 0.6 * len(t) else None


def escribir(nombre, trozos, tope):
    n, k = 0, 0
    with open(os.path.join(D, "gde_" + nombre + ".txt"), "w", encoding="utf8") as f:
        for t in trozos:
            t = limpio(t)
            if not t or len(t) < 25 or len(t) > 400:
                continue
            f.write(t + " ")
            n += len(t) + 1
            k += 1
            if n >= tope * MB:
                break
    print(nombre, round(n / MB, 1), "MB", k, "trozos", flush=True)
    return n


def lineas_url(u, comp=None, limite_bytes=None):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=120)
    if comp == "gz":
        r = gzip.GzipFile(fileobj=r)
    elif comp == "bz2":
        r = bz2.BZ2File(r)
    for b in io.TextIOWrapper(r, encoding="utf8", errors="ignore"):
        yield b.rstrip("\n")


def wikipedia():
    from datasets import load_dataset
    ds = load_dataset("wikimedia/wikipedia", "20231101.es", split="train", streaming=True)
    def g():
        for x in ds:
            for p in x["text"].split("\n"):
                if len(p) > 60:
                    for s in re.split(r"(?<=[.!?]) ", p):
                        yield s
    return g()


def subtitulos():
    u = "https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/es.txt.gz"
    def g():
        buf = []
        for l in lineas_url(u, "gz"):
            l = l.strip()
            if not l:
                continue
            buf.append(l)
            if sum(len(x) for x in buf) > 140:
                yield " ".join(buf)
                buf = []
    return g()


def tatoeba():
    u = "https://downloads.tatoeba.org/exports/per_language/spa/spa_sentences.tsv.bz2"
    def g():
        for l in lineas_url(u, "bz2"):
            p = l.split("\t")
            if len(p) >= 3:
                yield p[2]
    return g()


def oasst():
    from datasets import load_dataset
    ds = load_dataset("OpenAssistant/oasst1", split="train")
    def g():
        for x in ds:
            if x.get("lang") == "es":
                yield x["text"]
    return g()


FUENTES = [("tatoeba", tatoeba), ("oasst", oasst), ("wikipedia", wikipedia), ("subtitulos", subtitulos)]
if __name__ == "__main__":
    total = 0
    for nombre, f in FUENTES:
        tope = UNIDAS.get({"tatoeba": "Tatoeba", "oasst": "OASST", "wikipedia": "Wikipedia", "subtitulos": "Subtitulos"}[nombre])
        try:
            total += escribir(nombre, f(), tope)
        except Exception as e:
            print("fallo", nombre, str(e)[:200], flush=True)
    print("total", round(total / MB, 1), "MB")
