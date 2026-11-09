#!/usr/bin/env python3
"""Tìm giáo án gốc trong thư mục OneDrive theo yêu cầu kiểu "Làm giáo án Bài 8 lớp 10, in chữ đen".

    python3 tools/tim_giao_an.py "yêu cầu" [lớp] [số bài] [tên bài]      → in JSON {"ket_qua": [...], "goi_y": ...}

Máy dịch PDF gọi file này khi thầy cô nhắn chữ (không kèm file) cho bot Telegram.
Thư mục gốc: biến môi trường GIAOAN_GOC, mặc định ~/Library/CloudStorage/OneDrive-Personal/GiaoAn_Goc
"""
import json, os, re, sys, unicodedata

GOC = os.environ.get("GIAOAN_GOC") or os.path.expanduser("~/Library/CloudStorage/OneDrive-Personal/GiaoAn_Goc")

BO = set("""lam giao an soan sua chinh hoan thien chuan hoa cho toi minh giup voi nhe nha di lop bai toan khbd ke hoach day hoc
in chu den mau bo khong to co em ban hoc sinh hs hskt khuyet tat nhe nang o chan tay mat tai di lai kho khan hoa nhap
theo cv 5512 cong van va cua la mot cac nhung trong tiet phut ket noi tri thuc canh dieu chan troi sang tao
tim lay file word tex docx gui ve pdf can them bo sung tuan ngay hoc ki hk chuyen de giao an""".split())


def bo_dau(s):
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def lop_cua(duong):
    t = bo_dau(duong)
    m = re.search(r"\btoan (10|11|12)\b", t) or re.search(r"\blop ?(10|11|12)\b", t) or re.search(r"\b(10|11|12) ?c ?\d", t)
    return m.group(1) if m else None


