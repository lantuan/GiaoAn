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
// Năng lực AI – YCCĐ lớp 10–12 của QĐ 2422/QĐ-BGDĐT (lồng ghép, không tăng YCCĐ môn Toán)
if (!Array.isArray(cache.ai2422) || !cache.ai2422.length) {   // lần trước tải lỗi (lưu []) thì tải lại
  try { cache.ai2422 = await helpers.httpRequest({ url: `${GA}/nang_luc_ai/qd2422_yccd_10_12.json`, json: true }); }
  catch (e) { cache.ai2422 = []; }
}
const lopAI = String(d.request?.grade || "");
if (!Array.isArray(cache.ai2422)) cache.ai2422 = [];
const AI_DS = cache.ai2422.filter(x => x.lop === lopAI);
const AI_MAP = Object.fromEntries(AI_DS.map(x => [x.ma, x.yccd]));

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
// CHỈ BÁO (không giao AI viết lại): GV yêu cầu giữ đúng nội dung giáo án gốc, chỉ bổ sung NLS, năng lực AI, thiết bị
const yccdThieu = [...new Set((kt.yccd_doi_chieu || []).filter(y => y.do_khop < 0.5).map(y => y.content))];

// 3b. Hoạt động thiếu phần (a–d, Bước 1–4)
const bs = (kt.hoat_dong || []).filter(h => h.thieu.length).map(h => ({
  key: h.key, ten: h.ten, thieu: h.thieu, noi_dung_hien_co: rutGon(d.sections_tex?.[h.key], 900)
}));
// (chỉ báo trong caption, không giao AI viết thêm vào hoạt động đã có)

// 3c. Thiếu hẳn hoạt động
const coKey = new Set((kt.hoat_dong || []).map(h => h.key.replace(/_\d+$/, "")));
const thieuHD = [["hd_mo_dau", "Mở đầu"], ["hd_hinh_thanh", "Hình thành kiến thức mới"],
                 ["hd_luyen_tap", "Luyện tập"], ["hd_van_dung", "Vận dụng"]]
  .filter(([k]) => !coKey.has(k))
  // tiết ôn tập / luyện tập / bài tập / kiểm tra: không có "Hình thành kiến thức mới"
  .filter(([k]) => !(k === "hd_hinh_thanh" && /ôn tập|luyện tập|bài tập|kiểm tra/i.test(String(d.lesson?.bai || ""))))
  .map(([key, ten]) => ({ key, ten }));
if (thieuHD.length) viec.hoat_dong_moi = thieuHD;

// 3d. Mã NLS ở Mục tiêu nhưng chưa có hoạt động nào thực hiện
const nlsChuaDung = [...new Set([...(kt.nls_muc_tieu || []).filter(c => !(kt.nls_hoat_dong || []).includes(c)),
  ...(kt.nls_ppct_thieu || [])])].filter(c => NLS[c]);      // + mã NLS PPCT ghi cho bài mà giáo án chưa có
if (nlsChuaDung.length) {
  viec.nls_can_gan = nlsChuaDung.map(c => ({ ma: c, mo_ta: NLS[c] }));
  viec.cac_hoat_dong = [...(kt.hoat_dong || []).map(h => h.key), ...thieuHD.map(h => h.key)];
}

// 3d'. Năng lực AI (QĐ 2422): giáo án chưa có mã nào → AI chọn 1–2 YCCĐ hợp nội dung bài, gắn vào hoạt động
if (!(kt.nang_luc_ai || []).length && AI_DS.length) {
  viec.nang_luc_ai = { chon_tu: AI_DS.map(x => ({ ma: x.ma, yccd: x.yccd })),
    cac_hoat_dong: [...(kt.hoat_dong || []).map(h => h.key), ...thieuHD.map(h => h.key)] };
}

