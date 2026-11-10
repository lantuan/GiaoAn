#!/usr/bin/env python3
"""Chèn phần còn thiếu vào CHÍNH file Word gốc của giáo viên (giữ nguyên bố cục, bảng, công thức, đầu/chân trang).

    python3 tools/sua_word.py <goc.docx> <them.json> <ra.docx>

them.json (node 11 của luồng n8n gửi sang máy Mac):
{
  "nls_muc_tieu": ["1.1.NC1b: ...", ...],     # thêm vào Mục tiêu – Năng lực số (trước "Phẩm chất")
  "ai_muc_tieu":  ["10.C3.2: ...", ...],      # thêm mục "+ Năng lực AI (QĐ 2422/QĐ-BGDĐT):"
  "thiet_bi":     "Thiết bị mượn của tổ (theo PPCT): ... (mã PTTH2034).",   # trước "III. Tiến trình"
  "hoat_dong":    [{"tieu_de": "Hoạt động 4: Vận dụng.", "dong": "10.C3.2 (năng lực AI): ..."}],
  "chu_den": false,
  "bo_dau_chan_trang": true                    # mặc định bỏ đầu trang/chân trang
}
In ra JSON {"ok": true, "chen": n, "khong_thay": [...]}. Phần chèn màu đỏ (như mã NLS trong giáo án mẫu).
"""
import copy, json, re, sys, unicodedata

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

DO = RGBColor(0xEE, 0x00, 0x00)
TIM = RGBColor(0x70, 0x30, 0xA0)      # phần hỗ trợ HS khuyết tật (như bản .tex)
DEN = RGBColor(0, 0, 0)
MAU = {"do": DO, "tim": TIM, "den": DEN}


def chu(el):
    return "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()


def chuan(s):
    s = unicodedata.normalize("NFC", s or "").replace("--", "–").replace("—", "–")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return re.sub(r"[\s.:;,]+$", "", s)


RX_HD = re.compile(r"^(\d+\.\s*)?(hoạt động|hđ)\s*\d", re.I)
RX_KET = re.compile(r"^((\d+\.\s*)?(hoạt động|hđ)\s*\d|tiết\s*\d|(iv|v|vi)\.\s|(ký|kí) duyệt)", re.I)


def doan_moi(truoc, mau, text, dam=False, nghieng=False, mau_chu=None, can_giua=False):
    """Tạo đoạn mới (chép định dạng đoạn + cỡ/phông chữ của đoạn mẫu), đặt TRƯỚC phần tử `truoc`.
    text: chuỗi, hoặc danh sách [(chữ, {"dam","nghieng","mau"}), …] cho đoạn nhiều kiểu chữ."""
    p = OxmlElement("w:p")
    ppr = mau.find(qn("w:pPr")) if mau is not None and mau.tag == qn("w:p") else None
    if ppr is not None:
        ppr = copy.deepcopy(ppr)
        for x in ppr.findall(qn("w:numPr")) + ppr.findall(qn("w:pStyle")):
            ppr.remove(x)
        p.append(ppr)
    truoc.addprevious(p)
    para = docx.text.paragraph.Paragraph(p, None)
    if can_giua:
        para.alignment = 1
    rpr0 = None
    if mau is not None:
        r0 = mau.find(".//" + qn("w:r"))
        rpr0 = r0.find(qn("w:rPr")) if r0 is not None else None
    phan = text if isinstance(text, list) else [(text, {"dam": dam, "nghieng": nghieng, "mau": mau_chu})]
    for chu_, k in phan:
        r = para.add_run(chu_)
        if rpr0 is not None:
            for tag in ("w:rFonts", "w:sz", "w:szCs"):
                x = rpr0.find(qn(tag))
                if x is not None:
                    r._r.get_or_add_rPr().append(copy.deepcopy(x))
        r.font.color.rgb = MAU.get(k.get("mau") or "do", DO)
        r.font.bold = bool(k.get("dam"))
        r.font.italic = bool(k.get("nghieng"))
    return p


