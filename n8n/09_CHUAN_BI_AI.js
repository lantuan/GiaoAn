// 09_CHUAN_BI_AI – Gom các lỗi cần AI viết, soạn yêu cầu gửi OpenRouter (gọn nhất có thể)
// Đầu vào: output của 08_KIEM_TRA_5512
const d = $input.first().json;
const helpers = this.helpers;
const cache = $getWorkflowStaticData("global");
const GA = "https://raw.githubusercontent.com/lantuan/GiaoAn/main/data";

// ===== CẤU HÌNH =====
const MODEL_TRA_PHI = "deepseek/deepseek-v4-flash";   // dùng khi model miễn phí lỗi/hết lượt
const MODEL_MIEN_PHI_UU_TIEN = [                       // ưu tiên theo thứ tự, chỉ dùng cái đang có
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free"
];

// ===== 1. Tải bảng mã NLS (lưu đệm) =====
if (!cache.nls_nc1) {
  cache.nls_nc1 = (await helpers.httpRequest({ url: `${GA}/nang_luc_so/nls_nc1.json`, json: true })).chi_bao;
}
const NLS = cache.nls_nc1;

// ===== 2. Chọn model miễn phí đang hoạt động (kiểm tra lại mỗi ngày) =====
const homNay = new Date().toISOString().slice(0, 10);
if (cache.free_day !== homNay) {
  try {
    const r = await helpers.httpRequest({ url: "https://openrouter.ai/api/v1/models", json: true });
    const coSan = new Set(r.data.map(m => m.id));
    cache.free_models = MODEL_MIEN_PHI_UU_TIEN.filter(m => coSan.has(m));
    cache.free_day = homNay;
  } catch (e) { cache.free_models = cache.free_models || []; }
}
const models = [...(cache.free_models || []).slice(0, 2), MODEL_TRA_PHI];

// ===== 3. Gom việc cho AI =====
const kt = d.kiem_tra || {};
const plain = s => String(s || "")
  .replace(/\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}/g, "")
  .replace(/\\fontsize\{[^}]*\}\{[^}]*\}\\selectfont/g, "")
  .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, " ")
  .replace(/\\(par|item|textbf|textit|uline|raggedright|centering|noindent|tabularnewline|hline|mbox|tab|includegraphics)\b(\[[^\]]*\])?/g, " ")
  .replace(/[{}~&]/g, " ").replace(/\s+/g, " ").trim();
const rutGon = (s, n) => { const t = plain(s); return t.length > n ? t.slice(0, n) + "…" : t; };

const viec = {};

// 3a. YCCĐ chưa thể hiện trong Mục tiêu Kiến thức
const yccdThieu = [...new Set((kt.yccd_doi_chieu || []).filter(y => y.do_khop < 0.5).map(y => y.content))];
if (yccdThieu.length) viec.yccd_thieu = yccdThieu;

// 3b. Hoạt động thiếu phần (a–d, Bước 1–4)
const bs = (kt.hoat_dong || []).filter(h => h.thieu.length).map(h => ({
  key: h.key, ten: h.ten, thieu: h.thieu, noi_dung_hien_co: rutGon(d.sections_tex?.[h.key], 900)
}));
if (bs.length) viec.bo_sung_hoat_dong = bs;

// 3c. Thiếu hẳn hoạt động
const coKey = new Set((kt.hoat_dong || []).map(h => h.key.replace(/_\d+$/, "")));
const thieuHD = [["hd_mo_dau", "Mở đầu"], ["hd_hinh_thanh", "Hình thành kiến thức mới"],
                 ["hd_luyen_tap", "Luyện tập"], ["hd_van_dung", "Vận dụng"]]
  .filter(([k]) => !coKey.has(k)).map(([key, ten]) => ({ key, ten }));
if (thieuHD.length) viec.hoat_dong_moi = thieuHD;