// 3e. Cá nhân hoá cho HS khuyết tật – CHỈ khi GV yêu cầu (tên thật đã được thay bằng "HS A")
// HS khuyết tật: theo chú thích GV; nếu không có thì lấy từ phần hoà nhập GV đã viết sẵn trong giáo án (node 08)
const hskt = d.request?.hs_khuyet_tat || (d.hoa_nhap?.co ? { ten: d.hoa_nhap.ten, mo_ta: d.hoa_nhap.mo_ta } : null);
// không gửi tên thật cho AI: thay họ tên và tên gọi bằng "HS A"
const anTen = t => {
  let x = String(t || "");
  const ten = hskt?.ten;
  if (!ten) return x;
  for (const p of [ten, ten.toUpperCase()]) x = x.split(p).join("HS A");
  const goi = ten.split(" ").pop();                       // tên gọi: chỉ thay khi đi sau em/bạn/HS (tránh "Như vậy")
  return x.replace(new RegExp(`(^|[^\\p{L}])(em|bạn|HS|học sinh|Em|Bạn)\\s+(${goi}|${goi.toUpperCase()})(?![\\p{L}])`, "gu"), "$1HS A");
};
// Gửi kèm những việc HS phải làm trong từng hoạt động (lên bảng, nhóm, trò chơi…) để AI điều chỉnh đúng chỗ
const VIEC_RX = /lên bảng|nhóm|thảo luận|trò chơi|thi đua|di chuyển|đứng|chạy|đổi chỗ|ra ngoài|thực hành|đo đạc|quan sát|nghe|video|clip|trình bày|báo cáo|giơ tay|điện thoại|máy tính|quizizz|kahoot|azota|phiếu|bảng phụ|bảng con|mô hình|vẽ|gấp|cắt|ghép|đọc/i;
const viecHS = key => [...new Set(plain(d.sections_tex?.[key] || "").split(/\s+[-–+•]\s+|(?<=[.;:!?])\s+/)
  .map(x => x.trim()).filter(x => x.length > 12 && VIEC_RX.test(x)).map(x => x.length > 130 ? x.slice(0, 130) + "…" : x))].slice(0, 5);
if (hskt?.mo_ta) viec.ca_nhan_hoa = {
  yeu_cau_cua_gv: anTen(hskt.mo_ta),
  hien_co_trong_giao_an: d.hoa_nhap?.hien_co ? anTen(d.hoa_nhap.hien_co) : undefined,
  cac_hoat_dong: (kt.hoat_dong || []).map(h => ({ key: h.key, ten: h.ten || h.key, viec_hs: viecHS(h.key) }))
};

// ===== 3f. File là TÀI LIỆU chuyên đề → soạn KHBD mới (thay toàn bộ việc ở trên) =====
const soanMoi = !!d.la_tai_lieu;
let pp = {};
try { pp = $('04_LAY_YCCD').first().json.ppct || {}; } catch (e) {}
const nlsSoan = (pp.nls || []).filter(c => NLS[c]);
if (soanMoi) {
  for (const k of Object.keys(viec)) delete viec[k];
  const dy = d.dan_y || {};
  viec.soan_khbd_tu_tai_lieu = {
    so_tiet: d.lesson?.so_tiet || null,
    ten_tai_lieu: dy.tieu_de || null,
    cac_phan: dy.muc || [],          // M0, M1… = lý thuyết + ví dụ của từng phần
    bai_tap: dy.bai_tap || [],        // BT1, BT2… = bài tập (có lời giải)
    nls_duoc_dung: nlsSoan.map(c => ({ ma: c, mo_ta: NLS[c] })),
    nang_luc_ai_chon_tu: AI_DS.map(x => ({ ma: x.ma, yccd: x.yccd })),
    hs_khuyet_tat: hskt?.mo_ta || null
  };
}

const can_ai = Object.keys(viec).length > 0;
// Giáo án đã đạt mọi yêu cầu (CV 5512, YCCĐ, mã NLS theo PPCT, năng lực AI) và đủ thiết bị → giữ nguyên, chỉ xuất lại
const giu_nguyen = !can_ai && !soanMoi && !(kt.tb_thieu || []).length;

