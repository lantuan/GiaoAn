// 04_LAY_YCCD – Tìm bài trong PPCT 2026–2027 (repo GiaoAn) + YCCĐ (repo NganHangDe)
// - Có số bài ("bài 12")  → YCCĐ theo chương trình + dòng PPCT của bài đó
// - Không có số bài       → tìm theo TÊN trong PPCT (chuyên đề học tập, chuyên đề nâng cao…)
const d = $input.first().json;
const req = d.request;
const helpers = this.helpers;
const NHD = "https://raw.githubusercontent.com/lantuan/NganHangDe/main/data";
const GA = "https://raw.githubusercontent.com/lantuan/GiaoAn/main/data";
const cache = $getWorkflowStaticData("global");

const fail = msg => [{ json: { ...d, ok: false, error_message: msg } }];
const norm = s => String(s || "").normalize("NFC").toLowerCase()
  .replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// ----- Tải dữ liệu (lưu đệm) -----
async function taiYCCD(g) {
  const key = "yccd_toan" + g;
  if (!cache[key]) {
    let all = [];
    for (let c = 1; c <= 12; c++) {
      try { all = all.concat(await helpers.httpRequest({ url: `${NHD}/curriculum/toan${g}/L${g}_C${c}.json`, json: true })); }
      catch (e) {}
    }
    cache[key] = all.map(x => ({ id: x.id, bai_so: String(x.bai_so), bai: x.bai, chuong: x.chuong, MucDo: x.MucDo, content: x.content, scope: x.scope }));
  }
  return cache[key];
}
async function taiPPCT(g) {   // bản chuyên = đầy đủ nhất (lớp thường = bỏ dòng chuyen_sau)
  const key = "ppct26_toan" + g;
  if (!cache[key]) {
    try { cache[key] = await helpers.httpRequest({ url: `${GA}/ppct_2026_2027/toan${g}_chuyen.json`, json: true }); }
    catch (e) { cache[key] = []; }
  }
  return cache[key];
}

// Gom các dòng PPCT cùng một bài → số tiết, NLS, thiết bị
function gomPPCT(rows) {
  const uniq = a => [...new Set(a)];
  const thietBi = {};
  rows.forEach(r => (r.thiet_bi || []).forEach(t => { thietBi[t.ma] = t; }));
  return {
    loai: rows[0]?.loai || null,
    hoc_ky: rows[0]?.hoc_ky ?? null,
    tiet: rows.map(r => r.tiet).join(", "),
    so_tiet: rows.reduce((n, r) => n + (r.so_tiet || 0), 0) || null,
    nls: uniq(rows.flatMap(r => r.nls || [])),
    thiet_bi: Object.values(thietBi),
    yccd_ppct: uniq(rows.flatMap(r => String(r.yccd || "").split(/\n+/))
      .map(s => s.replace(/^[\s\-–•+]+/, "").trim()).filter(s => s.length > 3)),
    ghi_chu: uniq(rows.map(r => r.ghi_chu).filter(Boolean))
  };
}