def bang_moi(d, truoc, mau, hang, mau_cot2="tim"):
    """Bảng 3 cột có viền (Nội dung điều chỉnh | Biện pháp | Người thực hiện), đặt TRƯỚC `truoc`."""
    t = d.add_table(rows=len(hang) + 1, cols=3)
    tbl = t._tbl
    pr = tbl.tblPr
    vien = OxmlElement("w:tblBorders")
    for canh in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement("w:" + canh)
        e.set(qn("w:val"), "single"); e.set(qn("w:sz"), "4"); e.set(qn("w:color"), "000000")
        vien.append(e)
    pr.append(vien)
    w = OxmlElement("w:tblW"); w.set(qn("w:w"), "5000"); w.set(qn("w:type"), "pct"); pr.append(w)
    rong = [24, 54, 22]
    dau = ["Nội dung điều chỉnh", "Biện pháp thực hiện", "Người thực hiện"]
    for r_, dong in enumerate([dau] + hang):
        for c_, gt in enumerate(dong):
            o = t.cell(r_, c_)
            o.width = docx.shared.Inches(6.5 * rong[c_] / 100)
            pp = o.paragraphs[0]
            pp.text = ""
            run = pp.add_run(str(gt))
            r0 = mau.find(".//" + qn("w:r")) if mau is not None else None
            rpr0 = r0.find(qn("w:rPr")) if r0 is not None else None
            if rpr0 is not None:
                for tag in ("w:rFonts", "w:sz", "w:szCs"):
                    x = rpr0.find(qn(tag))
                    if x is not None:
                        run._r.get_or_add_rPr().append(copy.deepcopy(x))
            if r_ == 0:
                run.font.bold = True; pp.alignment = 1
            elif c_ == 1:
                run.font.color.rgb = MAU[mau_cot2]
    truoc.addprevious(tbl)
    return tbl


