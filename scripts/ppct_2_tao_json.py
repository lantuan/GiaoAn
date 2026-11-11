import json, re, os, sys, unicodedata, collections
D=json.load(open('ppct_v2_raw.json')); OUT=sys.argv[1]
CATALOG={
 "PTTH2034":dict(ten="Bộ thiết bị để vẽ trên bảng trong dạy học toán (thước thẳng, compa)",loai="Dụng cụ",khoi=[10,11,12],so_luong=4),
 "PTTH3001":dict(ten="Phần mềm toán học - Đại số và Giải tích",loai="Phần mềm",khoi=[10,11,12],so_luong=1),
 "PTTH3002":dict(ten="Phần mềm toán học - Hình học và đo lường",loai="Phần mềm",khoi=[10,11,12],so_luong=1),
 "PTTH3003":dict(ten="Phần mềm toán học - Thống kê và xác suất",loai="Phần mềm",khoi=[10,11,12],so_luong=1),
 "TOAN001":dict(ten="Bộ dụng cụ vẽ kỹ thuật (thước T, compa, thước dài, eke, thước cong)",loai="Dụng cụ",khoi=[],so_luong=4),
 "PTTH2037":dict(ten="Bộ thiết bị dạy học về Thống kê và Xác suất",loai="Dụng cụ",khoi=[10],so_luong=8),
 "PTTH2035":dict(ten="Bộ thiết bị dạy học về các đường cônic",loai="Dụng cụ",khoi=[10],so_luong=8),
 "PTTH2036":dict(ten="Bộ thiết bị dạy học về hình chóp, hình chóp cụt, hình lăng trụ",loai="Dụng cụ",khoi=[11],so_luong=32),
 "TOAN002":dict(ten="Máy tính Acer",loai="",khoi=[],so_luong=3),
 "PTTHTA1001":dict(ten="Tranh điện tử",loai="",khoi=[],so_luong=None),
}
def codes_for(name,desc):
    n=name.lower()
    if 'vẽ trên bảng' in n: return ['PTTH2034']
    if 'vẽ kĩ thuật' in n or 'vẽ kỹ thuật' in n: return ['TOAN001']
    if 'cônic' in n or 'conic' in n: return ['PTTH2035']
    if 'hình chóp' in n: return ['PTTH2036']
    if 'thống kê và xác suất' in n: return ['PTTH2037']
    if 'tranh điện tử' in n: return ['PTTHTA1001']
    if 'máy vi tính' in n:
        dl=desc.lower()
        if 'vectơ' in dl: return ['TOAN002','PTTH3002']
        if 'xu thế' in dl or 'thống kê' in dl: return ['TOAN002','PTTH3003']
        return ['TOAN002','PTTH3001']
    return []
N=lambda s: re.sub(r'\s+',' ',unicodedata.normalize('NFC',s).lower()).strip()
ROMAN={'i':1,'ii':2,'iii':3,'iv':4,'v':5,'vi':6,'vii':7,'viii':8,'ix':9,'x':10}
def loai(r):
    t=r['ten']; ch=(r.get('chuong_ppct') or '')
    if re.search(r'chuyên đề nâng cao',t,re.I): return 'chuyen_sau'
    if re.match(r'^CĐ\s*\d',t) or re.search(r'chuyên đề\s*\d',t,re.I): return 'chuyen_de_hoc_tap'
    if re.search(r'ôn tập|kiểm tra',t,re.I): return 'on_tap_kiem_tra'
    if re.search(r'trải nghiệm|HĐTN',t,re.I) or (ch.upper().startswith('HOẠT ĐỘNG') and not re.match(r'^Bài\s*\d',t)): return 'trai_nghiem'
    return 'co_ban'
def so_tiet(s):
    n=0
    for p in re.split(r'[,;]',s):
        p=p.strip(); m=re.match(r'^(\d+)\s*[-–]\s*(\d+)$',p)
        if m: n+=int(m.group(2))-int(m.group(1))+1
        elif re.match(r'^\d+$',p): n+=1
    return n or None
