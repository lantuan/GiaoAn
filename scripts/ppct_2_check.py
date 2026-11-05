import json, re, collections
rows=json.load(open('ppct_rows.json'))
COMP={'1.1','1.2','1.3','2.1','2.2','2.3','2.4','2.5','2.6','3.1','3.2','3.3','3.4','4.1','4.2','4.3','4.4','5.1','5.2','5.3','5.4','6.1','6.2','6.3'}
GOOD=re.compile(r'^([1-6]\.[1-6])\.NC1([a-z])$')
bad=[];allc=collections.Counter();combos=collections.Counter();empty=[]
def loai(t):
    if re.search(r'chuyên đề nâng cao',t,re.I): return 'chuyen_sau'
    if re.match(r'CĐ\s*\d',t): return 'chuyen_de_hoc_tap'
    return 'co_ban'
for r in rows:
    r['loai']=loai(r['ten'])
    toks=[x.strip() for x in re.split(r'[\n/;,]+',r['nls_raw']) if x.strip()]
    codes=[]
    for t in toks:
        t2=re.sub(r'\s+','',t)
        m=GOOD.match(t2)
        if m and m.group(1) in COMP: codes.append(t2)
        else: bad.append((r['lop'],r['tuan'],r['ten'][:40],repr(t)))
    r['nls']=codes
    if not codes: empty.append((r['lop'],r['tuan'],r['ten'][:50]))
    allc.update(codes); combos[' / '.join(codes)]+=1
print("rows by loai:",collections.Counter((r['lop'],r['loai']) for r in rows))
print("\nBAD tokens:",len(bad)); [print(' ',b) for b in bad[:30]]
print("\nEMPTY:",len(empty)); [print(' ',e) for e in empty[:20]]
print("\nCODE freq:",allc.most_common())
print("\nTop combos:"); [print(f'  {n:3d}  {c}') for c,n in combos.most_common(8)]
print("distinct combos:",len(combos))
used=set(c[:3] for c in allc); print("\ncomponents never used:",sorted(COMP-used))
# same lesson different codes
byname=collections.defaultdict(set)
for r in rows: byname[(r['lop'],r['ten'])].add(tuple(r['nls']))
inc=[(k,v) for k,v in byname.items() if len(v)>1]
print("\nSame lesson, different code sets:",len(inc)); [print(' ',k[0],k[1][:50],[' / '.join(x) for x in v]) for k,v in inc[:10]]
json.dump(rows,open('ppct_rows2.json','w'),ensure_ascii=False)