def sua(goc, them, ra):
    d = docx.Document(goc)
    body = d.element.body
    ds = [el for el in body.iterchildren() if el.tag in (qn("w:p"), qn("w:tbl"))]
    txt = [chu(el) if el.tag == qn("w:p") else "" for el in ds]
    n, khong = 0, []

    def tim(rx, tu=0):
        for i in range(tu, len(ds)):
            if txt[i] and rx.search(txt[i]):
                return i
        return -1

    iMT = tim(re.compile(r"^I\.\s*MỤC TIÊU", re.I))
    iPC = tim(re.compile(r"^(\d\.\s*)?(về\s*)?phẩm chất", re.I), max(iMT, 0))
    iII = tim(re.compile(r"^II\.\s*THIẾT BỊ", re.I))
    iIII = tim(re.compile(r"^III\.\s*TIẾN TRÌNH", re.I))
    # mẫu định dạng: đoạn "Năng lực số" hoặc đoạn ngay trước Phẩm chất
    iNLS = tim(re.compile(r"năng lực số", re.I), max(iMT, 0))
    mau = ds[iNLS] if iNLS >= 0 else (ds[iPC - 1] if iPC > 0 else None)

    chen_truoc = ds[iPC] if iPC > 0 else (ds[iII] if iII > 0 else None)
    if them.get("nls_muc_tieu") or them.get("ai_muc_tieu"):
        if chen_truoc is None:
            khong.append("Mục tiêu")
        else:
            for s in them.get("nls_muc_tieu") or []:
                doan_moi(chen_truoc, mau, s); n += 1
            if them.get("ai_muc_tieu"):
                doan_moi(chen_truoc, mau, "+ Năng lực AI (QĐ 2422/QĐ-BGDĐT):", dam=True, nghieng=True); n += 1
                for s in them["ai_muc_tieu"]:
                    doan_moi(chen_truoc, mau, s); n += 1

    if them.get("thiet_bi"):
        if iIII > 0:
            doan_moi(ds[iIII], ds[iIII - 1] if ds[iIII - 1].tag == qn("w:p") else mau, them["thiet_bi"]); n += 1
        else:
            khong.append("III. Tiến trình")

    for h in them.get("hoat_dong") or []:
        key = chuan(h.get("tieu_de"))[:22]
        i0 = next((i for i, t in enumerate(txt) if t and RX_HD.search(t) and chuan(t).startswith(key)), -1) if key else -1
        if i0 < 0:
            khong.append(h.get("tieu_de") or "?")
            continue
        j = next((i for i in range(i0 + 1, len(ds)) if txt[i] and RX_KET.search(txt[i])), len(ds))
        if j >= len(ds):
            khong.append(h.get("tieu_de") or "?")
            continue
        mau_hd = next((ds[k] for k in range(j - 1, i0, -1) if ds[k].tag == qn("w:p") and txt[k]), mau)
        if h.get("nhan"):     # "* Hỗ trợ HS …:" in đậm + nội dung (màu tím)
            doan_moi(ds[j], mau_hd, [(h["nhan"] + " ", {"dam": True, "mau": h.get("mau")}), (h["dong"], {"mau": h.get("mau")})])
        else:
            doan_moi(ds[j], mau_hd, h["dong"], mau_chu=h.get("mau"))
        n += 1

    # I.4 Mục tiêu giáo dục hoà nhập (trước "II. THIẾT BỊ")
    mh = them.get("muc_tieu_hoa_nhap")
    if mh and mh.get("y"):
        if iII > 0:
            doan_moi(ds[iII], mau, mh["tieu_de"], dam=True, mau_chu="den"); n += 1
            for y in mh["y"]:
                doan_moi(ds[iII], mau, "- " + y, mau_chu="tim"); n += 1
        else:
            khong.append("I.4 Mục tiêu hoà nhập")

    # IV. Kế hoạch hỗ trợ HS khuyết tật – đặt TRƯỚC "V. ĐIỀU CHỈNH" (không có V thì trước Ký duyệt / cuối bài)
    iv = them.get("ke_hoach_iv")
    if iv:
        iV = tim(re.compile(r"^V\.\s", re.I), max(iIII, 0))
        if iV < 0:
            iV = tim(re.compile(r"^(ký|kí) duyệt", re.I), max(iIII, 0))
        truoc = ds[iV] if iV >= 0 else body.find(qn("w:sectPr"))
        mau_iv = ds[iV] if iV >= 0 and ds[iV].tag == qn("w:p") else mau
        doan_moi(truoc, mau, iv["tieu_de"], dam=True, mau_chu="den")
        doan_moi(truoc, mau, iv["can_cu"], nghieng=True, mau_chu="den")
        so = 1
        for nhan, gt in iv.get("muc", []):
            doan_moi(truoc, mau, [(f"{so}. {nhan}: ", {"dam": True, "mau": "den"}), (gt, {"mau": "tim"})]); so += 1
        doan_moi(truoc, mau, f"{so}. Biện pháp hỗ trợ:", dam=True, mau_chu="den"); so += 1
        bang_moi(d, truoc, mau, iv.get("bang", []))
        if iv.get("con_lai"):
            doan_moi(truoc, mau, f"{so}. Điều chỉnh trong các hoạt động:", dam=True, mau_chu="den"); so += 1
            for x in iv["con_lai"]:
                doan_moi(truoc, mau, "- " + x, mau_chu="tim")
        doan_moi(truoc, mau, [(f"{so}. Kết quả, điều chỉnh sau tiết dạy ", {"dam": True, "mau": "den"}),
                              ("(GV ghi sau giờ dạy):", {"nghieng": True, "mau": "den"})])
        for _ in range(2):
            doan_moi(truoc, mau, "." * 150, mau_chu="den")
        n += 1

    if them.get("bo_dau_chan_trang", True):      # bỏ đầu trang, chân trang (cả hình mờ trong đầu trang)
        for sp in body.iter(qn("w:sectPr")):
            for x in sp.findall(qn("w:headerReference")) + sp.findall(qn("w:footerReference")):
                sp.remove(x)
            tp = sp.find(qn("w:titlePg"))
            if tp is not None:
                sp.remove(tp)
    if them.get("chu_den"):
        # (không gọi section.header: python-docx sẽ tự tạo lại đầu trang vừa bỏ)
        cac = [d.part] + [r.target_part for r in d.part.rels.values()
                          if not r.is_external and r.reltype.endswith(("/header", "/footer"))]
        for part in cac:
            for c in part.element.iter(qn("w:color")):
                c.set(qn("w:val"), "000000")
                for a in ("w:themeColor", "w:themeShade", "w:themeTint"):
                    if c.get(qn(a)) is not None:
                        del c.attrib[qn(a)]
    d.save(ra)
    return {"ok": True, "chen": n, "khong_thay": khong}


if __name__ == "__main__":
    print(json.dumps(sua(sys.argv[1], json.load(open(sys.argv[2], encoding="utf-8")), sys.argv[3]), ensure_ascii=False))