def la_tex_chinh(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            return "\\documentclass" in f.read(20000)
    except Exception:
        return False


def ds_file():
    out = []
    for root, dirs, fs in os.walk(GOC):
        dirs[:] = [d for d in dirs if not d.startswith(".") and not d.endswith("_hinh")]
        for f in fs:
            if f.startswith(("~$", ".")):
                continue
            low = f.lower()
            if low.endswith(".docx") or (low.endswith(".tex") and "_cv5512" not in low):
                p = os.path.join(root, f)
                if low.endswith(".tex") and not la_tex_chinh(p):
                    continue          # mảnh \input, không dịch riêng được
                out.append(p)
    return out


def phan_tich(text, lop=None, bai=None, ten=None):
    t = bo_dau(text)
    if not lop:
        m = re.search(r"\b(?:lop|toan|khoi)\s*(10|11|12)\b", t)
        lop = m.group(1) if m else None
    if not bai:
        m = re.search(r"\bbai\s*(\d{1,2})\b", t)
        bai = m.group(1) if m else None
    cd = re.search(r"\bchuyen de\s*(\d)\b|\bcd\s*(\d)\b", t)
    cd = (cd.group(1) or cd.group(2)) if cd else None
    ch = re.search(r"\bchuong\s*([ivx]+|\d+)\b", t)
    ch = ch.group(1) if ch else None
    nguon = bo_dau(ten) if ten else t
    nguon = re.sub(r"\bchuong\s*([ivx]+|\d+)\b", " ", nguon)
    tu = [w for w in nguon.split() if w not in BO and not w.isdigit() and len(w) > 1]
    return {"lop": lop, "bai": bai, "cd": cd, "tu": tu, "bai_tap_cuoi": "bai tap cuoi chuong" in t, "chuong": ch,
            "chuyen_de": bool(cd) or "chuyen de" in t, "trai_buoi": "trai buoi" in t or "traibuoi" in t}


def cham(p, y):
    rel = os.path.relpath(p, GOC)
    ten = bo_dau(os.path.splitext(os.path.basename(p))[0])
    thu_muc = bo_dau(os.path.dirname(rel))
    lp = lop_cua(rel)
    if y["lop"] and lp and lp != y["lop"]:
        return None
    d = 0.0 if (not y["lop"] or lp) else -1.0
    la_cd = "chuyen de" in thu_muc or "cdht" in thu_muc or re.match(r"cd ?\d", ten)
    la_tb = "trai buoi" in thu_muc or "traibuoi" in thu_muc
    if y["bai"]:
        m = re.match(r"(?:cd ?\d+ ?)?b(?:ai)? ?(\d+)\b", ten)
        if not m or m.group(1) != y["bai"]:
            return None
        if la_cd and not y["chuyen_de"]:
            return None       # "Bài 8" của chuyên đề (CD3-B8) chỉ lấy khi có nói "chuyên đề"
        d += 10
    if y["cd"]:
        m = re.search(r"chuyen de ?(\d)|cd ?(\d)", thu_muc + " " + ten)
        if not m or (m.group(1) or m.group(2)) != y["cd"]:
            return None
        d += 5
    if y["chuyen_de"] != bool(la_cd):
        d -= 1.5
    if y["trai_buoi"] != la_tb:
        d -= 1.5
    if y["bai_tap_cuoi"]:
        m = re.search(r"bai tap cuoi chuong ?([ivx]+|\d+)?", ten)
        if not m:
            return None
        if y["chuong"] and m.group(1) and m.group(1) != y["chuong"]:
            return None
        d += 6
    if re.search(r"\bcopy\b|\bban sao\b", ten):
        d -= 1
    tt = set(ten.split())
    tm = set(thu_muc.split())
    trung = 0
    for w in y["tu"]:
        if w in tt:
            trung += 1
        d += 2 if w in tt else (0.5 if w in tm else 0)
    if y["tu"] and trung == len(y["tu"]) and len(y["tu"]) >= 2:
        d += 3                # khớp đủ cả cụm tên bài
    if p.lower().endswith(".tex"):
        d += 0.5              # có sẵn .tex thì dùng .tex (ít lỗi chuyển công thức hơn)
    return d


def tim(text, lop=None, bai=None, ten=None):
    y = phan_tich(text, lop, bai, ten)
    if not os.path.isdir(GOC):
        return {"ket_qua": [], "goi_y": "Không thấy thư mục %s (OneDrive chưa đồng bộ?)" % GOC}
    if not (y["bai"] or y["cd"] or len(y["tu"]) >= 1 or y["bai_tap_cuoi"]):
        return {"ket_qua": [], "goi_y": "Ghi rõ số bài hoặc tên bài, ví dụ: Làm giáo án Bài 8 lớp 10."}
    ds = []
    for p in ds_file():
        d = cham(p, y)
        if d is not None and d > 0:
            ds.append((d, p))
    ds.sort(key=lambda x: (-x[0], x[1]))
    # cùng một bài có cả .docx và .tex cạnh nhau → chỉ giữ .tex
    gon, thay = [], set()
    for d, p in ds:
        k = (os.path.dirname(p), bo_dau(re.sub(r"(_extest|_equation.*)$", "", os.path.splitext(os.path.basename(p))[0])))
        if k in thay:
            continue
        thay.add(k)
        gon.append({"diem": d, "duong_dan": p, "hien": os.path.relpath(p, GOC)})
    if gon:                   # bỏ các bản kém xa bản tốt nhất
        gon = [x for x in gon if x["diem"] >= gon[0]["diem"] * 0.6]
    return {"ket_qua": gon[:8], "y": y}


def chon_mot(kq):
    """Trả về bản duy nhất nếu rõ ràng hơn hẳn các bản khác."""
    ds = kq.get("ket_qua") or []
    if len(ds) == 1:
        return ds[0]
    if len(ds) >= 2 and ds[0]["diem"] - ds[1]["diem"] >= 2:
        return ds[0]
    return None


if __name__ == "__main__":
    a = sys.argv[1:] + [None] * 4
    print(json.dumps(tim(a[0] or "", a[1], a[2], a[3]), ensure_ascii=False, indent=1))
