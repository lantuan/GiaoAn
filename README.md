# GiaoAn – Dữ liệu cho luồng n8n soạn/chỉnh giáo án Toán THPT

Dữ liệu dùng chung cho workflow n8n `GA_01_TELEGRAM_RECEIVE`: nhận giáo án (.tex) qua Telegram, kiểm tra theo **CV 5512**, đối chiếu **YCCĐ** (CT GDPT 2018) và **năng lực số** (CV 3456), rồi tự chỉnh sửa.

> Repo để **public** để n8n đọc qua `raw.githubusercontent.com` không cần token.
> **Không** đưa giáo án hoàn chỉnh, thông tin học sinh hay dữ liệu cá nhân lên đây.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `data/nang_luc_so/nls_nc1.json` | 24 năng lực thành phần, 55 chỉ báo cấp **NC1 (lớp 10–12)**, nguyên văn Phụ lục CV 3456/BGDĐT-GDPT. Mã a, b, c… theo thứ tự gạch đầu dòng. |
| `data/ppct_2026_2027/toan{10,11,12}_chuyen.json` | Kế hoạch dạy học lớp chuyên 2026–2027 (cơ bản + chuyên đề học tập + chuyên đề nâng cao), có mã thiết bị từng bài. |
| `data/ppct_2026_2027/toan{10,11,12}_thuong.json` | Lớp thường = bản chuyên bỏ các dòng `loai: "chuyen_sau"`. |
| `data/thiet_bi/thiet_bi_to_toan.json` | Danh mục thiết bị tổ Toán, mã theo trang mượn thiết bị của trường. |
| `data/khung_5512/khung_5512.json` | Khung KHBD theo CV 5512 (Phụ lục IV), năng lực chung/đặc thù môn Toán, phẩm chất. |
| `n8n/` | Code các node Code trong n8n (03, 04, 07C, 08, 09, 11) – dán vào node cùng tên. |
| `scripts/` | Script Python tạo lại các file JSON từ file Word gốc. |
| `templates/` | Mẫu .tex giáo án (sẽ bổ sung). |
| `prompts/` | Prompt cho AI (sẽ bổ sung). |