// ===== 4. Soạn yêu cầu gửi AI =====
const SYSTEM = `Bạn là chuyên gia soạn kế hoạch bài dạy (KHBD) môn Toán THPT theo Công văn 5512/BGDĐT-GDTrH và Chương trình GDPT 2018.
Nhiệm vụ: CHỈ viết các phần còn thiếu được liệt kê trong "viec". Không viết lại phần đã có.
Quy tắc:
- Viết tiếng Việt, văn phong giáo án, ngắn gọn, đúng nội dung bài.
- Nội dung trả về là mã LaTeX dùng được ngay: công thức đặt trong $...$; không dùng \\section, không dùng gói lạ; xuống dòng bằng dòng trống.
- Mỗi hoạt động mới gồm đủ: a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện với Bước 1: Chuyển giao nhiệm vụ; Bước 2: Thực hiện nhiệm vụ; Bước 3: Báo cáo, thảo luận; Bước 4: Kết luận, nhận định.
- Hoạt động Vận dụng phải gắn với tình huống thực tiễn và bám YCCĐ.
- "nls_can_gan": mỗi mã chọn MỘT hoạt động phù hợp trong "cac_hoat_dong" (key), viết 1 câu mô tả việc HS làm để đạt mã đó, dạng "mã: mô tả". Không dùng mã nào khác.
- "nang_luc_ai" (nếu có việc này): chọn 1–2 mã trong "chon_tu" HỢP NỘI DUNG BÀI (ưu tiên mã không có .MR), mỗi mã gắn vào MỘT hoạt động trong "cac_hoat_dong", "tex" là 1–2 câu mô tả CỤ THỂ việc HS làm với công cụ AI trong hoạt động đó (vd. dùng chatbot kiểm tra lời giải rồi tự đối chiếu, chỉ ra chỗ AI sai; khai báo việc dùng AI). Không làm tăng yêu cầu của môn Toán. Không dùng mã ngoài "chon_tu".
- "ca_nhan_hoa" (nếu có): kế hoạch hỗ trợ HS khuyết tật học hoà nhập theo TT 03/2018/TT-BGDĐT (kế hoạch giáo dục cá nhân) và đánh giá theo Điều 11 TT 22/2021/TT-BGDĐT, ĐÚNG tình trạng GV mô tả, gọi HS là "HS A", không bịa thêm tình trạng. Khuyết tật không ảnh hưởng nhận thức (vận động, khiếm thị, khiếm thính…) thì GIỮ NGUYÊN yêu cầu cần đạt, chỉ điều chỉnh cách tham gia; không tách HS khỏi lớp, không gây chú ý, kỳ thị.
  "muc_tieu_hoa_nhap": 2–4 ý cho mục I.4 (kiến thức, năng lực theo ĐÚNG bài này; tâm lí, kĩ năng xã hội; ý riêng theo dạng khuyết tật, vd. vận động và an toàn).
  Nếu có "hien_co_trong_giao_an" (GV đã viết sẵn): giữ các ý đúng của GV, sửa chỗ sai (vd. chép nhầm nội dung bài khác), bổ sung phần còn thiếu.
  "hoat_dong": MỖI hoạt động trong "cac_hoat_dong" một mục, nói CỤ THỂ cách HS A làm từng việc trong "viec_hs" của hoạt động đó (vd. khuyết tật chân: khi gọi lên bảng → trình bày tại chỗ trên bảng con, GV chiếu bài lên màn hình; thảo luận nhóm → nhóm ngồi quanh chỗ của HS A, các bạn di chuyển đến).
- Chỉ trả về MỘT đối tượng JSON, không giải thích, không markdown, đúng khuôn:
{"them_muc_tieu_kien_thuc":["..."],"bo_sung_hoat_dong":[{"key":"...","tex":"..."}],"hoat_dong_moi":[{"key":"...","tex":"..."}],"nls_trong_hoat_dong":[{"key":"...","ma":"...","tex":"..."}],"nang_luc_ai":[{"key":"...","ma":"...","tex":"..."}],"ca_nhan_hoa":{"thong_tin":"...","muc_tieu_hoa_nhap":["..."],"muc_tieu":"...","chuan_bi":"...","hoat_dong":[{"key":"...","dieu_chinh":"..."}],"danh_gia":"...","phoi_hop":"..."}}
Mảng nào không có việc thì để [], "ca_nhan_hoa" không có việc thì để "".`;

