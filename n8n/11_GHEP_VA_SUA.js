// 11_GHEP_VA_SUA – Ghép phần AI viết + tự sửa bằng code → xuất file .tex mới
// Đầu vào: kết quả 10_GOI_AI (HTTP OpenRouter) HOẶC thẳng từ IF "can_ai = false"
const inp = $input.first().json;
const d = $('09_CHUAN_BI_AI').first().json;
const goc = $('07_DOC_TEX').first().json.giao_an_tex || "";
const meta = $('04_LAY_YCCD').first().json;
const cache = $getWorkflowStaticData("global");
const NLS = d.nls_map || cache.nls_nc1 || {};   // lấy từ node 09 (static data không chia sẻ giữa các node khi chạy thử)

let tex = goc.normalize("NFC");
const da_sua = [];
const canh_bao = [];
const XANH = c => `{\\color[HTML]{0070C0}\n${c}\n}`;           // phần AI viết: màu xanh để GV rà soát
const DO = c => `\\textcolor[HTML]{EE0000}{${c}}`;            // năng lực số: màu đỏ như giáo án gốc
const canBang = s => { let n = 0; for (const ch of s.replace(/\\[{}]/g, "")) { if (ch === "{") n++; if (ch === "}") n--; if (n < 0) return false; } return n === 0; };
const chen = (sau, them) => { const i = tex.indexOf(sau); if (i < 0) return false; tex = tex.slice(0, i + sau.length) + them + tex.slice(i + sau.length); return true; };

// ===== 1. Đọc kết quả AI =====
let ai = null, model_dung = null;
if (inp.choices) {
  model_dung = inp.model || null;
  const raw = String(inp.choices?.[0]?.message?.content || "");
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  try { ai = JSON.parse(raw.slice(a, b + 1)); }
  catch (e) { canh_bao.push("AI trả về không đúng JSON – bỏ qua phần AI, chỉ sửa bằng code."); }
}
const S = d.sections_tex || {};
const nlsDuocPhep = new Set((d.viec?.nls_can_gan || []).map(x => x.ma));
// Chỉ nhận những việc ĐÃ GIAO cho AI (AI viết thừa thì bỏ)
const hdMoiDuocPhep = new Set((d.viec?.hoat_dong_moi || []).map(x => x.key));
const boSungDuocPhep = new Set((d.viec?.bo_sung_hoat_dong || []).map(x => x.key));
if (ai) {
  ai.hoat_dong_moi = (ai.hoat_dong_moi || []).filter(x => hdMoiDuocPhep.has(x.key) || (canh_bao.push(`Bỏ qua ${x.key}: AI viết thừa (hoạt động đã có)`), false));
  ai.bo_sung_hoat_dong = (ai.bo_sung_hoat_dong || []).filter(x => boSungDuocPhep.has(x.key) || (canh_bao.push(`Bỏ qua bổ sung ${x.key}: không được yêu cầu`), false));
  if (!d.viec?.yccd_thieu?.length) ai.them_muc_tieu_kien_thuc = [];
}