GOOD=re.compile(r'^[1-6]\.[1-6]\.NC1[a-z]$')
rows=[]
for r in D['rows']:
    ten=r['ten'].strip().rstrip('.')
    mb=re.match(r'^Bài\s*(\d+)\s*[.:]\s*(.*)',ten); mc=re.match(r'^CĐ\s*(\d+)\s*[.\-–]\s*Bài\s*(\d+)\s*[.:]?\s*(.*)',ten)
    nls=[re.sub(r'\s+','',x) for x in re.split(r'[\n/;,]+',r['nls_raw']) if x.strip()]
    mt=re.match(r'^\s*(\d+)\s*(.*)$',r['tuan'],re.S); tuan_note=re.sub(r'\s+',' ',mt.group(2)).strip(' ()') if mt else ''
    if tuan_note: r['ghi_chu']=((r.get('ghi_chu') or '')+' '+tuan_note).strip()
    rows.append(dict(lop=r['lop'],hoc_ky=r['hoc_ky'],tuan=int(mt.group(1)) if mt else r['tuan'],
      tiet=r['tiet'],so_tiet=so_tiet(r['tiet']),loai=loai(r),ten=ten,
      bai_so=int(mb.group(1)) if mb else None, ten_bai=(mb.group(2) if mb else (mc.group(3) if mc else ten)).strip(),
      chuyen_de=f"CĐ{mc.group(1)}.B{mc.group(2)}" if mc else None,
      yccd=r['yccd'],nls=[x for x in nls if GOOD.match(x)],nls_loi=[x for x in nls if not GOOD.match(x)],
      ghi_chu=r.get('ghi_chu') or None,thiet_bi=[]))
