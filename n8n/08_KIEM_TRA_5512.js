const tex = $input.first().json.giao_an_tex || "";
const meta = $('04_LAY_YCCD').first().json;

// ===== 1. Lấy phần thân (GIỮ NGUYÊN văn bản gốc để node 11 tìm lại đúng chỗ) =====
let body = tex.normalize("NFC");
const b0 = body.indexOf("\\begin{document}");
const b1 = body.lastIndexOf("\\end{document}");
if (b0 >= 0) body = body.slice(b0 + 16, b1 > b0 ? b1 : undefined);

// ===== 2. Hàm bỏ lệnh LaTeX để lấy chữ (bỏ comment ở đây) =====
function plain(s) {
  return s
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}/g, "")
    .replace(/\\fontsize\{[^}]*\}\{[^}]*\}\\selectfont/g, "")
    .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, "\n")
    .replace(/\\(sub)*section\*?/g, "\n")
    .replace(/\\par\b/g, "\n")
    .replace(/\\item\b/g, "\n- ")
    .replace(/\\(textbf|textit|uline|emph|raggedright|centering|noindent|tabularnewline|hline|mbox|tab)\b/g, " ")
    .replace(/\\\\/g, "\n")
    .replace(/[{}~]/g, " ")
    .replace(/[ \t]+/g, " ")
    .normalize("NFC");
}

const rawLines = body.split("\n");
const plainLines = rawLines.map(l => plain(l).replace(/\s*\n\s*/g, " ").trim());

// ===== 3. Tìm các tiêu đề chính =====
const RX = {
  muc_tieu:      /^I\.\s*MỤC TIÊU/iu,
  thiet_bi:      /^II\.\s*THIẾT BỊ/iu,
  tien_trinh:    /^III\.\s*TIẾN TRÌNH/iu,
  hd_mo_dau:     /^\d\.\s*(HOẠT ĐỘNG\s*)?(KHỞI ĐỘNG|MỞ ĐẦU|XÁC ĐỊNH VẤN ĐỀ)/iu,
  hd_hinh_thanh: /^\d\.\s*(HOẠT ĐỘNG\s*)?HÌNH THÀNH KIẾN THỨC/iu,
  hd_luyen_tap:  /^\d\.\s*(HOẠT ĐỘNG\s*)?LUYỆN TẬP/iu,
  hd_van_dung:   /^\d\.\s*(HOẠT ĐỘNG\s*)?(VẬN DỤNG|TÌM TÒI|MỞ RỘNG)/iu
};
const TEN = {
  muc_tieu: "I. Mục tiêu", thiet_bi: "II. Thiết bị dạy học và học liệu", tien_trinh: "III. Tiến trình dạy học",
  hd_mo_dau: "Hoạt động Mở đầu (Khởi động)", hd_hinh_thanh: "Hoạt động Hình thành kiến thức mới",
  hd_luyen_tap: "Hoạt động Luyện tập", hd_van_dung: "Hoạt động Vận dụng"
};

const starts = [];
for (const [k, rx] of Object.entries(RX)) {
  const i = plainLines.findIndex(l => rx.test(l));
  if (i >= 0) starts.push({ k, i });
}
starts.sort((a, b) => a.i - b.i);

const sec = {};
starts.forEach((s, n) => {
  const end = n + 1 < starts.length ? starts[n + 1].i : rawLines.length;
  sec[s.k] = { from: s.i, to: end,
    tex: rawLines.slice(s.i, end).join("\n"),
    text: plainLines.slice(s.i, end).filter(Boolean).join("\n") };
});

const van_de = [];
for (const k of Object.keys(RX)) {
  if (!sec[k]) van_de.push(`Thiếu mục: ${TEN[k]}`);
}

// ===== 4. Kiểm tra từng hoạt động theo 5512 =====
const NLS_RX = /\b[1-6]\.[1-6]\.(CB|TC|NC|CS)\d[a-z]?/g;

function kiemTraHD(ten, text) {
  const t = text.toLowerCase();
  const thieu = [];
  if (!/a\)\s*mục tiêu/.test(t)) thieu.push("a) Mục tiêu");
  if (!/b\)\s*nội dung/.test(t)) thieu.push("b) Nội dung");
  if (!/c\)\s*sản phẩm/.test(t)) thieu.push("c) Sản phẩm");
  if (!/d\)\s*tổ chức thực hiện/.test(t)) thieu.push("d) Tổ chức thực hiện");
  if (!/chuyển giao/.test(t)) thieu.push("Bước 1: Chuyển giao nhiệm vụ");
  if (!/thực hiện nhiệm vụ/.test(t)) thieu.push("Bước 2: Thực hiện nhiệm vụ");
  if (!/báo cáo/.test(t)) thieu.push("Bước 3: Báo cáo, thảo luận");
  if (!/kết luận|nhận định/.test(t)) thieu.push("Bước 4: Kết luận, nhận định");
  const nls = [...new Set(text.match(NLS_RX) || [])];
  if (thieu.length) van_de.push(`${ten}: thiếu ${thieu.join("; ")}`);
  return { ten, thieu, nls };
}