const SYSTEM_SOAN = `Bạn là giáo viên chuyên Toán giỏi, soạn kế hoạch bài dạy (KHBD) theo Công văn 5512/BGDĐT-GDTrH cho lớp chuyên.
Đầu vào: tài liệu chuyên đề đã được tách thành các KHỐI: "cac_phan" (M0, M1…: lý thuyết + ví dụ của từng phần) và "bai_tap" (BT1, BT2…: bài tập có lời giải). Nội dung các khối sẽ được chương trình chèn NGUYÊN VĂN vào hoạt động nào có id của khối đó trong "dung", nên bạn KHÔNG chép lại lý thuyết hay đề bài.
Yêu cầu:
- Chia ${d.lesson?.so_tiet || "các"} tiết hợp lý ("phan_bo").
- hd_mo_dau: TỰ NGHĨ một tình huống/bài toán cụ thể, gần gũi (không lấy từ tài liệu) dẫn dắt tới khái niệm đầu tiên, viết đầy đủ vào "tinh_huong" (có câu hỏi gợi mở cho HS). "dung" để [].
- hd_hinh_thanh_1, hd_hinh_thanh_2…: MỖI khối M (trừ M0 nếu chỉ là lời dẫn) vào ĐÚNG MỘT hoạt động hình thành, theo thứ tự; có thể thêm 1–2 bài tập dễ của phần đó làm ví dụ mẫu.
- hd_luyen_tap (có thể hd_luyen_tap_1, _2… theo tiết): chọn bài tập vừa sức, tăng dần.
- hd_van_dung: bài khó/thi HSG (có nguồn), kèm nhiệm vụ tìm hiểu ứng dụng thực tế hoặc dùng công cụ số.
- Mỗi id khối dùng tối đa MỘT lần. Bài tập không chọn sẽ được giao về nhà.
- Mỗi hoạt động: "muc_tieu", "san_pham" và 4 bước "b1" Chuyển giao nhiệm vụ, "b2" Thực hiện nhiệm vụ, "b3" Báo cáo, thảo luận, "b4" Kết luận, nhận định – viết CỤ THỂ theo nội dung khối (nêu tên khái niệm, định lí, bài tập), không viết chung chung.
- "muc_tieu_kien_thuc": 4–8 ý, bám YCCĐ trong PPCT và các khái niệm trong tài liệu.
- "nang_luc_chung" (3 năng lực: tự chủ và tự học; giao tiếp và hợp tác; giải quyết vấn đề và sáng tạo), "nang_luc_dac_thu" (tư duy và lập luận; mô hình hoá; giải quyết vấn đề; giao tiếp; sử dụng công cụ, phương tiện học toán), "pham_chat" (chăm chỉ; trung thực; trách nhiệm): mỗi mục 1–2 câu biểu hiện CỤ THỂ gắn với nội dung bài (ví dụ: "chuyển bài toán bắt tay về đếm cạnh của graph đầy đủ $K_n$").
- "nls_trong_hoat_dong": mỗi mã trong "nls_duoc_dung" gắn vào ĐÚNG MỘT hoạt động phù hợp, 1 câu mô tả việc HS làm. Không dùng mã khác.
- "nang_luc_ai": chọn 1–2 mã trong "nang_luc_ai_chon_tu" (QĐ 2422) hợp nội dung bài, gắn vào MỘT hoạt động, 1–2 câu mô tả cụ thể việc HS làm với công cụ AI; không tăng yêu cầu môn Toán.
- Nếu có "hs_khuyet_tat": thêm "ca_nhan_hoa" (gọi là "HS A") theo TT 03/2018/TT-BGDĐT và Điều 11 TT 22/2021/TT-BGDĐT, đúng tình trạng GV mô tả, không bịa thêm; khuyết tật không ảnh hưởng nhận thức thì giữ nguyên yêu cầu cần đạt, chỉ điều chỉnh cách tham gia; "hoat_dong" có MỘT mục cho MỖI hoạt động bạn soạn, nói cụ thể HS A làm thế nào (lên bảng, nhóm, trò chơi…). Không có thì để "".
- Văn bản là mã LaTeX: công thức trong $...$, in đậm \\textbf{...}, xuống dòng bằng dòng trống; không dùng \\section, không dùng gói lạ. Trong JSON phải viết dấu \\ thành \\\\.
- Chỉ trả về MỘT đối tượng JSON, không giải thích, không markdown:
{"muc_tieu_kien_thuc":["..."],"nang_luc_chung":[{"ten":"...","bieu_hien":"..."}],"nang_luc_dac_thu":[{"ten":"...","bieu_hien":"..."}],"pham_chat":[{"ten":"...","bieu_hien":"..."}],"phan_bo":[{"tiet":"1-2","noi_dung":"..."}],"hoat_dong":[{"key":"hd_mo_dau","ten":"...","tiet":"1","muc_tieu":"...","tinh_huong":"...","dung":[],"san_pham":"...","b1":"...","b2":"...","b3":"...","b4":"..."}],"nls_trong_hoat_dong":[{"key":"...","ma":"...","tex":"..."}],"nang_luc_ai":[{"key":"...","ma":"...","tex":"..."}],"ca_nhan_hoa":{"thong_tin":"...","muc_tieu_hoa_nhap":["..."],"muc_tieu":"...","chuan_bi":"...","hoat_dong":[{"key":"...","dieu_chinh":"..."}],"danh_gia":"...","phoi_hop":"..."}}`;

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
  usage: { include: true },             // OpenRouter trả kèm số token + chi phí (USD) để báo cho người dùng
  max_tokens: soanMoi ? (hskt?.mo_ta ? 12000 : 10000) : (hskt?.mo_ta ? 6000 : 5000),
  reasoning: { effort: "low", exclude: true },   // model "suy nghĩ" (nemotron…) không tiêu hết max_tokens → JSON không bị cắt
  messages: [
    { role: "system", content: soanMoi ? SYSTEM_SOAN : SYSTEM },
    { role: "user", content: anTen(JSON.stringify(user)) }     // không gửi tên thật của HS cho AI
  ]
};

return [{ json: { ...d, can_ai, giu_nguyen, viec, ai_body, nls_map: NLS, ai_map: AI_MAP, soan_moi: soanMoi, ppct: pp } }];