# ---- map equipment
report=[]
TEN_PPCT={}   # thiết bị không có mã: lấy tên theo PPCT
def ten_gon(n): return re.sub(r'\s+',' ',re.sub(r'\(.*?\)','',n)).strip(' .')
for g,eq in D['equip'].items():
    g=int(g); G=[r for r in rows if r['lop']==g]
    dau=[N(x) for x in (D.get('equip_dau',{}).get(str(g)) or D.get('equip_dau',{}).get(g) or [])]
    iMa=next((i for i,x in enumerate(dau) if x.startswith('mã') or ' mã' in x),None)          # cột "Mã thiết bị" (nếu PPCT có)
    iBai=next((i for i,x in enumerate(dau) if re.search(r'thí nghiệm|thực hành|bài dạy|tiết dạy|sử dụng cho',x)),4)
    for e in eq:
        e=e+['']*8
        stt,name,sl,desc=e[:4]; refs=e[iBai] if iBai is not None else e[4]
        codes=[]
        if iMa is not None:
            codes=re.findall(r'\b[A-Z]{2,}[A-Z0-9]*\d+[A-Z0-9]*\b',e[iMa].upper())
            for c in codes:
                if c not in CATALOG: CATALOG[c]=dict(ten=ten_gon(name),loai="",khoi=[g],so_luong=None)
        if not codes: codes=codes_for(name,desc)
        if not codes:
            k='TB:'+ten_gon(name)[:60]; TEN_PPCT[k]=ten_gon(name); codes=[k]
            report.append(f"Lớp {g}: thiết bị '{name[:50]}' chưa có mã – ghi tên theo PPCT, không kèm mã")
        for ref in [x.strip(' -–.') for x in refs.split('\n') if x.strip(' -–.')]:
            hit=[]; rl=N(ref)
            if 'tất cả các tiết' in rl: hit=G
            elif m:=re.match(r'^chương\s*\d+\s*\.\s*bài\s*(\d+)\s*\.?\s*(.*)$',rl):
                hit=[r for r in G if r['bai_so']==int(m.group(1))]
                want=m.group(2)
                if hit and want:
                    X=lambda t: re.sub(r'\bbpt\b','bất phương trình',re.sub(r'\bpt\b','phương trình',t.replace('gtln','giá trị lớn nhất').replace('gtnn','giá trị nhỏ nhất').replace('lôgarit','logarit').replace('-',' và ')))
                    have=X(N(hit[0]['ten_bai'])); want=X(want); a=set(re.findall(r'\w+',want)); b=set(re.findall(r'\w+',have))
                    if len(a&b)/max(1,len(a))<0.6:
                        report.append(f"Lớp {g}: thiết bị '{name[:35]}…' ghi '{ref}' nhưng PPCT lớp {g} Bài {m.group(1)} là '{hit[0]['ten_bai']}' → KHÔNG gắn"); hit=[]
                elif not hit: report.append(f"Lớp {g}: '{ref}' không có Bài {m.group(1)} trong PPCT lớp {g}")
            elif m:=re.match(r'^chuy[êể]n đề\s*(\d+)\s*\.\s*bài\s*(\d+)',rl):
                hit=[r for r in G if r['chuyen_de']==f"CĐ{m.group(1)}.B{m.group(2)}"]
            elif m:=re.match(r'^chủ đề\s*(\d+)\s*\.\s*bài tập cuối chuyên đề\s*(\d+)',rl):
                hit=[r for r in G if re.fullmatch(rf'bài tập cuối chuyên đề {m.group(2)}',N(r['ten']))]
            elif rl.startswith('hđtn'):
                hk=2 if 'hkii' in rl.replace(' ','') else 1
                hit=[r for r in G if r['loai']=='trai_nghiem' and r['hoc_ky']==hk]
            elif m:=re.match(r'^bài tập cuối chương\s*(\d+)\s*\.\s*(ôn tập giữa học k[ìỳ]\s*i)?',rl):
                hit=[r for r in G if re.fullmatch(rf'bài tập cuối chương ({m.group(1)}|{[k for k,v in ROMAN.items() if v==int(m.group(1))][0]})',N(r['ten']))]
                if m.group(2): hit+= [r for r in G if re.fullmatch(r'ôn tập giữa học k[ìỳ] (1|i)',N(r['ten']))]
            if not hit: report.append(f"Lớp {g}: KHÔNG tìm thấy bài cho '{ref}' (thiết bị {codes})"); continue
            for r in hit:
                for c in codes:
                    tb=dict(ma="",ten=TEN_PPCT[c]) if c.startswith('TB:') else dict(ma=c,ten=CATALOG[c]['ten'])
                    if (tb['ma'] or tb['ten']) not in [t['ma'] or t['ten'] for t in r['thiet_bi']]: r['thiet_bi'].append(tb)
            for c in codes:
                if c.startswith('TB:'): continue
                k=CATALOG[c]['khoi']
                if k and g not in k: report.append(f"Lớp {g}: dùng {c} ({CATALOG[c]['ten'][:40]}) nhưng danh mục trường ghi khối {k}")
os.makedirs(OUT,exist_ok=True)
for g in (10,11,12):
    R=[r for r in rows if r['lop']==g]
    for kind,keep in (('chuyen',R),('thuong',[r for r in R if r['loai']!='chuyen_sau'])):
        p=f'{OUT}/toan{g}_{kind}.json'; json.dump(keep,open(p,'w'),ensure_ascii=False,indent=1)
        print(p.split('/')[-1],len(keep),'dòng')
json.dump(dict(nguon="Danh mục thiết bị tổ Toán – mã theo trang mượn thiết bị của trường",thiet_bi=CATALOG),open(f'{OUT}/../thiet_bi/thiet_bi_to_toan.json','w') if os.makedirs(f'{OUT}/../thiet_bi',exist_ok=True) is None else None,ensure_ascii=False,indent=1)
print("\n=== BÁO CÁO GẮN THIẾT BỊ ==="); [print('-',x) for x in dict.fromkeys(report)]
print("\n=== Số dòng có thiết bị (ngoài PTTH2034) ===")
for g in (10,11,12):
    c=collections.Counter(t['ma'] for r in rows if r['lop']==g for t in r['thiet_bi'])
    print(g,dict(c))
print("\nNLS lỗi:",[(r['lop'],r['tuan'],r['ten'][:30],r['nls_loi']) for r in rows if r['nls_loi']])
print("NLS trống:",[(r['lop'],r['tuan'],r['ten'][:40]) for r in rows if not r['nls'] and not r['nls_loi']])
