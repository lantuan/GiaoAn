import sys, docx, re, json, collections
from docx.table import Table
from docx.text.paragraph import Paragraph
d=docx.Document(sys.argv[1])
def cells(r):
    seen=[];out=[]
    for c in r.cells:
        if c._tc in seen: continue
        seen.append(c._tc); out.append(c.text.strip())
    return out
grade=None;hk=None;rows=[];equip={};chuong=None
for el in d.element.body.iterchildren():
    tag=el.tag.split('}')[1]
    if tag=='p':
        t=Paragraph(el,d).text.strip()
        m=re.search(r'KHỐI LỚP\s*(1[0-2])',t)
        if m: grade=int(m.group(1)); hk=None; chuong=None
        if re.fullmatch(r'HỌC KỲ\s*I',t): hk=1
        if re.fullmatch(r'HỌC KỲ\s*II',t): hk=2
        continue
    if tag!='tbl': continue
    tb=Table(el,d); h=[x.upper() for x in cells(tb.rows[0])]
    if h and h[0]=='STT' and 'THIẾT BỊ DẠY HỌC' in h[1]:
        equip[grade]=[cells(r) for r in tb.rows[1:]]; continue
    if h and h[0]=='TUẦN':
        for r in tb.rows[1:]:
            c=cells(r)
            if len(c)<4 or not c[0]:
                txt=' '.join(c).strip()
                if re.match(r'CHƯƠNG|CHUYÊN ĐỀ|CHỦ ĐỀ|HOẠT ĐỘNG',txt,re.I): chuong=re.sub(r'\s+',' ',txt)
                elif txt: print('?? skip row',grade,txt[:80])
                continue
            if len(c)==5: tuan,tiet,ten,yc,nls=c; ghi=''
            elif len(c)==6: tuan,tiet,ten,yc,nls,ghi=c
            else: print('?? cols',len(c),c[:3]); continue
            rows.append(dict(lop=grade,hoc_ky=hk,tuan=tuan,tiet=tiet,ten=re.sub(r'\s+',' ',ten),yccd=yc,nls_raw=nls,ghi_chu=ghi,chuong_ppct=chuong))
print(len(rows),collections.Counter((r['lop'],r['hoc_ky']) for r in rows))
json.dump(dict(rows=rows,equip=equip),open('ppct_v2_raw.json','w'),ensure_ascii=False)
