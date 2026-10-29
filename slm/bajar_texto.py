import os, re, sys
import urllib.request, zipfile, io
R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, "preentrenar")
ND = os.path.join(D, "_nltk")
os.makedirs(os.path.join(ND, "corpora"), exist_ok=True)
for p in ["cess_esp", "conll2002", "europarl_raw", "udhr"]:
    try:
        u = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/%s.zip" % p
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(u, timeout=60).read())).extractall(os.path.join(ND, "corpora"))
    except Exception as e:
        print("fallo", p, e)
import nltk
nltk.data.path.insert(0, ND)
from nltk.corpus import cess_esp, conll2002, europarl_raw, udhr

def des(t):
    t = re.sub(r" ([,.;:!?)»%])", r"\1", t)
    t = re.sub(r"([(¡¿«]) ", r"\1", t)
    t = re.sub(r'" ([^"]*?) "', r'"\1"', t)
    return t

def guardar(nombre, frases):
    ok = [des(re.sub(r"\s+", " ", f).strip()) for f in frases]
    ok = [f for f in ok if 20 <= len(f) <= 300]
    with open(os.path.join(D, nombre + ".txt"), "w", encoding="utf8") as fh:
        fh.write("\n".join(ok) + "\n")
    print(nombre, len(ok), sum(map(len, ok)))

def unir(t):
    t = " ".join(t)
    t = re.sub(r" ([,.;:!?)»])", r"\1", t)
    t = re.sub(r"([(¡¿«]) ", r"\1", t)
    return t.replace("*0*", "").replace("_", " ")

try:
    guardar("cess", [unir(s) for s in cess_esp.sents()])
except Exception as e:
    print("cess", e)
try:
    guardar("conll", [unir(s) for s in conll2002.sents("esp.train")])
except Exception as e:
    print("conll", e)
try:
    guardar("europarl", [l for f in europarl_raw.spanish.fileids() for l in europarl_raw.spanish.raw(f).split("\n")])
except Exception as e:
    print("europarl", e)
try:
    guardar("udhr", re.split(r"(?<=[.;])\s+", " ".join(udhr.words("Spanish_Espanol-Latin1"))))
except Exception as e:
    print("udhr", e)

import json
from collections import Counter
def lexico():
    n, a, nm = Counter(), Counter(), Counter()
    tg = {}
    for w, t in cess_esp.tagged_words():
        w = w.lower()
        if not w.isalpha() or not (3 <= len(w) <= 12):
            continue
        if t.startswith("nc") and len(t) > 3 and t[2] in "mf" and t[3] in "sp":
            n[w] += 1
            tg[w] = (t[2], t[3])
        elif t.startswith("aq") and t[3:5] == "ms" and w.endswith("o"):
            a[w] += 1
    for sent in conll2002.iob_sents("esp.train"):
        for w, _, t in sent:
            if t == "B-PER" and w.isalpha() and w[0].isupper() and 3 <= len(w) <= 10:
                nm[w] += 1
    out = {"nouns": [[w, tg[w][0], tg[w][1]] for w, c in n.most_common(1200) if c >= 6], "adj": [w for w, c in a.most_common(300) if c >= 6], "names": [w for w, c in nm.most_common(300) if c >= 3]}
    json.dump(out, open(os.path.join(R, "lexico.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("lexico", {k: len(v) for k, v in out.items()})
try:
    lexico()
except Exception as e:
    print("lexico", e)
