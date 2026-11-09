// 14_NHAN_TU_MAY – đặt SAU node Webhook (POST, path: ga-nhan-giao-an, Respond: Immediately) trong CÙNG workflow.
// Máy Mac (script tools/gui_giao_an.py) gửi giáo án lấy từ OneDrive vào đây, thay cho việc thầy cô tự gửi file qua Telegram.
// Xác thực bằng mã bí mật của "Máy dịch PDF" (node 13 đã lưu khi máy Mac mở) – không cần dán thêm mã nào.
// Ra: binary "data" + chat_id + caption  →  14B_GUI_FILE_GOC (Telegram Send Document)  →  14C_CHUAN_HOA_TU_MAY  →  03
const cache = $getWorkflowStaticData("global");
const item = $input.first().json;
const b = item.body || {};
const h = item.headers || {};
const bm = String(h["x-bi-mat"] || b.bi_mat || "");
if (!cache.pdf_bi_mat || bm !== cache.pdf_bi_mat) {
  throw new Error("14_NHAN_TU_MAY: sai mã bí mật (hoặc máy Mac chưa mở Máy dịch PDF lần nào)");
}
const chat_id = String(b.chat_id || "").trim();
if (!/^-?\d{3,20}$/.test(chat_id)) throw new Error("14_NHAN_TU_MAY: thiếu mã chat (gõ /id cho bot để lấy)");
const ten = String(b.file_name || "").replace(/[\\/]/g, "_").normalize("NFC");
if (!/\.(tex|zip)$/i.test(ten)) throw new Error("14_NHAN_TU_MAY: chỉ nhận .tex hoặc .zip");
const buf = Buffer.from(String(b.b64 || ""), "base64");
if (!buf.length || buf.length > 20 * 1024 * 1024) throw new Error("14_NHAN_TU_MAY: file rỗng hoặc quá 20 MB");
const mime = /\.zip$/i.test(ten) ? "application/zip" : "text/plain";
const caption = String(b.caption || "").normalize("NFC").slice(0, 900);
return [{
  json: { chat_id, caption, file_name: ten },
  binary: { data: await this.helpers.prepareBinaryData(buf, ten, mime) }
}];