if (ai) {
  // 1a. Thêm YCCĐ vào Mục tiêu – Kiến thức
  const kt = (ai.them_muc_tieu_kien_thuc || []).filter(s => s && canBang(s));
  if (kt.length) {
    const i0 = tex.search(/Kiến thức/);
    const i1 = i0 >= 0 ? tex.indexOf("\\end{itemize}", i0) : -1;
    if (i1 > 0) {
      tex = tex.slice(0, i1) + kt.map(s => `\\item {\\color[HTML]{0070C0}${s}}\n\n`).join("") + tex.slice(i1);
      da_sua.push(`Thêm ${kt.length} ý vào Mục tiêu – Kiến thức để bám YCCĐ`);
    }
  }
  // Mã NLS AI gắn vào hoạt động MỚI → ghép thẳng vào hoạt động mới đó
  const nlsMoi = {};
  for (const x of ai.nls_trong_hoat_dong || []) {
    if ((ai.hoat_dong_moi || []).some(h => h.key === x.key) && nlsDuocPhep.has(x.ma) && x.tex && canBang(x.tex)) {
      (nlsMoi[x.key] = nlsMoi[x.key] || []).push(x.tex.startsWith(x.ma) ? x.tex : `${x.ma}: ${x.tex}`);
      x._da_dung = true;
    }
  }
  // 1c. Hoạt động mới (vd: thiếu Vận dụng)
  const SO = { hd_mo_dau: "1. HOẠT ĐỘNG MỞ ĐẦU", hd_hinh_thanh: "2. HÌNH THÀNH KIẾN THỨC MỚI", hd_luyen_tap: "3. HOẠT ĐỘNG LUYỆN TẬP", hd_van_dung: "4. HOẠT ĐỘNG VẬN DỤNG" };
  const hdKeys = (d.kiem_tra?.hoat_dong || []).map(h => h.key);
  const cuoi = [...hdKeys].reverse().find(k => S[k] && !/^hd_hinh_thanh_\d/.test(k)) || hdKeys[hdKeys.length - 1];
  for (const x of ai.hoat_dong_moi || []) {
    if (!x.tex || !canBang(x.tex) || !SO[x.key]) { canh_bao.push(`Bỏ qua hoạt động mới ${x.key} (không hợp lệ)`); continue; }
    const khoi = `\n\n{\\raggedright \\textbf{${SO[x.key]}}\\par}\n\n` + XANH(x.tex) + "\n" +
      (nlsMoi[x.key] || []).map(s => "\n" + DO(s) + "\n").join("");
    let ok = false;
    if (x.key === "hd_mo_dau" && S.tien_trinh) ok = chen(S.tien_trinh.split("\n")[0], khoi);
    else if (cuoi && S[cuoi]) ok = chen(S[cuoi], khoi);
    else { const e = tex.lastIndexOf("\\end{document}"); if (e > 0) { tex = tex.slice(0, e) + khoi + "\n" + tex.slice(e); ok = true; } }
    if (ok) da_sua.push(`Viết thêm ${SO[x.key].replace(/^\d\.\s*/, "")}` + (nlsMoi[x.key] ? ` (kèm ${nlsMoi[x.key].length} mã NLS)` : ""));
    else canh_bao.push(`Không tìm thấy vị trí để chèn ${SO[x.key]}`);
  }
  // 1b. Bổ sung phần thiếu trong hoạt động (làm SAU 1c để phần bổ sung nằm ngay cuối hoạt động, trước hoạt động mới)
  for (const x of ai.bo_sung_hoat_dong || []) {
    if (!S[x.key] || !x.tex || !canBang(x.tex)) { canh_bao.push(`Bỏ qua phần bổ sung cho ${x.key} (không hợp lệ)`); continue; }
    if (chen(S[x.key], "\n\n" + XANH(x.tex) + "\n")) da_sua.push(`Bổ sung phần thiếu ở ${x.key}`);
    else canh_bao.push(`Không tìm thấy vị trí ${x.key} để chèn phần bổ sung`);
  }
  // 1d. Gắn mã NLS vào hoạt động đã có
  for (const x of ai.nls_trong_hoat_dong || []) {
    if (x._da_dung) continue;
    if (!nlsDuocPhep.has(x.ma) || !S[x.key] || !x.tex || !canBang(x.tex)) { canh_bao.push(`Bỏ qua mã NLS ${x.ma || "?"} (không hợp lệ)`); continue; }
    const dong = x.tex.startsWith(x.ma) ? x.tex : `${x.ma}: ${x.tex}`;
    if (chen(S[x.key], "\n\n" + DO(dong) + "\n")) da_sua.push(`Gắn ${x.ma} vào ${x.key}`);
  }
  // 1e. Cá nhân hoá cho HS khuyết tật (chỉ khi GV yêu cầu) – điền lại tên thật tại đây, AI không biết tên
  const hskt = meta.request?.hs_khuyet_tat || d.request?.hs_khuyet_tat;
  const cnh = typeof ai.ca_nhan_hoa === "string" ? ai.ca_nhan_hoa.trim() : "";
  if (hskt && cnh && canBang(cnh)) {
    const noiDung = hskt.ten ? cnh.split("HS A").join(`HS ${hskt.ten}`) : cnh;
    const khoi = `\n\n\\subsubsection*{IV. HỖ TRỢ HỌC SINH KHUYẾT TẬT HỌC HOÀ NHẬP}\n\n` + XANH(noiDung) + "\n\n";
    const e = tex.lastIndexOf("\\end{document}");
    if (e > 0) { tex = tex.slice(0, e) + khoi + tex.slice(e); da_sua.push("Thêm phần cá nhân hoá cho HS khuyết tật (mục IV)"); }
  } else if (hskt) canh_bao.push("Chưa viết được phần cá nhân hoá cho HS khuyết tật – gửi lại giúp mình");
}

// ===== 2. Sửa bằng code (0 token) =====
// 2a. Thuật ngữ
if (/Năng lực riêng/.test(tex)) { tex = tex.replace(/Năng lực riêng/g, "Năng lực đặc thù"); da_sua.push('Đổi "Năng lực riêng" → "Năng lực đặc thù"'); }