// ===== Hướng dẫn sử dụng: /start, "hướng dẫn", hoặc nhắn tin mà không gửi file =====
// (đi theo nhánh "ok = false" → node Telegram báo lỗi sẵn có, nhắn nội dung error_message)
const HUONG_DAN = `📘 BOT SOẠN & CHỈNH GIÁO ÁN TOÁN THPT (CV 5512)

1️⃣ CHỈNH GIÁO ÁN CÓ SẴN
• Gửi file .tex (xuất từ Word2Tex, bản ex_test).
• Giáo án có hình: nén cả thư mục bài thành .zip rồi gửi – bot trả lại .zip đủ hình.
• Ghi kèm chú thích: lớp và bài, ví dụ: "lớp 10 bài 9".
→ Bot sửa theo CV 5512, bám YCCĐ (CT GDPT 2018), gắn năng lực số (CV 3456), xoá ngày/lớp/tuần để dùng chung, thêm khối Ký duyệt.

2️⃣ SOẠN KHBD MỚI TỪ TÀI LIỆU CHUYÊN ĐỀ
• Gửi .zip tài liệu, chú thích ví dụ: "chuyên đề nâng cao Graph lớp 11".
→ Bot tra PPCT, chia nội dung tài liệu vào từng hoạt động.

3️⃣ HỌC SINH KHUYẾT TẬT (chỉ khi cần)
• Ghi thêm, ví dụ: "lớp có HS khuyết tật tên Nam, khiếm thính" → thêm mục hỗ trợ học hoà nhập.

🤖 VỀ AI
• Bot dùng AI MIỄN PHÍ trong số lượt cho phép mỗi ngày.
• Khi hết lượt miễn phí, bot TỰ CHUYỂN sang AI TRẢ PHÍ để không gián đoạn, và báo số token + số tiền của lần chạy đó.
• Phần AI viết có MÀU XANH – thầy/cô rà soát trước khi dùng.

⚠️ File tối đa 20 MB. Không ghi họ tên thật của học sinh ngoài trường hợp mục 3.
Gõ /start để xem lại hướng dẫn này.`;
const txtGoc = String(req.original_text || "").trim().toLowerCase();
// /id: cho biết mã chat (dán vào máy Mac để gửi giáo án từ OneDrive thẳng vào luồng – node 14)
if (/^\/id\b/.test(txtGoc)) return fail(`Mã chat của bạn: ${d.chat_id}`);
const laHuongDan = /^\/(start|help|huongdan)\b/.test(txtGoc) || /^(hướng dẫn|huong dan|help|hd)\s*[.!?]*$/.test(txtGoc);
// Chủ máy nhắn chữ (không kèm file) → máy Mac tìm giáo án gốc trong OneDrive rồi tự gửi vào luồng (node 14)
const laChu = cache.chu_chat_id && String(d.chat_id) === String(cache.chu_chat_id);
if (laChu && !laHuongDan && d.input_type !== "document" && txtGoc) {
  if (!cache.pdf_url) return fail("Máy Mac chưa mở Máy dịch PDF nên chưa tìm được giáo án trong OneDrive. Bật máy Mac + mở app rồi nhắn lại, hoặc gửi file trực tiếp.");
  try {
    const r = await helpers.httpRequest({ method: "POST", url: cache.pdf_url + "/tim", json: true, timeout: 60000,
      headers: { "X-Bi-Mat": cache.pdf_bi_mat }, body: { chat_id: String(d.chat_id), text: String(req.original_text || "") } });
    return fail(r.tra_loi || "Máy Mac không trả lời.");
  } catch (e) {
    return fail("Không liên lạc được máy Mac (máy tắt hoặc app Máy dịch PDF đang tắt). Mở app rồi đợi khoảng 10 giây, nhắn lại; hoặc gửi file trực tiếp.");
  }
}
if (laHuongDan || (d.input_type && d.input_type !== "document")) {
  return fail((laHuongDan ? "" : "Mình chưa thấy file giáo án đính kèm.\n\n") + HUONG_DAN);
}

const lopThu = req.grade ? [req.grade] : ["10", "11", "12"];

// Chuyên đề (học tập / nâng cao) không nằm trong YCCĐ bài thường → tìm theo tên (nhánh B)
const laChuyenDe = /chuyên đề|chuyên sâu|nâng cao|\bc[đd]\s*\d/.test(norm(`${req.original_text || ""} ${req.file_base || ""}`));

