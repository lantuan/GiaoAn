const data = $json;
const caption = (data.text || "").normalize("NFC").trim();

// Tên file: bỏ đuôi, bỏ _extest, đổi _ thành dấu cách
const fileBase = (data.file_name || "").normalize("NFC")
  .replace(/\.[^.]+$/, "")
  .replace(/_?extest$/i, "")
  .replace(/_/g, " ")
  .trim();

const text = caption;
const lower = caption.toLowerCase();

// 1. Loại yêu cầu
let task_type = "unknown";
if (/bổ sung|thêm vào|thêm hoạt động|thêm phần|viết thêm/.test(lower)) task_type = "supplement";
else if (/chỉnh sửa|sửa lại|điều chỉnh|hoàn thiện|chuẩn hóa|chuẩn hoá/.test(lower)) task_type = "revise";
else if (/soạn|tạo|thiết kế|xây dựng|lập giáo án|lập kế hoạch bài dạy/.test(lower)) task_type = "create";
else if (data.input_type === "document") task_type = "revise";

// 2. Lớp (caption trước, tên file sau)
function timLop(s) {
  const m = s.toLowerCase().match(/(lớp|toán|giáo án)\s*(10|11|12)\b/);
  return m ? m[2] : null;
}
const grade = timLop(caption) || timLop(fileBase);

// 3. Số bài và tên bài (caption trước, tên file sau)
function timBai(s) {
  const m = s.match(/b[àa]i\s*(\d+)\s*[.:\-–]?\s*(.*)$/i);
  if (!m) return { so: null, ten: null };
  const ten = m[2]
    .split(/[,;(]|\s+[-–]\s+|\d+\s*(tiết|phút)|\blớp\s|lớp có|học sinh|khuyết tật|kết nối tri thức|chân trời sáng tạo|cánh diều/i)[0]
    .trim().replace(/[.:]+$/, "");
  return { so: m[1], ten: ten || null };
}
let bai = timBai(caption);
if (!bai.so) bai = timBai(fileBase);
const lesson_number = bai.so;
const lesson_title = bai.ten || timBai(fileBase).ten;

// 4. Thời lượng
const durationMatch = lower.match(/(\d+)\s*(tiết|phút)/);
const duration = durationMatch ? `${durationMatch[1]} ${durationMatch[2]}` : null;

// 5. Bộ sách (mặc định Kết nối tri thức)
let book_series = null;
if (/kết nối tri thức/.test(lower)) book_series = "Kết nối tri thức với cuộc sống";
else if (/chân trời sáng tạo/.test(lower)) book_series = "Chân trời sáng tạo";
else if (/cánh diều/.test(lower)) book_series = "Cánh Diều";
const book_series_is_default = !book_series;
if (!book_series) book_series = "Kết nối tri thức với cuộc sống";

// 6. Phần cần sửa
const sections = ["mục tiêu","thiết bị dạy học","học liệu","mở đầu","hình thành kiến thức","luyện tập","vận dụng","đánh giá"];
let target_section = null;
for (const s of sections) { if (lower.includes(s)) { target_section = s; break; } }

// 7. Hỗ trợ học sinh khuyết tật (chỉ khi GV ghi rõ trong chú thích)
const has_disability_support = new RegExp([
  "khuyết tật", "khuyet tat", "hskt", "hòa nhập", "hoà nhập", "(^|[\\s,.;:(])tật([\\s,.;:)]|$)",
  "khiếm thị", "khiếm thính", "nhìn kém", "thị lực kém", "nghe kém", "điếc", "(^|\\s)mù(\\s|$)",
  "tự kỷ", "tự kỉ", "bại não", "chậm phát triển", "tăng động", "giảm chú ý", "rối loạn",
  "xe lăn", "nạng", "bị liệt", "liệt (chân|tay|nửa)", "đi lại khó", "khó khăn (khi |trong |về )?(đi lại|di chuyển|vận động|nghe|nhìn|học)",
  "hạn chế (di chuyển|vận động|đi lại)", "nói lắp", "nói ngọng", "học sinh đặc biệt"
].join("|"), "u").test(lower);
let hs_khuyet_tat = null;
if (has_disability_support) {
  // Tách tên HS (nếu có) để KHÔNG gửi tên thật cho AI; node 11 tự điền lại tên vào giáo án
  // "em Lê Gia Như", "tên là …", "HSKT …", "học sinh: …", "…: Lê Gia Như" (họ tên viết hoa chữ đầu)
  const TEN = "((?:\\p{Lu}\\p{Ll}+\\s+){0,3}\\p{Lu}\\p{Ll}+)";
  const mTen = caption.match(new RegExp(`(?:^|[\\s,(])(?:tên(?:\\s+là)?|em|bạn|HSKT|hskt|HS|học sinh|cho)\\s*:?\\s*${TEN}`, "u")) ||
               caption.match(new RegExp(`:\\s*${TEN}`, "u"));
  const ten = mTen ? mTen[1].trim().replace(/[,.;]+$/, "") : null;
  let mo_ta = caption;
  if (ten) mo_ta = mo_ta.split(ten).join("HS A");
  hs_khuyet_tat = { ten, mo_ta };
}

// 8. Giữ ngày/lớp/tuần? Mặc định XOÁ để dùng chung cho nhiều lớp (hệ thống đã lưu lớp + thời điểm đẩy lên)
const giu_thong_tin_lop = /giữ (nguyên )?(ngày|lớp|tuần|thông tin lớp)/.test(lower);

return {
  json: {
    ...data,
    request: {
      original_text: text,
      file_base: fileBase || null,
      task_type, grade, lesson_number, lesson_title, duration,
      book_series, book_series_is_default, target_section, has_disability_support,
      hs_khuyet_tat, giu_thong_tin_lop
    }
  }
};
