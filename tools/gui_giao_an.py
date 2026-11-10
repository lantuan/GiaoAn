#!/usr/bin/env python3
"""Gửi giáo án trên máy Mac (thư mục OneDrive) thẳng vào luồng n8n GA_01_TELEGRAM_RECEIVE – không cần tự gửi qua Telegram.

    python3 tools/gui_giao_an.py <file .docx | .tex | .zip | thư mục bài> ["chú thích như khi gửi bot"]

- .docx: đổi MathType → Equation (nếu có), rồi Word2Tex (bản ex_test) → .zip gồm .tex + ex_test.sty + hình.
- .tex : gói kèm ex_test.sty và các hình mà file gọi tới (\\includegraphics) → .zip.
- thư mục: gói các file .tex/.sty/hình bên trong → .zip.   .zip: gửi nguyên.
Kết quả (.tex + .pdf) về Telegram như khi tự gửi file cho bot. File gốc cũng hiện trong khung chat.

Cấu hình đọc từ máy dịch PDF: ~/Library/Application Support/MayDichPDF/config.json
  bi_mat  – mã bí mật (n8n đã nhận qua node 13)
  chat_id – mã chat Telegram (gõ /id cho bot để biết), lưu một lần:  python3 tools/gui_giao_an.py --chat-id 123456
"""
import base64, json, os, re, shutil, subprocess, sys, tempfile, zipfile, unicodedata

CFG_PATH = os.path.expanduser("~/Library/Application Support/MayDichPDF/config.json")
GOC_DIR = os.path.expanduser("~/Library/Application Support/MayDichPDF/goc")   # Word gốc (đã đổi MathType) để trả Word đúng bản của GV
PY = os.path.expanduser("~/Desktop/NganHangDe_Lan/Python")
WORD2TEX = os.path.join(PY, "Word2Tex")
HUB = os.path.join(PY, "BangDieuKhien")
ANH = (".png", ".jpg", ".jpeg", ".pdf", ".eps", ".gif", ".bmp", ".svg")


def doc_cfg():
    with open(CFG_PATH, encoding="utf-8") as f:
        return json.load(f)


def nfc(s):
    return unicodedata.normalize("NFC", s)


def co_mathtype(docx):
    with zipfile.ZipFile(docx) as z:
        for n in z.namelist():
            if n.startswith("word/embeddings/") and n.endswith(".bin"):
                if b"Equation.DSMT" in z.read(n) or b"MathType" in z.read(n):
                    return True
    return False


def doi_mathtype(src, tmp):
    sys.path.insert(0, HUB)
    import hub  # noqa: công cụ mathtype2omml cấu hình sẵn trong Bảng điều khiển
    tool, why = hub.mathtype_tool()
    if not tool:
        raise SystemExit("Không đổi được MathType: " + why)
    dst = os.path.join(tmp, os.path.splitext(os.path.basename(src))[0] + "_equation.docx")
    rep = os.path.join(tmp, "report.json")
    subprocess.run(tool["cmd"] + ["convert", src, "-o", dst, "--xsl", tool["xsl"], "--report", rep, "--quiet"],
                   capture_output=True, env=tool["env"], timeout=900, cwd=tool["dir"])
    if not os.path.isfile(dst):
        raise SystemExit("Không đổi được MathType sang Equation.")
    try:
        j = json.load(open(rep, encoding="utf-8"))
        print("MathType → Equation: %s/%s công thức" % (j.get("succeeded"), j.get("total_formulas")))
    except Exception:
        pass
    return dst


def word_sang_tex(src, tmp, stem):
    if co_mathtype(src):
        src = doi_mathtype(src, tmp)
    os.makedirs(GOC_DIR, exist_ok=True)
    shutil.copyfile(src, os.path.join(GOC_DIR, nfc(stem) + ".docx"))
    sys.path.insert(0, WORD2TEX)
    import word2tex
    out = os.path.join(tmp, "bai")
    os.makedirs(out)
    tex = os.path.join(out, stem + "_extest.tex")
    word2tex.convert_docx(src, tex, {"extest": True, "engine": "auto"}, lambda *a: None,
                          img_dir=word2tex.ascii_slug(stem) + "_hinh")
    print("Word → TeX: xong (%s)" % os.path.basename(tex))
    return out


