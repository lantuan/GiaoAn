import json, re, os
rows=json.load(open('ppct_rows2.json'))
import sys
OUT=sys.argv[1] if len(sys.argv)>1 else '../data/ppct_2026_2027'
os.makedirs(OUT,exist_ok=True)
def so_tiet(s):
    n=0
    for p in re.split(r'[,;]',s):
        p=p.strip(); m=re.match(r'^(\d+)\s*[-–]\s*(\d+)$',p)
        if m: n+=int(m.group(2))-int(m.group(1))+1
        elif re.match(r'^\d+$',p): n+=1
    return n or None
def clean(r):
    ten=re.sub(r'\s+',' ',r['ten'])
    mb=re.match(r'^Bài\s*(\d+)',ten); mc=re.match(r'^CĐ\s*(\d+)\.\s*Bài\s*(\d+)',ten)
    return dict(lop=r['lop'],hoc_ky=r['hoc_ky'],tuan=int(r['tuan']) if r['tuan'].isdigit() else r['tuan'],
        tiet=r['tiet'],so_tiet=so_tiet(r['tiet']),loai=r['loai'],ten=ten,
        bai_so=int(mb.group(1)) if mb else None,
        chuyen_de=f"CĐ{mc.group(1)}.B{mc.group(2)}" if mc else None,
        yccd=r['yccd'],nls=r['nls'])
for g in (10,11):
    R=[clean(r) for r in rows if r['lop']==g]
    for kind,keep in (('chuyen',R),('thuong',[r for r in R if r['loai']!='chuyen_sau'])):
        p=f'{OUT}/toan{g}_{kind}.json'
        json.dump(keep,open(p,'w'),ensure_ascii=False,indent=1)
        print(p, len(keep), 'dòng', os.path.getsize(p)//1024,'KB')
