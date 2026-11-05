// 11_GHEP_VA_SUA – Ghép phần AI viết + tự sửa bằng code → xuất file .tex mới
// Đầu vào: kết quả 10_GOI_AI (HTTP OpenRouter) HOẶC thẳng từ IF "can_ai = false"
const inp = $input.first().json;
const d = $('09_CHUAN_BI_AI').first().json;
const goc = $('07_DOC_TEX').first().json.giao_an_tex || "";
const meta = $('04_LAY_YCCD').first().json;
const cache = $getWorkflowStaticData("global");
const NLS = cache.nls_nc1 || {};

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
}

// ===== 2. Sửa bằng code (0 token) =====
// 2a. Thuật ngữ
if (/Năng lực riêng/.test(tex)) { tex = tex.replace(/Năng lực riêng/g, "Năng lực đặc thù"); da_sua.push('Đổi "Năng lực riêng" → "Năng lực đặc thù"'); }

// 2b. Dòng tiến trình lọt vào câu trắc nghiệm \begin{ex}
let soEx = 0;
tex = tex.replace(/\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g, (blk, inner) => {
  if (!/Bước\s*\d/.test(inner)) return blk;
  const L = inner.split("\n");
  const iChoice = L.findIndex(l => /^\s*\\choice/.test(l));
  if (iChoice < 0) return blk;
  const iDe = L.findIndex((l, i) => i > 0 && l.trim() && !/^%/.test(l.trim()));   // dòng đề bài
  const giu = [], lac = [];
  L.forEach((l, i) => {
    if (i > iDe && i < iChoice && l.trim() && (/Bước\s*\d/.test(l) || /^\s*(\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}\{)?\s*-\s/.test(l))) lac.push(l);
    else giu.push(l);
  });
  if (!lac.length) return blk;
  soEx++;
  return "\\begin{ex}" + giu.join("\n") + "\\end{ex}\n\n" + lac.join("\n\n") + "\n";
});
if (soEx) da_sua.push(`Chuyển các dòng "Bước…" ra khỏi ${soEx} câu trắc nghiệm`);

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