// 2d. Xoá thông tin riêng từng lớp (ngày soạn/dạy, lớp, tuần, tiết PPCT, sĩ số) để dùng chung cho nhiều lớp.
// Hệ thống của trường đã lưu lớp + thời điểm đẩy lên. Giữ lại nếu GV ghi "giữ ngày/lớp".
if (!(meta.request?.giu_thong_tin_lop)) {
  const pl = s => s.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[0-9A-Fa-f]{6}\})?/g, " ").replace(/[{}~$]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  // Mạnh: xoá ở bất kỳ đâu (dòng ngắn bắt đầu bằng các nhãn này)
  const MANH = /^(ngày|thời gian|giờ)\s*(soạn|dạy|giảng|lên lớp|thực hiện)|^(tiết|tiết thứ)\s*(theo\s*)?ppct|^(tuần|lớp)\s*dạy|^sĩ số|^lớp\s*:\s*\d|^lớp\s*\d{1,2}\s*[a-zđ]+\d*\s*([:,;–-]|$)/;
  // Chỉ xoá ở phần đầu (trước I. MỤC TIÊU)
  const DAU = /^(ngày|tuần|thứ)\s*(\d|\.|:|…|hai|ba|tư|năm|sáu|bảy)|^tiết\s*[:\d]|^lớp\s*[:\d]/;
  const iB = tex.indexOf("\\begin{document}"), iE = tex.lastIndexOf("\\end{document}");
  if (iB >= 0 && iE > iB) {
    let body = tex.slice(iB, iE);
    let soXoa = 0, pos = 0;
    // bảng thông tin lớp (Lớp | Ngày dạy | Sĩ số…)
    body = body.replace(/\\begin\{(tabular|tabularx|longtable)\}[\s\S]*?\\end\{\1\}/g, b => {
      const t = pl(b);
      if (t.length < 600 && /(ngày dạy|ngày giảng|sĩ số|lớp dạy|tiết ppct)/.test(t)) { soXoa++; return ""; }
      return b;
    });
    const iMuc = body.search(/I\.\s*MỤC TIÊU/);
    body = body.split("\n").filter(l => {
      const viTri = pos; pos += l.length + 1;
      const t = pl(l);
      if (!t || t.length > 160) return true;
      if (MANH.test(t) || (viTri < iMuc && DAU.test(t))) { soXoa++; return false; }
      return true;
    }).join("\n").replace(/\n{3,}/g, "\n\n");
    if (soXoa) { tex = tex.slice(0, iB) + body + tex.slice(iE); da_sua.push(`Xoá ${soXoa} dòng thông tin riêng từng lớp (ngày, lớp, tuần, tiết PPCT) để dùng chung`); }
  }
}

// 2b. Dòng tiến trình lọt vào câu trắc nghiệm \begin{ex}
// Lỗi Word2Tex: (1) dòng "Bước…" lọt giữa đề và \choice; (2) \loigiai{...} của câu cuối "nuốt" phần
// tiến trình phía sau (Đáp án bài tập, Bước 4, cả Hoạt động Vận dụng). Đưa tất cả ra sau \end{ex}, đúng thứ tự.
let soEx = 0, soNuot = 0;
const LAC_RX = /Bước\s*\d|HOẠT ĐỘNG|\\textbf\{\s*[a-d]\)/;
tex = tex.replace(/\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g, (blk, inner) => {
  if (!LAC_RX.test(inner)) return blk;
  const iChoiceTxt = inner.search(/\n\s*\\choice/);
  if (iChoiceTxt < 0) return blk;
  // (1) dòng lạc giữa đề và \choice
  const dau = inner.slice(0, iChoiceTxt).split("\n");
  const iDe = dau.findIndex((l, i) => i > 0 && l.trim() && !/^%/.test(l.trim()));
  const giu = [], lac = [];
  dau.forEach((l, i) => {
    if (i > iDe && l.trim() && (/Bước\s*\d/.test(l) || /^\s*(\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}\{)?\s*-\s/.test(l))) lac.push(l);
    else giu.push(l);
  });
  // (2) lời giải bị nuốt
  let duoi = inner.slice(iChoiceTxt), nuot = "";
  const iL = duoi.indexOf("\\loigiai{");
  if (iL >= 0) {
    const iEnd = duoi.lastIndexOf("}");
    const lg = duoi.slice(iL + 9, iEnd);
    if (LAC_RX.test(lg)) { nuot = lg.trim(); duoi = duoi.slice(0, iL) + "\\loigiai{\n}\n"; soNuot++; }
  }
  if (!lac.length && !nuot) return blk;
  soEx++;
  return "\\begin{ex}" + giu.join("\n") + duoi + "\\end{ex}\n\n" +
    (lac.length ? lac.join("\n\n") + "\n\n" : "") + (nuot ? nuot + "\n" : "");
});
if (soEx) da_sua.push(`Gỡ ${soEx} câu trắc nghiệm bị lẫn tiến trình (lỗi Word2Tex)` + (soNuot ? `, trả ${soNuot} phần bị \\loigiai "nuốt" về đúng chỗ` : ""));

