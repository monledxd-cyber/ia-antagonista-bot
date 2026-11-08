import glob,unicodedata,os,sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'conceptos'))
def n(s): return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn').strip()
new=sys.argv[1:]
seen={}
fs=[os.path.basename(f)[:-4] for f in sorted(glob.glob('*.txt'),key=os.path.getmtime) if 'remates' not in f]
for name in [x for x in fs if x not in new]+new:
    L=open(name+'.txt',encoding='utf8').read().split('\n');out=[];i=0
    while i<len(L):
        l=L[i]
        if l.startswith('@'):
            al=[a.strip() for a in l[1:].split('|')];body=[];i+=1
            while i<len(L) and not L[i].startswith('@') and L[i].strip(): body.append(L[i]);i+=1
            if name not in new:
                for a in al: seen.setdefault(n(a),name)
                out+=[l]+body
            else:
                if n(al[0]) in seen: continue
                keep=[a for a in al if n(a) not in seen]
                for a in keep: seen[n(a)]=name
                out+=['@ '+' | '.join(keep)]+body
        else:
            if l.strip(): out.append(l)
            i+=1
    if name in new: open(name+'.txt','w',encoding='utf8').write('\n'.join(out)+'\n')