const hoat_dong = [];
if (sec.hd_mo_dau) hoat_dong.push({ key: "hd_mo_dau", ...kiemTraHD(TEN.hd_mo_dau, sec.hd_mo_dau.text) });

// Các hoạt động con trong Hình thành kiến thức ("Hoạt động 1: ...")
if (sec.hd_hinh_thanh) {
  const { from, to } = sec.hd_hinh_thanh;
  const subs = [];
  for (let i = from; i < to; i++) {
    const m = plainLines[i].match(/^Hoạt động\s*(\d+)\s*[:.]\s*(.*)$/iu);
    if (m) subs.push({ i, so: m[1], ten: m[2].trim() });
  }
  if (!subs.length) {
    hoat_dong.push({ key: "hd_hinh_thanh", ...kiemTraHD(TEN.hd_hinh_thanh, sec.hd_hinh_thanh.text) });
  }
  subs.forEach((s, n) => {
    const end = n + 1 < subs.length ? subs[n + 1].i : to;
    const key = `hd_hinh_thanh_${s.so}`;
    sec[key] = { from: s.i, to: end,
      tex: rawLines.slice(s.i, end).join("\n"),
      text: plainLines.slice(s.i, end).filter(Boolean).join("\n") };
    hoat_dong.push({ key, ...kiemTraHD(`Hình thành kiến thức - HĐ${s.so}: ${s.ten}`, sec[key].text) });
  });
}
if (sec.hd_luyen_tap) hoat_dong.push({ key: "hd_luyen_tap", ...kiemTraHD(TEN.hd_luyen_tap, sec.hd_luyen_tap.text) });
if (sec.hd_van_dung) hoat_dong.push({ key: "hd_van_dung", ...kiemTraHD(TEN.hd_van_dung, sec.hd_van_dung.text) });

// ===== 5. Kiểm tra phần Mục tiêu =====
const mt = sec.muc_tieu ? sec.muc_tieu.text.toLowerCase() : "";
const muc_tieu = {
  kien_thuc: /kiến thức/.test(mt),
  nang_luc_chung: /năng lực chung/.test(mt),
  nang_luc_dac_thu: /năng lực đặc thù|năng lực riêng|năng lực toán học/.test(mt),
  nang_luc_so: /năng lực số/.test(mt),
  pham_chat: /phẩm chất/.test(mt)
};
if (sec.muc_tieu) {
  if (!muc_tieu.kien_thuc) van_de.push("Mục tiêu: thiếu phần Kiến thức");
  if (!muc_tieu.nang_luc_chung) van_de.push("Mục tiêu: thiếu Năng lực chung");
  if (!muc_tieu.nang_luc_dac_thu) van_de.push("Mục tiêu: thiếu Năng lực đặc thù (năng lực toán học)");
  if (!muc_tieu.nang_luc_so) van_de.push("Mục tiêu: thiếu Năng lực số");
  if (!muc_tieu.pham_chat) van_de.push("Mục tiêu: thiếu Phẩm chất");
  if (/năng lực riêng/.test(mt)) van_de.push("Mục tiêu: nên ghi \"Năng lực đặc thù\" thay cho \"Năng lực riêng\" (đúng thuật ngữ CT 2018)");
}

// ===== 6. Đối chiếu YCCĐ với mục tiêu Kiến thức =====
const STOP = new Set(["được","các","của","và","với","cho","trong","những","một","hs","học","sinh",
  "biết","hiểu","nhận","xác","định","vận","dụng","thực","hiện","sử","đã","là","có","khi","để"]);
const norm = s => String(s || "").normalize("NFC").toLowerCase()
  .replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
const tok = s => new Set(norm(s).split(" ").filter(w => w.length > 1 && !STOP.has(w)));

