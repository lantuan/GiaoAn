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
| `n8n/` | Code các node Code trong n8n (03, 04, 08, 09, 11) – dán vào node cùng tên. |
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