def tex_va_hinh(tex):
    """Thư mục tạm chứa .tex + ex_test.sty + các hình mà file gọi tới (giữ đường dẫn tương đối)."""
    d0 = os.path.dirname(os.path.abspath(tex))
    s = open(tex, encoding="utf-8", errors="replace").read()
    files = {os.path.basename(tex): tex}
    for sty in ("ex_test.sty", "bclogo.sty"):
        if os.path.isfile(os.path.join(d0, sty)):
            files[sty] = os.path.join(d0, sty)
    gp = [g.strip() for g in re.findall(r"\\graphicspath\{((?:\{[^{}]*\})+)\}", s) for g in re.findall(r"\{([^{}]*)\}", g)]
    for name in re.findall(r"\\includegraphics\*?(?:\[[^\]]*\])?\{([^{}]+)\}", s):
        name = name.strip()
        for base in [""] + gp:
            cand = os.path.normpath(os.path.join(d0, base, name))
            hit = next((cand + e for e in [""] + list(ANH) if os.path.isfile(cand + e)), None)
            if hit and os.path.abspath(hit).startswith(d0 + os.sep):
                files[os.path.relpath(hit, d0)] = hit
                break
    return files


def thu_muc(d):
    files = {}
    for root, _, fs in os.walk(d):
        for f in fs:
            if f.lower().endswith((".tex", ".sty") + ANH) and not f.startswith("."):
                p = os.path.join(root, f)
                files[os.path.relpath(p, d)] = p
    return files


def nen(files, zpath):
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, p in files.items():
            z.write(p, nfc(rel))
    return zpath


def gui(zpath, ten, caption, cfg):
    url = cfg["webhook"].rsplit("/", 1)[0] + "/ga-nhan-giao-an"
    body = {"chat_id": str(cfg["chat_id"]), "file_name": nfc(ten), "caption": nfc(caption),
            "b64": base64.b64encode(open(zpath, "rb").read()).decode()}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
        bf = f.name
    try:   # curl: Python trên máy này hay lỗi chứng chỉ SSL
        r = subprocess.run(["curl", "-sS", "-m", "120", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
                            "-H", "Content-Type: application/json", "-H", "X-Bi-Mat: " + cfg["bi_mat"],
                            "--data-binary", "@" + bf, url], capture_output=True, text=True)
    finally:
        os.unlink(bf)
    if r.stdout.strip() != "200":
        raise SystemExit("n8n không nhận (HTTP %s) %s" % (r.stdout.strip(), r.stderr.strip()))
    print("Đã gửi %s (%d KB) vào luồng – kết quả sẽ về Telegram." % (ten, os.path.getsize(zpath) // 1024))


def main(argv):
    if len(argv) >= 2 and argv[0] == "--chat-id":
        cfg = doc_cfg()
        cfg["chat_id"] = argv[1].strip()
        json.dump(cfg, open(CFG_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return print("Đã lưu mã chat.")
    if not argv:
        raise SystemExit(__doc__)
    src = os.path.abspath(argv[0])
    caption = argv[1] if len(argv) > 1 else ""
    cfg = doc_cfg()
    if not cfg.get("chat_id"):
        raise SystemExit("Chưa có mã chat: gõ /id cho bot rồi chạy  python3 tools/gui_giao_an.py --chat-id <số>")
    stem = os.path.splitext(os.path.basename(src.rstrip("/")))[0]
    tmp = tempfile.mkdtemp(prefix="gui_ga_")
    try:
        low = src.lower()
        if low.endswith(".zip"):
            zpath = src
        elif low.endswith(".docx"):
            zpath = nen(thu_muc(word_sang_tex(src, tmp, stem)), os.path.join(tmp, stem + ".zip"))
        elif low.endswith(".tex"):
            zpath = nen(tex_va_hinh(src), os.path.join(tmp, stem + ".zip"))
        elif os.path.isdir(src):
            files = thu_muc(src)
            if not any(k.endswith(".tex") for k in files):
                raise SystemExit("Thư mục không có file .tex")
            zpath = nen(files, os.path.join(tmp, stem + ".zip"))
        else:
            raise SystemExit("Chỉ nhận .docx, .tex, .zip hoặc thư mục bài.")
        if os.path.getsize(zpath) > 20 * 1024 * 1024:
            raise SystemExit("File quá 20 MB.")
        gui(zpath, stem + ".zip", caption, cfg)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1:])