// ===== C. Mã chuyên đề học tập: "CD 2-B4", "CĐ2.B4", "chuyên đề 2 bài 4" → dòng PPCT chuyen_de = "CĐ2.B4" =====
{
  const t = norm(`${req.original_text || ""} ${req.file_base || ""}`);
  const m = t.match(/(?:\bc[đd]|chuyên đề(?: học tập)?)\s*(\d)\s*(?:b|bài)\s*(\d+)/);
  if (m) {
    const ma = `CĐ${m[1]}.B${m[2]}`;
    const hit = [];
    for (const g of lopThu) {
      const rows = (await taiPPCT(g)).filter(r => r.chuyen_de === ma);
      if (rows.length) hit.push({ g, rows });
    }
    if (hit.length === 1) {
      const { g, rows } = hit[0];
      const pp = gomPPCT(rows);
      return [{ json: { ...d, request: { ...req, grade: g }, ok: true, error_message: null,
        lesson: { bai_so: null, bai: rows[0].ten, chuong: null, loai: pp.loai, hoc_ky: pp.hoc_ky,
                  tiet_ppct: pp.tiet, so_tiet: req.duration ? parseInt(req.duration) : pp.so_tiet },
        ppct: pp,
        yccd: pp.yccd_ppct.map((c, i) => ({ id: `PPCT-${i + 1}`, MucDo: "", content: c, scope: "ppct" })) } }];
    }
    if (hit.length > 1) return fail(`${ma} có ở lớp ${hit.map(h => h.g).join(", ")}. Bạn ghi rõ lớp giúp mình.`);
  }
}

// ===== A. Có số bài =====
if (req.lesson_number && !laChuyenDe) {
  let found = [];
  for (const g of lopThu) {
    const rows = (await taiYCCD(g)).filter(x => x.bai_so === String(req.lesson_number));
    if (rows.length) found.push({ g, rows });
  }
  if (found.length > 1 && req.lesson_title) {
    const t = norm(req.lesson_title);
    const hit = found.filter(f => { const b = norm(f.rows[0].bai); return b === t || b.includes(t) || t.includes(b); });
    if (hit.length) found = hit;
  }
  if (!found.length) return fail(`Không tìm thấy YCCĐ của bài ${req.lesson_number}${req.grade ? " lớp " + req.grade : ""} (bộ Kết nối tri thức). Bạn kiểm tra lại giúp mình.`);
  if (found.length > 1) return fail(`Bài ${req.lesson_number} có ở lớp ${found.map(f => f.g).join(", ")}. Bạn ghi rõ lớp giúp mình, ví dụ: lớp 10, bài ${req.lesson_number}`);

  const { g, rows } = found[0];
  const ppRows = (await taiPPCT(g)).filter(r => r.loai === "co_ban" && String(r.bai_so) === String(req.lesson_number));
  const pp = gomPPCT(ppRows);
  return [{ json: { ...d, request: { ...req, grade: g }, ok: true, error_message: null,
    lesson: { bai_so: req.lesson_number, bai: rows[0].bai, chuong: rows[0].chuong, loai: "co_ban",
              hoc_ky: pp.hoc_ky, tiet_ppct: pp.tiet || null,
              so_tiet: req.duration ? parseInt(req.duration) : pp.so_tiet },
    ppct: pp,
    yccd: rows.map(x => ({ id: x.id, MucDo: x.MucDo, content: x.content, scope: x.scope })) } }];
}

