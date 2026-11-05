import json, math, re, sys, struct, collections
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression

N = 1 << 16
def h(s):
    x = 2166136261
    for b in s.encode('utf8'):
        x = ((x ^ b) * 16777619) & 0xFFFFFFFF
    return x % N

def feats(t):
    t = t.lower()
    ws = re.findall(r'[^\W_]+', t, re.UNICODE)
    c = collections.Counter()
    for w in ws:
        p = ' ' + w + ' '
        for n in range(2, 6):
            for i in range(len(p) - n + 1):
                c[h('c:' + p[i:i+n])] += 1
        c[h('w:' + w)] += 1
    for i in range(len(ws) - 1):
        c[h('b:' + ws[i] + ' ' + ws[i+1])] += 1
    v = {k: 1 + math.log(n) for k, n in c.items()}
    nr = math.sqrt(sum(x * x for x in v.values())) or 1
    return {k: x / nr for k, x in v.items()}

def matriz(textos):
    ind, dat, ptr = [], [], [0]
    for t in textos:
        f = feats(t)
        ind += list(f.keys()); dat += list(f.values()); ptr.append(len(ind))
    return csr_matrix((dat, ind, ptr), shape=(len(textos), N))

if __name__ == '__main__':
    tr = [json.loads(l) for l in open('chat_dataset.jsonl', encoding='utf8') if l.strip()]
    te = [json.loads(l) for l in open('chat_test.jsonl', encoding='utf8') if l.strip()]
    vistos = set(); X = []; y = []
    for r in tr:
        k = (r['u'], r['c'])
        if k in vistos: continue
        vistos.add(k); X.append(r['u']); y.append(r['c'])
    clf = LogisticRegression(C=30, max_iter=300)
    clf.fit(matriz(X), y)
    W = clf.coef_.astype(np.float32); b = clf.intercept_.astype(np.float32)
    esc = np.abs(W).max(axis=1) / 127.0
    Q = np.round(W / esc[:, None]).astype(np.int8)
    open('chat/clf.bin', 'wb').write(Q.tobytes())
    json.dump({'N': N, 'clases': list(clf.classes_), 'esc': [float(x) for x in esc], 'b': [float(x) for x in b]}, open('chat/clf.json', 'w'))
    Xt = matriz([r['u'] for r in te])
    Wd = Q.astype(np.float32) * esc[:, None]
    z = Xt @ Wd.T + b
    z = np.asarray(z)
    pr = np.exp(z - z.max(1, keepdims=True)); pr /= pr.sum(1, keepdims=True)
    pred = [clf.classes_[i] for i in pr.argmax(1)]
    st = collections.defaultdict(lambda: [0, 0])
    for r, p in zip(te, pred):
        s = st[r['modo']]; s[0] += 1; s[1] += (p == r['c'])
    for m, s in st.items(): print(m, '%.0f%%' % (100 * s[1] / s[0]))
    print('TOTAL %.1f%%' % (100 * sum(s[1] for s in st.values()) / len(te)))
    json.dump([{'u': r['u'], 'p': p, 'conf': float(pr[i].max())} for i, (r, p) in enumerate(zip(te, pred))], open('/tmp/clf_pred.json', 'w'))
