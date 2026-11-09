// 14C_CHUAN_HOA_TU_MAY – đặt SAU node Telegram 14B_GUI_FILE_GOC (Send Document), nối ra 03_PHAN_TICH_YEU_CAU.
// Đưa tin nhắn bot vừa gửi (file gốc + chú thích) về đúng dạng như 02_CHUAN_HOA_DU_LIEU, để 03 → 12 chạy y như khi nhận từ Telegram.
const r = $input.first().json;
const m = r.result || r;                         // tuỳ phiên bản node Telegram
const goc = $("14_NHAN_TU_MAY").first().json;
const doc = m.document || {};
if (!doc.file_id) throw new Error("14C: Telegram không trả về file_id");
return [{
  json: {
    chat_id: (m.chat && m.chat.id) || goc.chat_id,
    message_id: m.message_id,
    file_id: doc.file_id,
    file_name: doc.file_name || goc.file_name,
    text: goc.caption,
    input_type: "document",
    nguon: "may_mac"
  }
}];