// 3d. Mã NLS ở Mục tiêu nhưng chưa có hoạt động nào thực hiện
const nlsChuaDung = (kt.nls_muc_tieu || []).filter(c => !(kt.nls_hoat_dong || []).includes(c) && NLS[c]);
if (nlsChuaDung.length) {
  viec.nls_can_gan = nlsChuaDung.map(c => ({ ma: c, mo_ta: NLS[c] }));
  viec.cac_hoat_dong = [...(kt.hoat_dong || []).map(h => h.key), ...thieuHD.map(h => h.key)];
}

// 3e. Cá nhân hoá cho HS khuyết tật – CHỈ khi GV yêu cầu (tên thật đã được thay bằng "HS A")
const hskt = d.request?.hs_khuyet_tat;
if (hskt?.mo_ta) viec.ca_nhan_hoa = { yeu_cau_cua_gv: hskt.mo_ta, cac_hoat_dong: (kt.hoat_dong || []).map(h => h.ten || h.key) };

// ===== 3f. File là TÀI LIỆU chuyên đề → soạn KHBD mới (thay toàn bộ việc ở trên) =====
const soanMoi = !!d.la_tai_lieu;
let pp = {};
try { pp = $('04_LAY_YCCD').first().json.ppct || {}; } catch (e) {}
const nlsSoan = (pp.nls || []).filter(c => NLS[c]);
if (soanMoi) {
  for (const k of Object.keys(viec)) delete viec[k];
  viec.soan_khbd_tu_tai_lieu = {
    so_tiet: d.lesson?.so_tiet || null,
    dan_y_tai_lieu: d.dan_y,
    nls_duoc_dung: nlsSoan.map(c => ({ ma: c, mo_ta: NLS[c] })),
    hs_khuyet_tat: hskt?.mo_ta || null
  };
}

const can_ai = Object.keys(viec).length > 0;

// ===== 4. Soạn yêu cầu gửi AI =====
const SYSTEM = `Bạn là chuyên gia soạn kế hoạch bài dạy (KHBD) môn Toán THPT theo Công văn 5512/BGDĐT-GDTrH và Chương trình GDPT 2018.
Nhiệm vụ: CHỈ viết các phần còn thiếu được liệt kê trong "viec". Không viết lại phần đã có.
Quy tắc:
- Viết tiếng Việt, văn phong giáo án, ngắn gọn, đúng nội dung bài.
- Nội dung trả về là mã LaTeX dùng được ngay: công thức đặt trong $...$; không dùng \\section, không dùng gói lạ; xuống dòng bằng dòng trống.
- Mỗi hoạt động mới gồm đủ: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện với Bước 1: Chuyển giao nhiệm vụ; Bước 2: Thực hiện nhiệm vụ; Bước 3: Báo cáo, thảo luận; Bước 4: Kết luận, nhận định.
- Hoạt động Vận dụng phải gắn với tình huống thực tiễn và bám YCCĐ.
- "nls_can_gan": mỗi mã chọn MỘT hoạt động phù hợp trong "cac_hoat_dong" (key), viết 1 câu mô tả việc HS làm để đạt mã đó, dạng "mã: mô tả". Không dùng mã nào khác.
- "ca_nhan_hoa" (nếu có): viết kế hoạch hỗ trợ HS khuyết tật học hoà nhập (TT 03/2018/TT-BGDĐT) đúng tình trạng GV mô tả, gọi HS là "HS A": mục tiêu điều chỉnh; chỗ ngồi, thiết bị, phương tiện hỗ trợ; điều chỉnh nhiệm vụ trong từng hoạt động; cách đánh giá phù hợp. Không bịa thêm tình trạng.
- Chỉ trả về MỘT đối tượng JSON, không giải thích, không markdown, đúng khuôn:
{"them_muc_tieu_kien_thuc":["..."],"bo_sung_hoat_dong":[{"key":"...","tex":"..."}],"hoat_dong_moi":[{"key":"...","tex":"..."}],"nls_trong_hoat_dong":[{"key":"...","ma":"...","tex":"..."}],"ca_nhan_hoa":"..."}
Mảng nào không có việc thì để [], "ca_nhan_hoa" không có việc thì để "".`;

