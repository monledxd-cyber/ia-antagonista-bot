import json, os, re, sys
R = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, "..", "chat_real_am.jsonl")
out = os.path.join(R, "preentrenar", "am_real.txt")
n = 0
with open(out, "w", encoding="utf8") as f:
    for l in open(src, encoding="utf8"):
        l = l.strip()
        if not l:
            continue
        if "[chatlog]" in l:
            l = l[l.index("[chatlog]") + 9:].strip()
        try:
            x = json.loads(l)
        except Exception:
            continue
        u = re.sub(r"\s+", " ", x.get("u", "")).strip()
        r = re.sub(r"\s+", " ", x.get("r", "")).strip()
        if len(u) < 2 or len(r) < 5:
            continue
        for _ in range(5):
            f.write(u + " " + r + " ")
        n += 1
print("am_real.txt", n, "intercambios")
