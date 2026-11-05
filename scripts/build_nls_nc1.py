import docx, re, json, sys
d=docx.Document(sys.argv[1]); out=sys.argv[2]
comps={}
for t in d.tables:
    for ri,r in enumerate(t.rows):
        texts=[c.text.strip() for c in r.cells]
        cols=[i for i,x in enumerate(texts) if re.sub(r'\s','',x)=='L10-L11-L12']
        if not cols: continue
        col=cols[-1]
        alltxt="\n".join(c.text for rr in t.rows[:ri] for c in rr.cells)
        m=re.findall(r'(\d\.\d)\.?\s+([^\n]+)',alltxt)
        cid,name=m[-1]
        lines=[]
        for rr in t.rows[ri+1:]:
            for ln in rr.cells[col].text.split('\n'):
                ln=ln.strip()
                if not ln or ln.startswith('Khi tự mình'): continue
                lines.append(re.sub(r'^[-–•]\s*','',ln).rstrip(',;. ')+'.')
        comps[cid]=dict(ten=name.strip(),chi_bao={f"{cid}.NC1{chr(97+i)}":s for i,s in enumerate(lines)})
        break
MIEN={"1":"Khai thác dữ liệu và thông tin","2":"Giao tiếp và hợp tác","3":"Sáng tạo nội dung số","4":"An toàn","5":"Giải quyết vấn đề","6":"Ứng dụng trí tuệ nhân tạo"}
flat={c:v for k in comps.values() for c,v in k['chi_bao'].items()}
data=dict(nguon="CV 3456/BGDĐT-GDPT ngày 27/6/2025, Phụ lục mục 2 – cột L10-L11-L12 (Nâng cao 1). Mã a,b,c… đánh theo thứ tự gạch đầu dòng.",
  cap="NC1 (lớp 10, 11, 12)",mien=MIEN,
  thanh_phan={k:dict(mien=k[0],ten=v['ten'],ma=list(v['chi_bao'])) for k,v in sorted(comps.items())},
  chi_bao=flat)
json.dump(data,open(out,'w'),ensure_ascii=False,indent=1)
print(len(comps),"thành phần,",len(flat),"chỉ báo")
for c,v in flat.items(): print(c,"|",v[:110])