const SYSTEM_SOAN = `Bạn là giáo viên chuyên Toán giỏi, soạn kế hoạch bài dạy (KHBD) theo Công văn 5512/BGDĐT-GDTrH cho lớp chuyên.
Đầu vào: dàn ý một tài liệu chuyên đề (các phần, ví dụ, bài tập đánh số 1..n). Tài liệu gốc sẽ được in nguyên văn ở PHỤ LỤC, nên khi cần chỉ ghi "Ví dụ ... phần ...", "Bài tập k (Phụ lục)", KHÔNG chép lại đề.
Yêu cầu:
- Chia ${d.lesson?.so_tiet || "các"} tiết hợp lý theo các phần của tài liệu ("phan_bo").
- Hoạt động: hd_mo_dau (1 cái); hd_hinh_thanh_1, hd_hinh_thanh_2… (mỗi phần lớn của tài liệu 1 hoạt động); hd_luyen_tap (chọn bài tập theo mức tăng dần); hd_van_dung (bài khó/thi HSG, dự án nhỏ hoặc tìm hiểu thêm có dùng công cụ số).
- Mỗi hoạt động đủ: a) Mục tiêu; b) Nội dung; c) Sản phẩm; d) Tổ chức thực hiện gồm Bước 1: Chuyển giao nhiệm vụ; Bước 2: Thực hiện nhiệm vụ; Bước 3: Báo cáo, thảo luận; Bước 4: Kết luận, nhận định. Ghi rõ tiết ở trường "tiet".
- "muc_tieu_kien_thuc": 4–8 ý, bám YCCĐ trong PPCT và nội dung tài liệu.
- "nls_trong_hoat_dong": mỗi mã trong "nls_duoc_dung" gắn vào ĐÚNG MỘT hoạt động phù hợp, 1 câu mô tả việc HS làm. Không dùng mã khác.
- Nếu có "hs_khuyet_tat": thêm "ca_nhan_hoa" (gọi là "HS A"), không thì để "".
- Mã LaTeX dùng được ngay: công thức trong $...$, in đậm \\textbf{...}, xuống dòng bằng dòng trống; không dùng \\section, không dùng gói lạ.
- Chỉ trả về MỘT đối tượng JSON, không giải thích, không markdown:
{"muc_tieu_kien_thuc":["..."],"phan_bo":[{"tiet":"1-2","noi_dung":"..."}],"hoat_dong":[{"key":"hd_mo_dau","ten":"...","tiet":"1","tex":"..."}],"nls_trong_hoat_dong":[{"key":"...","ma":"...","tex":"..."}],"ca_nhan_hoa":""}`;

const L = d.lesson || {};
const user = {
  bai: L.bai_so ? `Toán ${d.request?.grade} – Bài ${L.bai_so}. ${L.bai} (${L.so_tiet ?? "?"} tiết, bộ Kết nối tri thức)`
                : `Toán ${d.request?.grade} – ${L.bai} (${L.so_tiet ?? "?"} tiết)`,
  yccd_cua_bai: (d.yccd || []).map(y => y.content),
  viec
};

const ai_body = {
  models,                               // OpenRouter tự chuyển model sau nếu model trước lỗi/hết lượt
  temperature: 0.3,
  max_tokens: soanMoi ? 9000 : (hskt?.mo_ta ? 4000 : 3000),
  messages: [
    { role: "system", content: soanMoi ? SYSTEM_SOAN : SYSTEM },
    { role: "user", content: JSON.stringify(user) }
  ]
};

return [{ json: { ...d, can_ai, viec, ai_body, nls_map: NLS, soan_moi: soanMoi, ppct: pp } }];