// ===== D. Tên bài trong PPCT nằm NGUYÊN VĂN trong chú thích / tên file ("Ôn tập chuyên đề 1", "ON TAP CHUYEN DE 1") =====
{
  const khongDau = x => norm(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const nguon = " " + khongDau(`${req.original_text || ""} ${req.file_base || ""}`) + " ";
  let hit = [];
  for (const g of lopThu) {
    const theoTen = {};
    (await taiPPCT(g)).forEach(r => { (theoTen[r.ten] = theoTen[r.ten] || []).push(r); });
    for (const [ten, rows] of Object.entries(theoTen)) {
      const t = khongDau(ten);
      if (t.split(" ").length >= 3 && nguon.includes(" " + t + " ")) hit.push({ g, ten, rows, dai: t.length });
    }
  }
  if (hit.length) {
    const max = Math.max(...hit.map(h => h.dai));
    hit = hit.filter(h => h.dai === max);
    if (hit.length > 1 && new Set(hit.map(h => h.g)).size > 1) return fail(`"${hit[0].ten}" có ở lớp ${hit.map(h => h.g).join(", ")}. Bạn ghi rõ lớp giúp mình.`);
    const { g, ten, rows } = hit[0];
    const pp = gomPPCT(rows);
    return [{ json: { ...d, request: { ...req, grade: g }, ok: true, error_message: null,
      lesson: { bai_so: rows[0].bai_so ?? null, bai: ten, chuong: null, loai: pp.loai, hoc_ky: pp.hoc_ky,
                tiet_ppct: pp.tiet, so_tiet: req.duration ? parseInt(req.duration) : pp.so_tiet },
      ppct: pp,
      yccd: pp.yccd_ppct.map((c, i) => ({ id: `PPCT-${i + 1}`, MucDo: "", content: c, scope: "ppct" })) } }];
  }
}

// ===== B. Không có số bài → tìm theo tên trong PPCT =====
const BO = new Set(["chuyên","đề","nâng","cao","sâu","bài","giáo","án","lớp","toán","chuyển","cho","soạn","chỉnh",
  "sửa","theo","từ","tài","liệu","kế","hoạch","dạy","học","cơ","bản","equation","extest","và","các","của","một","số","về",
  "tập","giúp","mình","thầy","cô","file","word","tex","zip","lại","làm","cuối","kiểm","tra","ôn","mới","hoàn","thiện","thành"]);
const tuKhoa = [...new Set(norm(`${req.original_text || ""} ${req.file_base || ""}`).split(" ")
  .filter(w => w.length > 1 && !BO.has(w) && !/^\d+$/.test(w)))];
const muonNangCao = /chuyên sâu|nâng cao/.test(norm(req.original_text));
const muonCDHT = /chuyên đề học tập|\bc[đd]\s*\d/.test(norm(`${req.original_text || ""} ${req.file_base || ""}`));

let ung = [];
for (const g of lopThu) {
  const ds = await taiPPCT(g);
  const theoTen = {};
  ds.forEach(r => { (theoTen[r.ten] = theoTen[r.ten] || []).push(r); });
  for (const [ten, rows] of Object.entries(theoTen)) {
    const t = norm(ten);
    let diem = tuKhoa.filter(w => t.split(" ").includes(w)).length;
    if (!diem) continue;
    const loai = rows[0].loai;
    if (muonNangCao) diem += loai === "chuyen_sau" ? 5 : -5;
    if (muonCDHT) diem += loai === "chuyen_de_hoc_tap" ? 5 : -5;
    ung.push({ g, ten, rows, diem });
  }
}
ung.sort((a, b) => b.diem - a.diem);
if (!ung.length || ung[0].diem <= 0) {
  // Gợi ý danh sách chuyên đề nâng cao của lớp để GV ghi lại cho đúng
  let goiY = "";
  if (req.grade) {
    const ds = [...new Set((await taiPPCT(req.grade)).filter(r => r.loai === (muonCDHT ? "chuyen_de_hoc_tap" : "chuyen_sau")).map(r => r.ten))];
    goiY = ds.length ? `\nCác chuyên đề lớp ${req.grade} trong PPCT:\n- ` + ds.join("\n- ") : "";
  }
  return fail(`Mình chưa tìm thấy bài này trong PPCT. Bạn ghi rõ lớp và tên bài/chuyên đề, ví dụ: "lớp 11, chuyên đề nâng cao Graph".${goiY}`);
}
const top = ung.filter(u => u.diem === ung[0].diem);
if (top.length > 1 && new Set(top.map(u => u.ten + u.g)).size > 1) {
  return fail(`Có nhiều bài trùng tên trong PPCT:\n- ${top.slice(0, 6).map(u => `Lớp ${u.g}: ${u.ten}`).join("\n- ")}\nBạn ghi rõ hơn giúp mình (lớp, chuyên đề nâng cao hay chuyên đề học tập).`);
}
const { g, ten, rows } = ung[0];
const pp = gomPPCT(rows);
return [{ json: { ...d, request: { ...req, grade: g }, ok: true, error_message: null,
  lesson: { bai_so: rows[0].bai_so ?? null, bai: ten, chuong: null, loai: pp.loai, hoc_ky: pp.hoc_ky,
            tiet_ppct: pp.tiet, so_tiet: req.duration ? parseInt(req.duration) : pp.so_tiet },
  ppct: pp,
  yccd: pp.yccd_ppct.map((c, i) => ({ id: `PPCT-${i + 1}`, MucDo: "", content: c, scope: "ppct" })) } }];