**YCCĐ** không lưu ở đây – dùng bản gốc trong repo [`lantuan/NganHangDe`](https://github.com/lantuan/NganHangDe/tree/main/data/curriculum) để chỉ có một nguồn duy nhất.

## Đường dẫn cho n8n

```
https://raw.githubusercontent.com/lantuan/GiaoAn/main/data/nang_luc_so/nls_nc1.json
https://raw.githubusercontent.com/lantuan/GiaoAn/main/data/ppct_2026_2027/toan10_thuong.json
https://raw.githubusercontent.com/lantuan/GiaoAn/main/data/khung_5512/khung_5512.json
https://raw.githubusercontent.com/lantuan/NganHangDe/main/data/curriculum/toan10/L10_C1.json
```

## Một dòng PPCT

```json
{ "lop": 10, "hoc_ky": 1, "tuan": 13, "tiet": "38-39", "so_tiet": 2, "loai": "co_ban",
  "ten": "Bài 12. Số gần đúng và sai số", "bai_so": 12, "ten_bai": "Số gần đúng và sai số",
  "chuyen_de": null, "yccd": "…", "nls": ["1.1.NC1b", "3.1.NC1b", "5.2.NC1b"], "nls_loi": [],
  "ghi_chu": null,
  "thiet_bi": [ { "ma": "PTTH2034", "ten": "Bộ thiết bị để vẽ trên bảng trong dạy học toán (thước thẳng, compa)" } ] }
```

- `loai`: `co_ban` | `chuyen_de_hoc_tap` | `chuyen_sau` | `on_tap_kiem_tra` | `trai_nghiem`.
- `chuyen_de`: dạng `CĐ1.B2` (Chuyên đề 1, Bài 2).
- `thiet_bi`: gắn theo cột "Các bài thí nghiệm/thực hành" trong bảng thiết bị của PPCT. "Máy vi tính/phần mềm toán học" = `TOAN002` + phần mềm `PTTH3001` (Đại số – Giải tích) / `PTTH3002` (Hình học) / `PTTH3003` (Thống kê – Xác suất) theo mô tả.

## Tạo lại dữ liệu

```bash
cd scripts
python3 build_nls_nc1.py "Công-văn-3456-BGDĐT-GDPT.docx" ../data/nang_luc_so/nls_nc1.json
python3 ppct_1_doc_word.py "Kế hoạch giảng dạy toán chuyên năm học 2026-2027.docx"   # → ppct_v2_raw.json
python3 ppct_2_tao_json.py ../data/ppct_2026_2027                                   # → JSON + báo cáo lỗi
```

## Gửi giáo án có hình

File .tex chỉ ghi đường dẫn tới hình (`\includegraphics{..._hinh/image1.png}`), hình nằm ở thư mục riêng.
Muốn nhận lại đủ hình: **nén cả thư mục bài thành .zip** rồi gửi bot. Luồng trả về .zip gồm file `_CV5512.tex` + hình + `ex_test.sty` (cùng một cấp thư mục).

```
06_TAI_FILE → IF 07A_LA_ZIP ─false→ 07_DOC_TEX ───────────────→ 08 …
                            └true─→ 07B_GIAI_NEN (Decompress) → 07C_LAY_TEX_TU_ZIP → 08 …
11_GHEP_VA_SUA → IF 11A_CO_ZIP ─true→ 12A_NEN_ZIP (Compress, ds_binary) → 12 Telegram
                               └false──────────────────────────────────→ 12 Telegram
```

## Soạn KHBD từ tài liệu chuyên đề

Gửi tài liệu (chưa phải KHBD) kèm chú thích, ví dụ: `chuyển giáo án cho chuyên đề chuyên sâu (nâng cao) lớp 11`.
- Node 04 tìm bài trong `ppct_2026_2027` theo **tên** (chú thích + tên file) – không cần số bài; "nâng cao/chuyên sâu" → `chuyen_sau`, "chuyên đề học tập" → `chuyen_de_hoc_tap`.
- Node 08 nhận ra file chưa có cấu trúc KHBD → lập dàn ý (các phần, ví dụ, bài tập đánh số) ~6 nghìn ký tự gửi AI thay cho cả tài liệu.
- Node 11 dựng KHBD: Mục tiêu (YCCĐ trong PPCT + AI), năng lực, NLS (nguyên văn CV 3456), thiết bị có mã mượn, tiến trình 4 hoạt động do AI viết; tài liệu gốc in nguyên văn ở **Phụ lục**.

## Gửi kèm Word có Equation (chuyển trên máy Mac của GV)

Từ 9/11/2026 node 11 gọi `POST <đường hầm>/word` (Tex2Word) thay cho `/dich` (PDF): bot trả .zip gồm `_CV5512.tex` + `_CV5512.docx` (công thức là Equation) + hình. Máy Mac tắt → chỉ có .tex. Phần dưới (app "Máy dịch PDF", node 13) giữ nguyên.

### Cách cũ: PDF

Máy chủ n8n không có LaTeX, nên node 11 gửi .tex + hình + .sty sang **Máy dịch PDF** chạy trên máy Mac
(`~/Library/Application Support/MayDichPDF/server.py`, cổng 8792, dịch bằng tectonic), qua đường hầm Cloudflare miễn phí.

- Địa chỉ đường hầm đổi mỗi lần mở → máy Mac tự báo địa chỉ mới cho n8n qua webhook `POST /webhook/ga-pdf-dia-chi`
  → node `13_LUU_DIA_CHI_PDF` (lưu vào static data, kiểm tra mã bí mật).
- Mã bí mật xem ở trang `http://127.0.0.1:8792` trên máy Mac, dán vào node 13 trên n8n (không đưa lên GitHub).
- Máy Mac tắt: bot vẫn gửi .tex và báo "chưa có PDF".

```
Webhook (POST, ga-pdf-dia-chi, Respond: When Last Node Finishes) → 13_LUU_DIA_CHI_PDF
```

## Gửi giáo án từ máy Mac / OneDrive (không cần tự gửi qua Telegram)

`tools/gui_giao_an.py` lấy giáo án trên máy (.docx, .tex, thư mục bài hoặc .zip), đổi Word → TeX (MathType → Equation nếu có), gói thành .zip rồi gửi vào luồng. Kết quả về Telegram như khi tự gửi file cho bot.

```
python3 tools/gui_giao_an.py "~/Library/CloudStorage/OneDrive-Personal/GiaoAn_Goc/Lop10/Bài 8. ….docx" "in chữ đen"
```

Trên n8n (cùng workflow `GA_01_TELEGRAM_RECEIVE`):

```
Webhook (POST, path ga-nhan-giao-an, Respond: Immediately)
  → 14_NHAN_TU_MAY (Code)
  → 14B_GUI_FILE_GOC (Telegram › Send Document: Chat ID {{ $json.chat_id }}, Binary, field data, caption 📥 {{ $json.caption }})
  → 14C_CHUAN_HOA_TU_MAY (Code)
  → 03_PHAN_TICH_YEU_CAU (đang có)
```

- Xác thực bằng mã bí mật của Máy dịch PDF (node 13 đã lưu) – không phải dán mã nào vào node 14.
- Mã chat: gõ `/id` cho bot, rồi `python3 tools/gui_giao_an.py --chat-id <số>` (lưu trong config của Máy dịch PDF).

### Nhắn chữ cho bot để lấy giáo án trong OneDrive (chỉ chủ máy)

Chủ máy (mã chat do Máy dịch PDF báo qua node 13) nhắn kiểu `Làm giáo án Bài 8 lớp 10, in chữ đen` → node 04 gọi `POST <đường hầm>/tim` → máy Mac chạy `tools/tim_giao_an.py` tìm trong `OneDrive/GiaoAn_Goc`:
- một bản rõ ràng → `tools/gui_giao_an.py` gửi vào luồng (node 14), bot báo "📂 Tìm thấy …";
- nhiều bản gần đúng → bot liệt kê, trả lời số (ví dụ `1`) để chọn.
Người khác nhắn chữ vẫn nhận hướng dẫn như cũ.

## Giữ nguyên giáo án đạt yêu cầu; thiếu đâu bổ sung đó (từ 9/11/2026)

Node 08 kiểm tra: cấu trúc CV 5512 (nhận cả "1. HOẠT ĐỘNG 1: MỞ ĐẦU", "HOẠT ĐỘNG 2: …", "Hoạt động 2.1: …", "Bước 1: Giao nhiệm vụ"), YCCĐ, **mã NLS theo PPCT**, **năng lực AI (QĐ 2422)**, **thiết bị mượn của tổ (mã PPCT)**.
- Đạt hết → node 09 `giu_nguyen = true`, không gọi AI; node 11 không sửa gì, chỉ xuất lại .tex + Word.
- Thiếu → chỉ bổ sung phần thiếu (mã NLS vào Mục tiêu + hoạt động; năng lực AI 1–2 mã hợp bài; thiết bị PPCT vào mục II).
- `data/nang_luc_ai/qd2422_yccd_10_12.json`: 71 YCCĐ lớp 10–12 của Phụ lục QĐ 2422/QĐ-BGDĐT (mã `10.C3.2`, `.MR` = mở rộng).
- Node 04 nhận mã chuyên đề học tập từ tên file/chú thích: "CD 2-B4", "CĐ2.B4", "chuyên đề 2 bài 4" → dòng PPCT `CĐ2.B4`.