// 2c. Năng lực số ở Mục tiêu: đúng nguyên văn CV 3456 + bổ sung mã đang dùng ở hoạt động
const iMT = tex.search(/I\.\s*MỤC TIÊU/), iTB = tex.search(/II\.\s*THIẾT BỊ/);
if (iMT >= 0 && iTB > iMT) {
  let mt = tex.slice(iMT, iTB);
  let soSua = 0;
  mt = mt.replace(/\b([1-6]\.[1-6]\.NC1[a-z])\s*:\s*([^}\n]*)/g, (all, ma, mota) => {
    if (!NLS[ma]) { canh_bao.push(`Mã ${ma} không có trong CV 3456 (cấp NC1)`); return all; }
    if (mota.trim().replace(/[.\s]+$/, "") === NLS[ma].replace(/[.\s]+$/, "")) return all;
    soSua++; return `${ma}: ${NLS[ma]}`;
  });
  if (soSua) da_sua.push(`Sửa ${soSua} mô tả năng lực số cho đúng nguyên văn CV 3456`);

  const coMT = new Set(mt.match(/\b[1-6]\.[1-6]\.NC1[a-z]/g) || []);
  const trongHD = new Set([...(d.kiem_tra?.nls_hoat_dong || []), ...(ai?.nls_trong_hoat_dong || []).map(x => x.ma).filter(m => nlsDuocPhep.has(m))]);
  const them = [...trongHD].filter(m => !coMT.has(m) && NLS[m]).sort();
  if (them.length) {
    const j0 = mt.search(/Năng lực số/);
    const j1 = j0 >= 0 ? mt.indexOf("\\end{itemize}", j0) : -1;
    if (j1 > 0) {
      mt = mt.slice(0, j1) + them.map(m => `\\item ${DO(`${m}: ${NLS[m]}`)}\n\n`).join("") + mt.slice(j1);
      da_sua.push(`Thêm vào Mục tiêu các mã NLS đang dùng ở hoạt động: ${them.join(", ")}`);
    } else canh_bao.push("Không tìm thấy danh sách Năng lực số trong Mục tiêu để thêm mã");
  }
  tex = tex.slice(0, iMT) + mt + tex.slice(iTB);
}

// 2e. Khối "Ký duyệt" cuối giáo án (Tổ trưởng chuyên môn – Giáo viên)
const plainBody = tex.slice(tex.indexOf("\\begin{document}")).normalize("NFC");
if (!/Ký duyệt/i.test(plainBody)) {
  const KY = `

\\par\\vspace{0.8cm}\\noindent
\\begin{minipage}{\\linewidth}
\\centering{\\textbf{Ký duyệt}}\\par\\vspace{2pt}
\\noindent\\rule{\\linewidth}{0.6pt}\\par\\vspace{6pt}
\\begin{minipage}[t]{0.5\\linewidth}\\centering
\\textbf{Tổ trưởng chuyên môn}\\par\\vspace{6pt}
\\textit{(Ký, ghi rõ họ tên)}
\\end{minipage}%
\\begin{minipage}[t]{0.5\\linewidth}\\centering
\\textbf{Giáo viên}\\par\\vspace{6pt}
\\textit{(Ký, ghi rõ họ tên)}
\\end{minipage}
\\vspace{2.5cm}
\\end{minipage}

`;
  const e = tex.lastIndexOf("\\end{document}");
  if (e > 0) { tex = tex.slice(0, e) + KY + tex.slice(e); da_sua.push("Thêm khối Ký duyệt (Tổ trưởng chuyên môn – Giáo viên)"); }
}

// ===== 3. Xuất file =====
const tenGoc = (meta.file_name || `Bai_${meta.lesson?.bai_so || ""}.tex`).normalize("NFC");
const fileName = tenGoc.replace(/\.tex$/i, "") + "_CV5512.tex";
const binary = { data: await this.helpers.prepareBinaryData(Buffer.from(tex, "utf8"), fileName, "application/x-tex") };

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let caption = `<b>✅ Đã chỉnh theo CV 5512: Bài ${esc(meta.lesson?.bai_so)}. ${esc(meta.lesson?.bai)}</b>\n` +
  (da_sua.length ? da_sua.map(s => "• " + esc(s)).join("\n") : "Không có gì cần sửa.") +
  (canh_bao.length ? `\n<b>Lưu ý:</b>\n` + canh_bao.map(s => "• " + esc(s)).join("\n") : "") +
  `\n<i>Phần màu xanh do AI viết – thầy/cô rà soát trước khi dùng.${model_dung ? " (" + esc(model_dung) + ")" : ""}</i>`;
if (caption.length > 1000) caption = caption.slice(0, 990) + "…";

return [{ json: { chat_id: meta.chat_id, message_id: meta.message_id, caption, da_sua, canh_bao, model_dung, file_name: fileName }, binary }];
