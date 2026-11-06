// 13_LUU_DIA_CHI_PDF – đặt SAU node Webhook (POST, path: ga-pdf-dia-chi) trong CÙNG workflow GA_01_TELEGRAM_RECEIVE
// "Máy dịch PDF" trên máy Mac tự gọi webhook này mỗi khi mở (địa chỉ đường hầm Cloudflare đổi mỗi lần mở).
// Node 11 đọc địa chỉ đã lưu để gửi .tex sang máy Mac dịch ra PDF.
//
// DÁN MÃ BÍ MẬT (xem ở trang http://127.0.0.1:8792 trên máy Mac) vào dòng dưới. KHÔNG đưa mã này lên GitHub.
const BI_MAT = "DAN_MA_BI_MAT_VAO_DAY";

const b = $input.first().json.body || {};
if (BI_MAT.startsWith("DAN_") || typeof b.bi_mat !== "string" || b.bi_mat !== BI_MAT) {
  return [{ json: { ok: false, loi: "sai mã bí mật" } }];
}
if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(String(b.url || ""))) {
  return [{ json: { ok: false, loi: "địa chỉ không hợp lệ" } }];
}
const cache = $getWorkflowStaticData("global");
cache.pdf_url = b.url;
cache.pdf_bi_mat = BI_MAT;
cache.pdf_luc = new Date().toISOString();
return [{ json: { ok: true } }];