let ktItems = [];
if (sec.muc_tieu) {
  const L = sec.muc_tieu.text.split("\n");
  const a = L.findIndex(l => /^1\.\s*kiến thức/i.test(l));
  const b = L.findIndex(l => /^2\.\s*năng lực/i.test(l));
  if (a >= 0) ktItems = L.slice(a + 1, b > a ? b : undefined).filter(l => l.startsWith("-"));
}
const ktTok = ktItems.map(tok);
const yccd_doi_chieu = (meta.yccd || []).map(y => {
  const Y = tok(y.content);
  let best = 0;
  for (const K of ktTok) {
    let c = 0; for (const w of Y) if (K.has(w)) c++;
    best = Math.max(best, Y.size ? c / Y.size : 0);
  }
  return { id: y.id, MucDo: y.MucDo, content: y.content, do_khop: Math.round(best * 100) / 100 };
});
const yccd_chua_phu = yccd_doi_chieu.filter(y => y.do_khop < 0.5);
if (yccd_chua_phu.length) {
  van_de.push(`Mục tiêu Kiến thức chưa thể hiện rõ ${yccd_chua_phu.length}/${yccd_doi_chieu.length} YCCĐ:\n` +
    yccd_chua_phu.map(y => `   • [${y.MucDo}] ${y.content}`).join("\n"));
}

// ===== 7. Số tiết: giáo án so với PPCT =====
const mTiet = plainLines.join(" ").match(/\(\s*(\d+)\s*tiết\s*\)/i);
const so_tiet_giao_an = mTiet ? +mTiet[1] : null;
const so_tiet_ppct = meta.lesson?.so_tiet ?? null;
if (so_tiet_giao_an && so_tiet_ppct && so_tiet_giao_an !== so_tiet_ppct) {
  van_de.push(`Số tiết: giáo án ghi ${so_tiet_giao_an} tiết, PPCT là ${so_tiet_ppct} tiết`);
}

// ===== 8. Năng lực số đã dùng =====
const nls_muc_tieu = [...new Set((sec.muc_tieu?.text || "").match(NLS_RX) || [])];
const nls_hoat_dong = [...new Set(hoat_dong.flatMap(h => h.nls))];
const nls_chua_dung = nls_muc_tieu.filter(c => !nls_hoat_dong.includes(c));
if (nls_chua_dung.length) van_de.push(`Năng lực số nêu ở Mục tiêu nhưng chưa có trong hoạt động nào: ${nls_chua_dung.join(", ")}`);
const nls_ngoai_muc_tieu = nls_hoat_dong.filter(c => !nls_muc_tieu.includes(c));
if (nls_ngoai_muc_tieu.length) van_de.push(`Năng lực số dùng trong hoạt động nhưng chưa nêu ở Mục tiêu: ${nls_ngoai_muc_tieu.join(", ")}`);

// ===== 9. Lỗi chuyển đổi: chữ "Bước ..." lọt vào trong câu hỏi \begin{ex} =====
const exBlocks = body.match(/\\begin\{ex\}[\s\S]*?\\end\{ex\}/g) || [];
const exLoi = exBlocks.filter(b => /Bước\s*\d/.test(b)).length;
if (exLoi) van_de.push(`Có ${exLoi} câu trắc nghiệm (\\begin{ex}) bị lẫn các dòng "Bước ..." của tiến trình – có thể do lỗi chuyển Word → TeX`);

// ===== 10. Báo cáo ngắn gửi Telegram (Parse Mode: HTML) =====
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const L = meta.lesson || {};
const bao_cao = [
  `<b>📘 Bài ${esc(L.bai_so)}. ${esc(L.bai)} – Toán ${esc(meta.request?.grade)}</b>`,
  `PPCT: ${so_tiet_ppct ?? "?"} tiết, tuần ${esc(L.tuan ?? "?")}`,
  `Số hoạt động tìm thấy: ${hoat_dong.length}`,
  van_de.length
    ? `\n<b>⚠️ Cần sửa (${van_de.length}):</b>\n` + van_de.map((v, i) => `${i + 1}. ${esc(v)}`).join("\n")
    : "\n✅ Giáo án đủ cấu trúc theo CV 5512."
].join("\n");

// Bỏ trường "text" khỏi sec để output gọn; giữ "tex" để node sau sửa đúng chỗ
const sections_tex = Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, v.tex]));

return [{
  json: {
    chat_id: meta.chat_id,
    message_id: meta.message_id,
    request: meta.request,
    lesson: meta.lesson,
    yccd: meta.yccd,
    kiem_tra: { muc_tieu, hoat_dong, so_tiet_giao_an, so_tiet_ppct,
                nls_muc_tieu, nls_hoat_dong, yccd_doi_chieu },
    van_de,
    so_van_de: van_de.length,
    bao_cao,
    sections_tex
  }
}];
