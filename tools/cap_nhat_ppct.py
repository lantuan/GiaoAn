#!/usr/bin/env python3
"""Tự cập nhật PPCT cho luồng giáo án từ file Word để trên OneDrive.

Thầy cô chỉ cần bỏ file PPCT (.docx, cùng mẫu bảng "TUẦN | TIẾT | TÊN BÀI | YCCĐ | MÃ NLS" + bảng thiết bị) vào
    OneDrive/GiaoAn_Goc/_PPCT/
Máy dịch PDF (máy Mac) kiểm tra thư mục này vài phút một lần; thấy file mới/đổi thì chạy:
    scripts/ppct_1_doc_word.py  →  scripts/ppct_2_tao_json.py  →  data/ppct_hien_hanh/toan{10,11,12}_{chuyen,thuong}.json
Node 04 của n8n đọc PPCT từ máy Mac (đường hầm, có mã bí mật), làm mới sau ≤ 30 phút; máy Mac tắt thì dùng bản trên GitHub.
Muốn cập nhật cả bản trên GitHub: GitHub Desktop → commit + push thư mục data/ppct_hien_hanh (không tự push).
Báo cáo (số dòng, thiết bị không gắn được, mã NLS lỗi) ghi ra OneDrive/GiaoAn_Goc/_PPCT/BAO_CAO_PPCT.txt.

    python3 tools/cap_nhat_ppct.py            # kiểm tra, có thay đổi thì cập nhật
    python3 tools/cap_nhat_ppct.py --ep       # cập nhật lại dù không đổi
    python3 tools/cap_nhat_ppct.py --push     # (tuỳ chọn, chạy tay) commit + push data/ppct_hien_hanh
"""
import glob, hashlib, json, os, shutil, subprocess, sys, tempfile, time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THU_MUC = os.environ.get("PPCT_THU_MUC") or os.path.expanduser("~/Library/CloudStorage/OneDrive-Personal/GiaoAn_Goc/_PPCT")
OUT_REL = "data/ppct_hien_hanh"
TRANG_THAI = os.path.expanduser("~/Library/Application Support/MayDichPDF/ppct_trang_thai.json")


def ghi_tt(d):
    os.makedirs(os.path.dirname(TRANG_THAI), exist_ok=True)
    json.dump(d, open(TRANG_THAI, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def doc_tt():
    try:
        return json.load(open(TRANG_THAI, encoding="utf-8"))
    except Exception:
        return {}


def file_ppct():
    ds = [f for f in glob.glob(os.path.join(THU_MUC, "*.docx")) if not os.path.basename(f).startswith(("~$", "."))]
    return max(ds, key=os.path.getmtime) if ds else None


def bam(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]


def chay(ep=False, push=True):
    os.makedirs(THU_MUC, exist_ok=True)
    f = file_ppct()
    if not f:
        return {"doi": False, "ly_do": "Chưa có file .docx trong " + THU_MUC}
    h = bam(f)
    tt = doc_tt()
    if not ep and tt.get("bam") == h:
        return {"doi": False, "ly_do": "PPCT không đổi"}
    with tempfile.TemporaryDirectory(prefix="ppct_") as tmp:
        sc = os.path.join(REPO, "scripts")
        r1 = subprocess.run([sys.executable, os.path.join(sc, "ppct_1_doc_word.py"), f], cwd=tmp, capture_output=True, text=True, timeout=300)
        if r1.returncode or not os.path.isfile(os.path.join(tmp, "ppct_v2_raw.json")):
            return {"doi": False, "loi": "Không đọc được file PPCT: " + (r1.stderr or r1.stdout)[-400:]}
        out_tmp = os.path.join(tmp, "out", "ppct")
        r2 = subprocess.run([sys.executable, os.path.join(sc, "ppct_2_tao_json.py"), out_tmp], cwd=tmp, capture_output=True, text=True, timeout=300)
        if r2.returncode:
            return {"doi": False, "loi": "Lỗi tạo JSON: " + (r2.stderr or r2.stdout)[-400:]}
        # kiểm tra tối thiểu trước khi thay dữ liệu đang dùng
        dem = {}
        for g in (10, 11, 12):
            p = os.path.join(out_tmp, f"toan{g}_chuyen.json")
            dem[g] = len(json.load(open(p, encoding="utf-8"))) if os.path.isfile(p) else 0
        thieu = [g for g, n in dem.items() if n < 10]
        bao_cao = (f"Cập nhật PPCT lúc {time.strftime('%H:%M %d/%m/%Y')}\nFile: {os.path.basename(f)}\n"
                   f"Số dòng (bản chuyên): lớp 10: {dem[10]}, lớp 11: {dem[11]}, lớp 12: {dem[12]}\n\n"
                   + r1.stdout[-1500:] + "\n" + r2.stdout[-6000:])
        if thieu:
            open(os.path.join(THU_MUC, "BAO_CAO_PPCT.txt"), "w", encoding="utf-8").write(
                "⚠ KHÔNG cập nhật: lớp " + ", ".join(map(str, thieu)) + " gần như không đọc được dòng nào – kiểm tra lại mẫu bảng.\n\n" + bao_cao)
            return {"doi": False, "loi": f"File PPCT thiếu dữ liệu lớp {thieu}", "dem": dem}
        dich = os.path.join(REPO, OUT_REL)
        os.makedirs(dich, exist_ok=True)
        for p in glob.glob(os.path.join(out_tmp, "*.json")):
            shutil.copy(p, dich)
        tb = os.path.join(tmp, "out", "thiet_bi", "thiet_bi_to_toan.json")
        if os.path.isfile(tb):
            os.makedirs(os.path.join(REPO, "data/thiet_bi"), exist_ok=True)
            shutil.copy(tb, os.path.join(REPO, "data/thiet_bi/thiet_bi_to_toan.json"))
    open(os.path.join(THU_MUC, "BAO_CAO_PPCT.txt"), "w", encoding="utf-8").write("✅ Đã cập nhật PPCT cho luồng giáo án.\n" + bao_cao)
    kq = {"doi": True, "dem": dem, "file": os.path.basename(f)}
    if push:
        g = lambda *a: subprocess.run(["git", "-C", REPO] + list(a), capture_output=True, text=True, timeout=120)
        g("add", OUT_REL, "data/thiet_bi")
        if g("diff", "--cached", "--quiet").returncode:
            c = g("commit", "-m", f"Cập nhật PPCT từ OneDrive: {os.path.basename(f)}", "--", OUT_REL, "data/thiet_bi")
            p = g("push")
            kq["push"] = "đã push" if p.returncode == 0 else "push lỗi: " + (p.stderr or p.stdout)[-300:]
            if c.returncode:
                kq["push"] = "commit lỗi: " + (c.stderr or c.stdout)[-300:]
        else:
            kq["push"] = "dữ liệu giống bản trên GitHub"
    ghi_tt({"bam": h, "file": os.path.basename(f), "luc": time.strftime("%H:%M %d/%m/%Y"), "kq": kq})
    return kq


if __name__ == "__main__":
    print(json.dumps(chay(ep="--ep" in sys.argv, push="--push" in sys.argv), ensure_ascii=False))
