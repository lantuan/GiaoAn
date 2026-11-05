import sys, docx, re, json, collections
from docx.table import Table
from docx.text.paragraph import Paragraph
d = docx.Document(sys.argv[1])
grade=None; hk=None; rows=[]
for el in d.element.body.iterchildren():
    tag=el.tag.split('}')[1]
    if tag=='p':
        t=Paragraph(el,d).text.strip()
        m=re.search(r'KHỐI LỚP\s*(1[0-2])',t)
        if m: grade=int(m.group(1)); hk=None
        if re.fullmatch(r'HỌC KỲ\s*I',t): hk=1
        if re.fullmatch(r'HỌC KỲ\s*II',t): hk=2
    elif tag=='tbl':
        tb=Table(el,d)
        hdr=[c.text.strip() for c in tb.rows[0].cells]
        if len(hdr)==5 and hdr[0]=='Tuần':
            for r in tb.rows[1:]:
                c=[x.text.strip() for x in r.cells]
                rows.append(dict(lop=grade,hoc_ky=hk,tuan=c[0],tiet=c[1],ten=c[2],yccd=c[3],nls_raw=c[4]))
print(len(rows), collections.Counter((r['lop'],r['hoc_ky']) for r in rows))
json.dump(rows,open('ppct_rows.json','w'),ensure_ascii=False,indent=0)
