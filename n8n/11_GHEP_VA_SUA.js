// 11_GHEP_VA_SUA – Ghép phần AI viết + tự sửa bằng code → xuất file .tex mới
// Đầu vào: kết quả 10_GOI_AI (HTTP OpenRouter) HOẶC thẳng từ IF "can_ai = false"
const inp = $input.first().json;
const d = $('09_CHUAN_BI_AI').first().json;
// Giáo án: từ nhánh .zip (07C, có hình) hoặc nhánh .tex (07_DOC_TEX)
let tuZip = null;
try { tuZip = $('07C_LAY_TEX_TU_ZIP').first().json; } catch (e) {}
const loiZip = tuZip?.loi_zip || null;
if (!tuZip?.giao_an_tex) tuZip = null;
let goc = tuZip ? tuZip.giao_an_tex : "";
if (!goc) { try { goc = $('07_DOC_TEX').first().json.giao_an_tex || ""; } catch (e) {} }
if (!goc) throw new Error(loiZip || "Không đọc được giáo án. Kiểm tra node IF 07A_LA_ZIP: ô thứ hai phải ghi .zip (file .tex phải đi nhánh false → 07_DOC_TEX).");
const meta = $('04_LAY_YCCD').first().json;
const cache = $getWorkflowStaticData("global");
const NLS = d.nls_map || cache.nls_nc1 || {};   // lấy từ node 09 (static data không chia sẻ giữa các node khi chạy thử)
const AIM = d.ai_map || {};                      // năng lực AI (QĐ 2422) của lớp này: mã → YCCĐ
const giuNguyen = !!d.giu_nguyen;                // giáo án đã đạt mọi yêu cầu → không sửa gì, chỉ xuất lại

let tex = goc.normalize("NFC");
const da_sua = [];
const canh_bao = [];
const XANH = c => `{\\color[HTML]{0070C0}\n${c}\n}`;           // phần AI viết: màu xanh để GV rà soát
const DO = c => `\\textcolor[HTML]{EE0000}{${c}}`;            // năng lực số: màu đỏ như giáo án gốc
const canBang = s => { let n = 0; for (const ch of s.replace(/\\[{}]/g, "")) { if (ch === "{") n++; if (ch === "}") n--; if (n < 0) return false; } return n === 0; };
// Danh sách dòng chèn thêm → máy Mac chèn đúng vào file Word GỐC của GV (tools/sua_word.py)
const BAN_LUONG = "11-1011c";                 // số phiên bản node 11 (hiện cuối caption) – để biết n8n đang chạy bản nào
const W = { nls_muc_tieu: [], ai_muc_tieu: [], thiet_bi: "", hoat_dong: [], day_du: true, ban: BAN_LUONG };
const tieuDe = k => String(S_[k] || "").split("\n").map(l => l
  .replace(/\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}/g, "").replace(/\\fontsize\{[^}]*\}\{[^}]*\}/g, "")
  .replace(/\\[a-zA-Z]*skip\s*=\s*-?[\d.]+\s*(cm|mm|pt|em)/g, " ").replace(/\\[hv]space\*?\{[^}]*\}/g, " ")
  .replace(/\\[a-zA-Z]+\*?/g, " ").replace(/[{}$~]/g, " ").replace(/\s+/g, " ").trim()).find(Boolean) || "";
const chen = (sau, them) => { const i = tex.indexOf(sau); if (i < 0) return false; tex = tex.slice(0, i + sau.length) + them + tex.slice(i + sau.length); return true; };

// ===== 1. Đọc kết quả AI =====
// AI hay viết LaTeX trong JSON mà quên nhân đôi dấu \ → "\frac", "\le", "\{" làm JSON hỏng hoặc biến thành ký tự điều khiển.
function docJSON(raw) {
  raw = String(raw || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let t = raw.slice(a, b + 1);
  t = t.replace(/\\(\\|u(?![0-9a-fA-F]{4})|[^"\\/bfnrtu])/g, (m, c) => c === "\\" ? m : "\\\\" + c);   // \c, \l, \{ … → \\c … (giữ nguyên cặp \\)
  let o;
  try { o = JSON.parse(t); } catch (e) {
    try { o = JSON.parse(t.replace(/,\s*([}\]])/g, "$1")); } catch (e2) { return null; }
  }
  const NCMD = /\n(?=(eq|eq\b|otin|u\b|oindent|ewline|abla|e\b|ot\b|ewpage|leq|geq|mid|parallel|exists|subseteq|cong|sim|i\b|ormalsize)\b)/g;
  const sua = v => typeof v === "string"
    ? v.replace(/\t/g, "\\t").replace(/\f/g, "\\f").replace(/\x08/g, "\\b").replace(/\r(?=[a-z])/g, "\\r").replace(NCMD, "\\n")
    : Array.isArray(v) ? v.map(sua) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sua(x)])) : v;
  return sua(o);
}
let ai = null, model_dung = null;
if (inp.error) canh_bao.push("AI báo lỗi: " + String(inp.error.message || inp.error).slice(0, 150));
if (inp.choices) {
  model_dung = inp.model || null;
  const raw = String(inp.choices?.[0]?.message?.content || "");
  ai = docJSON(raw);
  if (!ai) canh_bao.push("AI trả về không đúng JSON – bỏ qua phần AI, chỉ sửa bằng code.");
  if (inp.choices?.[0]?.finish_reason === "length") canh_bao.push("Câu trả lời của AI bị cắt giữa chừng (hết max_tokens ở node 09).");
}
const S = d.sections_tex || {};
var S_ = S;
const nlsDuocPhep = new Set((d.viec?.nls_can_gan || []).map(x => x.ma));
// Chỉ nhận những việc ĐÃ GIAO cho AI (AI viết thừa thì bỏ)
const hdMoiDuocPhep = new Set((d.viec?.hoat_dong_moi || []).map(x => x.key));
const boSungDuocPhep = new Set((d.viec?.bo_sung_hoat_dong || []).map(x => x.key));
if (ai) {
  ai.hoat_dong_moi = (ai.hoat_dong_moi || []).filter(x => hdMoiDuocPhep.has(x.key) || (canh_bao.push(`Bỏ qua ${x.key}: AI viết thừa (hoạt động đã có)`), false));
  ai.bo_sung_hoat_dong = (ai.bo_sung_hoat_dong || []).filter(x => boSungDuocPhep.has(x.key) || (canh_bao.push(`Bỏ qua bổ sung ${x.key}: không được yêu cầu`), false));
  if (!d.viec?.yccd_thieu?.length) ai.them_muc_tieu_kien_thuc = [];
}

// ===== 1S. SOẠN KHBD MỚI từ tài liệu chuyên đề (node 08 nhận ra file chưa phải KHBD) =====
// Nội dung tài liệu (khối M…, BT…) được chèn NGUYÊN VĂN vào đúng hoạt động AI chọn; AI chỉ viết khung CV 5512 (màu xanh).
const soanMoi = !!d.soan_moi;
const PL_MARK = "%%==PHU_LUC_TAI_LIEU==";
const KY_MARK = "%%==KY_DUYET==";      // khối Ký duyệt chuẩn (mục 2e)
const aiChon = (d.viec?.nang_luc_ai || d.viec?.soan_khbd_tu_tai_lieu ? (ai?.nang_luc_ai || []) : [])
  .filter(x => x && AIM[x.ma] && typeof x.tex === "string" && x.tex.trim() && canBang(x.tex)).slice(0, 2);
if (soanMoi) {
  W.day_du = false;                       // Word gốc không có phần này → Word chuyển từ .tex
  const L = meta.lesson || {};
  const pp = d.ppct || meta.ppct || {};
  const K = d.khoi_tai_lieu || {};
  const dy = d.dan_y || {};
  const nlsPP = (pp.nls || []).filter(c => NLS[c]);
  const ds = (arr, mau) => "\\begin{itemize}\n" + arr.map(x => `\\item ${mau ? mau(x) : x}\n`).join("") + "\\end{itemize}\n";
  const TD = t => `\n{\\noindent\\textbf{${t}}\\par}\n\n`;
  const ok = s => typeof s === "string" && s.trim() && canBang(s);
  const sach = s => String(s || "").replace(/[{}\\]/g, "");
  const xanh = s => `{\\color[HTML]{0070C0}${s}}`;

  // --- Mục tiêu ---
  const ktAI = (ai?.muc_tieu_kien_thuc || []).filter(ok);
  const ktPP = (meta.yccd || []).map(y => y.content).filter(Boolean);
  const nl = (arr, macDinh) => {
    const v = (Array.isArray(arr) ? arr : []).filter(x => x && ok(String(x.bieu_hien || "")) && String(x.ten || "").trim());
    return v.length ? ds(v, x => `\\textit{${sach(x.ten)}:} ${xanh(x.bieu_hien)}`) : ds(macDinh);
  };
  let khbd = `{\\centering\\fontsize{15}{18}\\selectfont\\textbf{KẾ HOẠCH BÀI DẠY}\\par}\n\n` +
    `{\\centering\\fontsize{14}{17}\\selectfont\\textbf{${String(L.bai || "").toUpperCase()}}\\par}\n\n` +
    (L.so_tiet ? `{\\centering\\textit{(${L.so_tiet} tiết)}\\par}\n\n` : "") +
    TD("I. MỤC TIÊU") + TD("1. Kiến thức") + "Học xong chuyên đề này, HS đạt các yêu cầu sau:\n\n" +
    ds([...ktPP, ...ktAI.map(xanh)]) +
    TD("2. Năng lực") + "\\textit{\\textbf{Năng lực chung:}}\n\n" +
    nl(ai?.nang_luc_chung, ["Năng lực tự chủ và tự học: tự nghiên cứu tài liệu chuyên đề, tự giải các bài tập.",
        "Năng lực giao tiếp và hợp tác: trình bày lời giải, thảo luận nhóm, phản biện.",
        "Năng lực giải quyết vấn đề và sáng tạo: chuyển bài toán về mô hình phù hợp, tìm nhiều cách giải."]) +
    "\\textit{\\textbf{Năng lực đặc thù:}}\n\n" +
    nl(ai?.nang_luc_dac_thu, ["Năng lực tư duy và lập luận toán học", "Năng lực mô hình hoá toán học", "Năng lực giải quyết vấn đề toán học",
        "Năng lực giao tiếp toán học", "Năng lực sử dụng công cụ, phương tiện học toán"]) +
    "\\textcolor[HTML]{EE0000}{\\textit{\\textbf{Năng lực số:}}}\n\n" +
    (nlsPP.length ? ds(nlsPP, c => DO(`${c}: ${NLS[c]}`)) : "\n") +
    (aiChon.length ? "\textcolor[HTML]{EE0000}{\textit{\textbf{Năng lực AI (QĐ 2422/QĐ-BGDĐT):}}}\n\n" +
      ds([...new Set(aiChon.map(x => x.ma))], c => DO(`${c}: ${AIM[c]}`)) : "") +
    TD("3. Phẩm chất") +
    nl(ai?.pham_chat, ["Chăm chỉ: tích cực, kiên trì giải các bài toán khó.", "Trung thực: trình bày đúng kết quả, ghi rõ nguồn khi tham khảo tài liệu, công cụ số và AI.",
        "Trách nhiệm: hoàn thành nhiệm vụ cá nhân và nhóm."]) +
    TD("II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU") +
    ds(["\\textbf{GV:} Kế hoạch bài dạy, tài liệu chuyên đề, phiếu bài tập, máy chiếu/ti vi." +
          ((pp.thiet_bi || []).length ? " Thiết bị mượn: " + pp.thiet_bi.map(t => `${t.ten} (mã ${t.ma})`).join("; ") + "." : ""),
        "\\textbf{HS:} Tài liệu chuyên đề, vở ghi, dụng cụ học tập."]) +
    TD("III. TIẾN TRÌNH DẠY HỌC");

  const pb = (ai?.phan_bo || []).filter(x => ok(String(x.tiet || "")) && ok(String(x.noi_dung || "")));
  if (pb.length) khbd += "\\textit{Phân bố thời lượng:}\n\n" + ds(pb, x => xanh(`Tiết ${x.tiet}: ${x.noi_dung}`));

  // --- Hoạt động ---
  const nlsHD = {};
  for (const x of aiChon) (nlsHD[x.key] = nlsHD[x.key] || []).push(`${x.ma} (năng lực AI): ${x.tex.replace(x.ma, "").replace(/^[\s:–-]+/, "")}`);
  for (const x of ai?.nls_trong_hoat_dong || []) {
    if (nlsPP.includes(x.ma) && ok(x.tex)) (nlsHD[x.key] = nlsHD[x.key] || []).push(x.tex.startsWith(x.ma) ? x.tex : `${x.ma}: ${x.tex}`);
  }
  const daDung = new Set();
  const layKhoi = ids => (Array.isArray(ids) ? ids : []).map(String).filter(id => K[id] && !daDung.has(id)).map(id => { daDung.add(id); return id; });
  const KEY_RX = /^hd_(mo_dau|hinh_thanh|luyen_tap|van_dung)(_\d+)?$/;
  const nhom = k => k.replace(/^hd_/, "").replace(/_\d+$/, "");
  const hds = (ai?.hoat_dong || []).filter(h => h && KEY_RX.test(h.key || ""));
  for (const h of hds) h._khoi = layKhoi(h.dung);
  // Khối lý thuyết AI bỏ sót → thêm hoạt động hình thành riêng (để không mất nội dung)
  for (const m of dy.muc || []) {
    if (daDung.has(m.id) || !K[m.id]) continue;
    const htCuoi = hds.filter(h => nhom(h.key) === "hinh_thanh").length;
    hds.push({ key: "hd_hinh_thanh_" + (htCuoi + 1), ten: m.ten, _khoi: layKhoi([m.id]), _tu_them: true });
    if (ai) canh_bao.push(`AI chưa xếp phần "${m.ten}" – đã tự thêm thành hoạt động hình thành riêng`);
  }
  const conLai = (dy.bai_tap || []).map(b => b.id).filter(id => K[id] && !daDung.has(id));

  const viet = (nhan, v) => ok(String(v || "")) ? `\\textbf{${nhan}} ${xanh(v)}\n\n` : "";
  const hdTex = (h, tieuDe) => {
    let t = `{\\noindent\\textbf{${tieuDe}}${h.tiet ? ` \\textit{(Tiết ${sach(h.tiet)})}` : ""}\\par}\n\n`;
    t += viet("a) Mục tiêu:", h.muc_tieu);
    t += "\\textbf{b) Nội dung:}\n\n";
    if (ok(String(h.tinh_huong || ""))) t += xanh(h.tinh_huong) + "\n\n";
    if (h._khoi?.length) {
      t += (nhom(h.key) === "hinh_thanh" ? "HS nghiên cứu nội dung sau (GV dẫn dắt, phân tích):\n\n" : "HS thực hiện các bài tập sau:\n\n") +
           h._khoi.map(id => K[id]).join("\n\n") + "\n\n";
    }
    t += viet("c) Sản phẩm:", h.san_pham);
    const buoc = [["b1", "Bước 1: Chuyển giao nhiệm vụ."], ["b2", "Bước 2: Thực hiện nhiệm vụ."], ["b3", "Bước 3: Báo cáo, thảo luận."], ["b4", "Bước 4: Kết luận, nhận định."]];
    if (buoc.some(([k]) => ok(String(h[k] || "")))) {
      t += "\\textbf{d) Tổ chức thực hiện:}\n\n" + buoc.map(([k, n]) => viet(n, h[k] || "(GV bổ sung)")).join("");
    } else {
      t += "\\textbf{d) Tổ chức thực hiện:} " + xanh("(Chưa soạn được – GV bổ sung 4 bước: Chuyển giao, Thực hiện, Báo cáo thảo luận, Kết luận nhận định.)") + "\n\n";
    }
    return t + (nlsHD[h.key] || []).map(x => DO(x) + "\n\n").join("");
  };
  const TIEU = { mo_dau: "1. HOẠT ĐỘNG MỞ ĐẦU", hinh_thanh: "2. HOẠT ĐỘNG HÌNH THÀNH KIẾN THỨC MỚI", luyen_tap: "3. HOẠT ĐỘNG LUYỆN TẬP", van_dung: "4. HOẠT ĐỘNG VẬN DỤNG" };
  const SO = { mo_dau: 1, hinh_thanh: 2, luyen_tap: 3, van_dung: 4 };
  let soAI = 0;
  for (const k of ["mo_dau", "hinh_thanh", "luyen_tap", "van_dung"]) {
    const cua = hds.filter(h => nhom(h.key) === k);
    khbd += TD(TIEU[k]);
    if (!cua.length) {
      khbd += xanh("(Chưa soạn được phần này – gửi lại để AI viết.)") + "\n\n";
      if (k !== "luyen_tap" || !conLai.length) canh_bao.push(`Thiếu ${TIEU[k].replace(/^\d\.\s*/, "")}`);
      continue;
    }
    cua.forEach((h, i) => {
      if (!h._tu_them) soAI++;
      const ten = sach(h.ten) || TIEU[k].replace(/^\d\.\s*HOẠT ĐỘNG\s*/, "");
      khbd += hdTex(h, cua.length > 1 || k === "hinh_thanh" ? `Hoạt động ${SO[k]}.${i + 1}: ${ten}` : `Hoạt động ${SO[k]}: ${ten}`);
    });
  }
  if (conLai.length) {
    khbd += TD("* BÀI TẬP TỰ LUYỆN (giao về nhà)") + conLai.map(id => K[id]).join("\n\n") + "\n\n";
  }
  const soKhoi = Object.keys(K).length;
  if (soAI) da_sua.push(`Soạn mới KHBD theo CV 5512: ${soAI} hoạt động; ${soKhoi - conLai.length}/${soKhoi} phần lý thuyết, bài tập của tài liệu được xếp vào hoạt động` + (conLai.length ? `, ${conLai.length} bài giao về nhà` : ""));
  else canh_bao.push("AI chưa soạn được tiến trình – đã tự xếp nội dung tài liệu vào các hoạt động, cần gửi lại để AI viết mục tiêu, sản phẩm, 4 bước.");
  if (dy.so_hinh_chua_chuyen) canh_bao.push(`Tài liệu có ${dy.so_hinh_chua_chuyen} hình .emf/.wmf chưa chuyển được – xuất lại bằng Word2Tex bản mới.`);

  // Ghép: preamble gốc + KHBD (nội dung tài liệu đã nằm trong các hoạt động)
  const i0 = tex.indexOf("\\begin{document}");
  tex = (i0 >= 0 ? tex.slice(0, i0 + 16) : "\\begin{document}") + "\n" + khbd + "\n\\end{document}\n";
  if (ai) { ai.them_muc_tieu_kien_thuc = []; ai.bo_sung_hoat_dong = []; ai.hoat_dong_moi = []; (ai.nls_trong_hoat_dong || []).forEach(x => { x._da_dung = true; }); }
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
    if (ok) { W.day_du = false; da_sua.push(`Viết thêm ${SO[x.key].replace(/^\d\.\s*/, "")}` + (nlsMoi[x.key] ? ` (kèm ${nlsMoi[x.key].length} mã NLS)` : "")); }
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
    if (chen(S[x.key], "\n\n" + DO(dong) + "\n")) { da_sua.push(`Gắn ${x.ma} vào ${x.key}`); W.hoat_dong.push({ tieu_de: tieuDe(x.key), dong }); }
  }
  // 1f. Năng lực AI (QĐ 2422) vào hoạt động
  if (!soanMoi) for (const x of aiChon) {
    const key = S[x.key] ? x.key : Object.keys(S).find(k => /^hd_/.test(k));
    const dong = `${x.ma} (năng lực AI): ${x.tex.replace(x.ma, "").replace(/^[\s:–-]+/, "")}`;
    if (key && chen(S[key], "\n\n" + DO(dong) + "\n")) { da_sua.push(`Gắn năng lực AI ${x.ma} vào ${key}`); W.hoat_dong.push({ tieu_de: tieuDe(key), dong }); }
    else canh_bao.push(`Không tìm thấy hoạt động để gắn năng lực AI ${x.ma}`);
  }
}

// ===== 1e. HỖ TRỢ HS KHUYẾT TẬT HỌC HOÀ NHẬP (chỉ khi GV yêu cầu) =====
// Căn cứ: TT 03/2018/TT-BGDĐT (kế hoạch giáo dục cá nhân), đánh giá theo Điều 11 TT 22/2021/TT-BGDĐT.
// - Trong TỪNG hoạt động: đoạn "Hỗ trợ HS …" (màu tím) nói cụ thể cách em tham gia (lên bảng, nhóm, trò chơi…)
// - Mục IV: kế hoạch hỗ trợ (thông tin, mục tiêu điều chỉnh, chuẩn bị, đánh giá, phối hợp)
// AI không biết tên thật ("HS A"); tên được điền lại ở đây. AI thiếu phần nào → dùng quy tắc theo dạng khuyết tật.
const hskt = meta.request?.hs_khuyet_tat || d.request?.hs_khuyet_tat ||
  (d.hoa_nhap?.co ? { ten: d.hoa_nhap.ten, mo_ta: d.hoa_nhap.mo_ta } : null);   // GV đã viết sẵn phần hoà nhập trong giáo án
// chữ thường cho Word (bỏ lệnh LaTeX)
const phang = x => String(x || "").replace(/\\textit\{([^{}]*)\}/g, "$1").replace(/\\textbf\{([^{}]*)\}/g, "$1")
  .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ").replace(/[{}]/g, "").replace(/\$([^$]*)\$/g, "$1").replace(/\s+/g, " ").trim();
if (hskt) {
  if (d.hoa_nhap?.co) W.day_du = false;   // GV đã viết sẵn phần hoà nhập (bot thay thế) → Word chuyển từ .tex
  const tenHS = hskt.ten ? `HS ${hskt.ten}` : "HS khuyết tật";
  const thayTen = x => String(x || "").replace(/\b(HS|học sinh|Học sinh|em) A\b/g, tenHS).replace(/\bHS A\b/g, tenHS);
  const TIM = c => `{\\color[HTML]{7030A0}${c}}`;
  const hop = x => typeof x === "string" && x.trim() && canBang(x);
  let cnh = ai?.ca_nhan_hoa;
  if (typeof cnh === "string") cnh = cnh.trim() ? { thong_tin: cnh } : null;
  cnh = cnh && typeof cnh === "object" ? cnh : {};

  // --- Quy tắc theo dạng khuyết tật (dự phòng khi AI không viết / viết thiếu) ---
  const moTa = String(hskt.mo_ta || "").toLowerCase().normalize("NFC");
  const QT = {
    van_dong: { rx: /chân|tay|đi lại|đi đứng|xe lăn|vận động|nạng|bại não|liệt|khớp/, ten: "khuyết tật vận động", mt_rieng: "Vận động và an toàn: tham gia đầy đủ hoạt động học tại chỗ, không phải di chuyển xa; bảo đảm an toàn khi đi lại trong lớp.",
      muc_tieu: "Giữ nguyên yêu cầu cần đạt của bài như các bạn; tạo điều kiện để em tham gia đầy đủ các hoạt động mà không phải di chuyển nhiều.",
      chuan_bi: "Xếp em ngồi bàn đầu, gần lối đi và cửa lớp; lối đi thông thoáng; chuẩn bị bảng con hoặc giấy A4 để em trình bày tại chỗ; phân công 1–2 bạn ngồi cạnh hỗ trợ khi cần (lấy đồ dùng, chuyển phiếu học tập).",
      bang: "không gọi em lên bảng; em làm vào bảng con hoặc giấy A4 tại chỗ, GV chụp ảnh hoặc dùng máy chiếu vật thể đưa bài lên màn hình, em trình bày miệng tại chỗ (được ngồi khi trình bày).",
      nhom: "nhóm của em được bố trí ngay tại bàn em ngồi, các bạn trong nhóm di chuyển đến; em nhận vai trò thư kí hoặc đại diện trình bày tại chỗ; GV mang phiếu học tập, đồ dùng đến tận chỗ.",
      tro_choi: "em trả lời bằng bảng con, thẻ hoặc ứng dụng trên điện thoại tại chỗ; phần chơi phải chạy, di chuyển thì em làm trọng tài, ghi điểm hoặc trả lời miệng thay cho đội.",
      chung: "em làm nhiệm vụ tại chỗ như các bạn; không yêu cầu đứng lâu hay di chuyển; GV chủ động đến chỗ em để quan sát, hỗ trợ.",
      danh_gia: "Cùng yêu cầu cần đạt về kiến thức, kĩ năng như các bạn; chỉ điều chỉnh hình thức: trình bày tại chỗ, nộp bài trên giấy hoặc ảnh chụp thay cho làm trên bảng; không trừ điểm vì không lên bảng hay không tham gia phần phải di chuyển.",
      phoi_hop: "Trao đổi với gia đình, GV chủ nhiệm về sức khoẻ và việc đi lại của em; cho em ra vào lớp trước hoặc sau các bạn 2–3 phút để tránh chen lấn; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." },
    khiem_thi: { rx: /khiếm thị|mắt|nhìn|thị lực|mù/, ten: "khiếm thị", mt_rieng: "Tiếp cận thông tin: đọc được tài liệu, hình vẽ đã phóng to; theo dõi được nội dung GV đọc, mô tả.",
      muc_tieu: "Giữ nguyên yêu cầu cần đạt; bảo đảm em tiếp cận được đầy đủ nội dung ghi bảng, hình vẽ.",
      chuan_bi: "Xếp em ngồi bàn đầu, chính giữa, đủ ánh sáng; phiếu học tập in cỡ chữ lớn (16–18), hình vẽ nét đậm; cho phép dùng kính lúp hoặc điện thoại để phóng to.",
      bang: "em làm tại chỗ trên giấy cỡ lớn; GV đọc to đề bài và mô tả hình vẽ trên bảng.",
      nhom: "bạn cùng nhóm đọc to nội dung, mô tả hình vẽ cho em; em phụ trách phần lập luận, trình bày miệng.",
      tro_choi: "câu hỏi được GV đọc to; em trả lời miệng hoặc giơ thẻ chữ lớn.",
      chung: "GV đọc to nội dung trình chiếu, mô tả hình vẽ; cho em thêm thời gian làm bài.",
      danh_gia: "Cùng yêu cầu cần đạt; đề in cỡ chữ lớn, thêm thời gian; có thể kiểm tra miệng phần cần đọc hình.",
      phoi_hop: "Trao đổi với gia đình về thị lực, kính, phương tiện hỗ trợ; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." },
    khiem_thinh: { rx: /khiếm thính|tai|nghe kém|điếc|thính lực/, ten: "khiếm thính", mt_rieng: "Tiếp nhận thông tin: nắm được yêu cầu qua chữ viết, hình ảnh; trình bày được bằng chữ viết.",
      muc_tieu: "Giữ nguyên yêu cầu cần đạt; bảo đảm em tiếp nhận đầy đủ yêu cầu bằng hình ảnh, chữ viết.",
      chuan_bi: "Xếp em ngồi bàn đầu, nhìn rõ mặt GV và bảng; mọi yêu cầu, câu hỏi đều ghi lên bảng hoặc trình chiếu; video có phụ đề.",
      bang: "GV ghi rõ yêu cầu lên bảng; em có thể trình bày bằng cách viết thay cho nói.",
      nhom: "nhóm ghi chép thảo luận ra giấy để em theo dõi; em phụ trách phần viết, trình bày lời giải.",
      tro_choi: "câu hỏi được chiếu, ghi trên màn hình; em trả lời bằng thẻ, bảng con.",
      chung: "GV nói rõ, chậm, quay mặt về phía lớp khi nói; kiểm tra lại xem em đã nắm yêu cầu chưa.",
      danh_gia: "Cùng yêu cầu cần đạt; ưu tiên hình thức viết thay cho vấn đáp.",
      phoi_hop: "Trao đổi với gia đình về máy trợ thính, cách giao tiếp phù hợp; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." },
    tri_tue: { rx: /trí tuệ|chậm phát triển|chậm hiểu|tiếp thu chậm|khó khăn về học|khuyết tật học tập/, ten: "khó khăn về học tập", mt_rieng: "Kĩ năng học tập: hoàn thành các nhiệm vụ đã chia nhỏ, có ví dụ mẫu; tiến bộ so với chính em.",
      muc_tieu: "Điều chỉnh theo kế hoạch giáo dục cá nhân: tập trung vào các yêu cầu cần đạt cốt lõi ở mức nhận biết, thông hiểu.",
      chuan_bi: "Phiếu học tập riêng, ít bước, có ví dụ mẫu; xếp em ngồi gần GV và cạnh bạn học tốt hỗ trợ.",
      bang: "em làm bài tập đã được giảm bước tại chỗ hoặc lên bảng làm câu dễ để tạo hứng thú, có gợi ý từng bước.",
      nhom: "em nhận nhiệm vụ vừa sức trong nhóm (đọc đề, ghi kết quả), bạn trong nhóm hướng dẫn lại.",
      tro_choi: "câu hỏi mức nhận biết dành riêng cho em; khen ngợi kịp thời.",
      chung: "giao nhiệm vụ ngắn, chia nhỏ từng bước, có ví dụ mẫu; cho thêm thời gian.",
      danh_gia: "Đánh giá theo mức độ tiến bộ so với mục tiêu trong kế hoạch giáo dục cá nhân (Điều 11 TT 22/2021/TT-BGDĐT).",
      phoi_hop: "Phối hợp gia đình ôn tập ở nhà theo phiếu riêng; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." },
    tu_ky: { rx: /tự kỷ|tự kỉ|phổ tự kỷ/, ten: "rối loạn phổ tự kỷ", mt_rieng: "Hành vi, giao tiếp: theo được trình tự tiết học, tham gia nhóm nhỏ với vai trò rõ ràng.",
      muc_tieu: "Theo kế hoạch giáo dục cá nhân; ưu tiên duy trì nề nếp, tham gia học tập ổn định.",
      chuan_bi: "Chỗ ngồi cố định, ít bị phân tán; thông báo trước trình tự các hoạt động của tiết học.",
      bang: "báo trước cho em khi sẽ được gọi; cho phép trả lời tại chỗ.",
      nhom: "nhóm nhỏ, bạn quen; giao vai trò rõ ràng, cụ thể.",
      tro_choi: "giải thích luật chơi rõ ràng, có thể cho em quan sát trước rồi tham gia.",
      chung: "hướng dẫn ngắn gọn, trực quan; tránh thay đổi đột ngột.",
      danh_gia: "Theo kế hoạch giáo dục cá nhân, ghi nhận sự tiến bộ (Điều 11 TT 22/2021/TT-BGDĐT).",
      phoi_hop: "Phối hợp gia đình, GV chủ nhiệm theo dõi cảm xúc, hành vi; ghi nhận vào kế hoạch giáo dục cá nhân." },
    tang_dong: { rx: /tăng động|giảm chú ý|adhd/, ten: "tăng động, giảm chú ý", mt_rieng: "Tập trung, nề nếp: duy trì chú ý trong từng nhiệm vụ ngắn, tham gia tích cực theo luật.",
      muc_tieu: "Giữ yêu cầu cần đạt; chia nhỏ nhiệm vụ để em duy trì tập trung.",
      chuan_bi: "Ngồi gần GV, xa cửa sổ; giao việc ngắn, có thời hạn rõ ràng.",
      bang: "cho em lên bảng làm câu ngắn để vận động hợp lí.",
      nhom: "giao vai trò cụ thể (phát phiếu, bấm giờ, ghi kết quả).",
      tro_choi: "tận dụng trò chơi để em tham gia tích cực, nhắc luật rõ ràng.",
      chung: "chia nhiệm vụ thành nhiều bước ngắn, nhắc nhở nhẹ nhàng, khen kịp thời.",
      danh_gia: "Cùng yêu cầu cần đạt; chia bài kiểm tra thành nhiều phần ngắn.",
      phoi_hop: "Phối hợp gia đình duy trì nề nếp; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." },
    ngon_ngu: { rx: /nói lắp|nói ngọng|ngôn ngữ|câm|khó nói/, ten: "khó khăn về ngôn ngữ, giao tiếp", mt_rieng: "Giao tiếp: tự tin thể hiện ý kiến bằng lời nói hoặc chữ viết.",
      muc_tieu: "Giữ yêu cầu cần đạt; cho em thể hiện bằng nhiều hình thức.",
      chuan_bi: "Chuẩn bị thẻ, bảng con để em trả lời bằng chữ viết.",
      bang: "em trình bày lời giải bằng chữ viết, không bắt buộc thuyết trình.",
      nhom: "em phụ trách phần viết; bạn khác trình bày miệng.",
      tro_choi: "em trả lời bằng thẻ, bảng con.",
      chung: "kiên nhẫn chờ em nói hết, không ngắt lời; cho phép trả lời bằng chữ viết.",
      danh_gia: "Cùng yêu cầu cần đạt; ưu tiên hình thức viết thay cho vấn đáp.",
      phoi_hop: "Phối hợp gia đình, tạo môi trường để em tự tin giao tiếp; ghi nhận vào kế hoạch giáo dục cá nhân." }
  };
  let dang = Object.keys(QT).filter(k => QT[k].rx.test(moTa));
  const CHUNG = { ten: "khuyết tật", mt_rieng: "Tham gia học tập phù hợp với khả năng, theo kế hoạch giáo dục cá nhân.", muc_tieu: "Theo kế hoạch giáo dục cá nhân của em; giữ yêu cầu cần đạt nếu khuyết tật không ảnh hưởng nhận thức.",
    chuan_bi: "Bố trí chỗ ngồi, phương tiện phù hợp với tình trạng của em; phân công bạn hỗ trợ.", bang: "cho em trình bày theo hình thức phù hợp (tại chỗ, viết thay nói…).",
    nhom: "giao vai trò phù hợp với khả năng của em trong nhóm.", tro_choi: "điều chỉnh cách tham gia để em không bị loại khỏi trò chơi.",
    chung: "GV theo dõi, hỗ trợ kịp thời, cho thêm thời gian khi cần.", danh_gia: "Theo Điều 11 TT 22/2021/TT-BGDĐT và kế hoạch giáo dục cá nhân của em.",
    phoi_hop: "Phối hợp gia đình, GV chủ nhiệm; ghi nhận tiến bộ vào kế hoạch giáo dục cá nhân." };
  const ds_qt = dang.length ? dang.map(k => QT[k]) : [CHUNG];
  const gop = f => ds_qt.map(q => q[f]).join(" ");
  const quyTacHD = texHD => {
    const t = String(texHD || "").toLowerCase();
    const phan = [];
    if (/lên bảng/.test(t)) phan.push("Khi gọi lên bảng: " + gop("bang"));
    if (/nhóm|thảo luận/.test(t)) phan.push("Khi hoạt động nhóm: " + gop("nhom"));
    if (/trò chơi|thi đua|tranh tài|ai nhanh/.test(t)) phan.push("Khi tổ chức trò chơi: " + gop("tro_choi"));
    if (!phan.length) phan.push(gop("chung").replace(/^./, c => c.toUpperCase()));
    return phan.join(" ");
  };

  // --- Đoạn hỗ trợ trong TỪNG hoạt động ---
  const aiHD = {};
  for (const x of Array.isArray(cnh.hoat_dong) ? cnh.hoat_dong : []) if (x && hop(x.dieu_chinh)) aiHD[x.key] = x.dieu_chinh;
  const dsHD = (d.kiem_tra?.hoat_dong || []).map(h => ({ key: h.key, ten: h.ten || h.key }));
  let soChen = 0, soQT = 0;
  const conLaiHD = [];
  for (const h of dsHD) {
    const nd = aiHD[h.key] ? thayTen(aiHD[h.key]) : (soQT++, quyTacHD(S[h.key]));
    if (S[h.key] && chen(S[h.key], "\n\n" + TIM(`\\textbf{* Hỗ trợ ${tenHS}:} ${nd}`) + "\n")) {
      soChen++; W.hoat_dong.push({ tieu_de: tieuDe(h.key), nhan: `* Hỗ trợ ${tenHS}:`, dong: phang(nd), mau: "tim" });
    }
    else conLaiHD.push(`\\textit{${String(h.ten).replace(/[{}\\]/g, "")}:} ${nd}`);
  }
  // Câu "Lưu ý…" chung chung GV viết lặp lại ở các hoạt động → đã có đoạn hỗ trợ cụ thể, bỏ đi
  const tenGoi = hskt.ten ? hskt.ten.split(" ").pop() : null;
  let soBoLuuY = 0;
  tex = tex.split("\n").filter(l => {
    if (l.length > 400 || /Hỗ trợ HS/.test(l)) return true;
    const coTen = hskt.ten && (l.includes(hskt.ten) || (tenGoi && new RegExp(`\\bem ${tenGoi}\\b`).test(l)));
    if (/^\s*[-–•]?\s*(\\textbf\{)?\s*Lưu ý\s*:?/.test(l) && (coTen || /khuyết tật|hòa nhập|hoà nhập/i.test(l))) { soBoLuuY++; return false; }
    return true;
  }).join("\n");

  // I.4 Mục tiêu giáo dục hoà nhập (thay mục GV viết sẵn, thường chép nhầm từ bài khác)
  const iTB = tex.search(/\\subsubsection\*?\{[^\n]*II\.\s*THIẾT BỊ|II\.\s*THIẾT BỊ/);
  const iI4 = tex.search(/[^\n]*Mục tiêu[^\n]{0,30}(h[oò]a nhập|hoà nhập)[^\n]*/i);
  if (iI4 >= 0 && iTB > iI4) {
    const dauDong = tex.lastIndexOf("\n", iI4) + 1;
    tex = tex.slice(0, dauDong) + tex.slice(iTB);
  }
  const mtAI = (Array.isArray(cnh.muc_tieu_hoa_nhap) ? cnh.muc_tieu_hoa_nhap : []).filter(hop).map(thayTen);
  const yc = (meta.yccd || []).map(y => String(y.content || "").replace(/[{}\\%&$#_^~]/g, " ")).filter(Boolean);
  const mtQT = [`Kiến thức, năng lực: ${gop("muc_tieu")}` + (yc.length ? ` Cụ thể: ${yc.slice(0, 2).join("; ").slice(0, 260)}.` : ""),
    "Tâm lí, kĩ năng xã hội: tự tin phát biểu, hợp tác với bạn; không cảm thấy tự ti hay bị tách khỏi tập thể.",
    ...ds_qt.map(q => q.mt_rieng)];
  const khoiI4 = `{\\noindent\\textbf{4. Mục tiêu giáo dục hoà nhập (dành cho ${tenHS} – ${ds_qt.map(q => q.ten).join(", ")})}\\par\\nopagebreak}\n\n` +
    "\\begin{itemize}\n" + (mtAI.length ? mtAI : mtQT).map(x => `\\item ${TIM(x)}\n`).join("") + "\\end{itemize}\n\n";
  const iTB2 = tex.search(/\\subsubsection\*?\{[^\n]*II\.\s*THIẾT BỊ|[^\n]*II\.\s*THIẾT BỊ/);
  if (iTB2 > 0) { const dd = tex.lastIndexOf("\n", iTB2) + 1; tex = tex.slice(0, dd) + khoiI4 + tex.slice(dd); }
  W.muc_tieu_hoa_nhap = { tieu_de: `4. Mục tiêu giáo dục hoà nhập (dành cho ${tenHS} – ${ds_qt.map(q => q.ten).join(", ")})`,
    y: (mtAI.length ? mtAI : mtQT).map(phang) };

  // soạn KHBD mới: hoạt động do AI soạn, không có sẵn trong file → liệt kê ở mục IV
  if (!dsHD.length) for (const [k, v] of Object.entries(aiHD)) conLaiHD.push(`\\textit{${k.replace(/^hd_/, "").replace(/_/g, " ")}:} ${thayTen(v)}`);

  // --- Mục IV: kế hoạch hỗ trợ ---
  const lay = (f, macDinh) => hop(cnh[f]) ? thayTen(cnh[f]) : macDinh;
  const dangTen = ds_qt.map(q => q.ten).join(", ");
  const thongTin = lay("thong_tin", `${tenHS}: ${dangTen} (theo GV: ${thayTen(String(hskt.mo_ta || "").replace(/^\s*(lớp\s*\d+\s*[,;]?\s*)?(bài\s*\d+\s*[,;.]?\s*)?/i, "")).replace(/[{}\\%&$#_^~]/g, " ").trim().slice(0, 200)}).`);
  // Bỏ mục IV GV viết sẵn (bảng kế hoạch cũ) – thay bằng bảng chuẩn ngay sau
  {
    const iIVcu = tex.search(/[^\n]*(KẾ HOẠCH[^\n]{0,60}(H[OÒ]A NHẬP|HOÀ NHẬP|KHUYẾT TẬT)|HỖ TRỢ[^\n]{0,40}KHUYẾT TẬT)/);
    if (iIVcu > 0) {
      const dd = tex.lastIndexOf("\n", iIVcu) + 1;
      const sau = tex.slice(dd);
      const kt = [sau.search(/[^\n]*(Ký|Kí) duyệt/), sau.indexOf(KY_MARK), sau.indexOf(PL_MARK), sau.lastIndexOf("\\end{document}")].filter(x => x > 0);
      if (kt.length) tex = tex.slice(0, dd) + sau.slice(Math.min(...kt));
    }
  }
  const o = x => TIM(x);
  const hang = [
    ["Môi trường, vị trí ngồi", lay("chuan_bi", gop("chuan_bi")), "GVCN, GV bộ môn, lớp trưởng"],
    ["Tham gia hoạt động học (nhóm, lên bảng, trò chơi)", conLaiHD.length ? "Theo từng hoạt động (mục 4 dưới bảng)." :
      `Theo đoạn \\textit{"Hỗ trợ ${tenHS}"} trong từng hoạt động ở mục III.`, "GV dạy Toán"],
    ["Kiểm tra, đánh giá (Điều 11 TT 22/2021/TT-BGDĐT)", lay("danh_gia", gop("danh_gia")), "GV dạy Toán"],
    ["Tâm lí, động viên", "Khen ngợi kịp thời sự tiến bộ; giao vai trò phù hợp để em tự tin; tập thể lớp thân thiện, không để em bị cô lập.", "GV, tập thể lớp"],
    ["Phối hợp gia đình", lay("phoi_hop", gop("phoi_hop")), "GVCN, phụ huynh"]
  ];
  const cot = (f) => `p{\\dimexpr ${f}\\linewidth-2\\tabcolsep-1.33\\arrayrulewidth\\relax}`;
  const bangIV = `\\begin{longtable}{|${cot(0.24)}|${cot(0.54)}|${cot(0.22)}|}\n\\hline\n` +
    `\\centering\\textbf{Nội dung điều chỉnh} & \\centering\\textbf{Biện pháp thực hiện} & \\centering\\textbf{Người thực hiện} \\tabularnewline\n\\hline\n\\endhead\n` +
    hang.map(([a, b, c]) => `${a}\n& ${o(b)}\n& ${c} \\tabularnewline\n\\hline\n`).join("") + "\\end{longtable}\n\n";
  const khoiIV = `\n\n\\subsubsection*{IV. KẾ HOẠCH HỖ TRỢ HỌC SINH KHUYẾT TẬT HỌC HOÀ NHẬP}\n\n` +
    `\\textit{(Căn cứ Thông tư 03/2018/TT-BGDĐT quy định về giáo dục hoà nhập đối với người khuyết tật; đánh giá theo Điều 11 Thông tư 22/2021/TT-BGDĐT.)}\n\n` +
    `\\textbf{1. Thông tin học sinh:} ${o(thongTin)}\n\n` +
    `\\textbf{2. Mục tiêu điều chỉnh:} ${o(lay("muc_tieu", gop("muc_tieu")))}\n\n` +
    `\\textbf{3. Biện pháp hỗ trợ:}\n\n` + bangIV +
    (conLaiHD.length ? `\\textbf{4. Điều chỉnh trong các hoạt động:}\n\n\\begin{itemize}\n` + conLaiHD.map(x => `\\item ${o(x)}\n`).join("") + "\\end{itemize}\n\n" : "") +
    `\\textbf{${conLaiHD.length ? 5 : 4}. Kết quả, điều chỉnh sau tiết dạy} \\textit{(GV ghi sau giờ dạy)}:\n\n\\noindent\\dotfill\n\n\\noindent\\dotfill\n\n`;
  W.ke_hoach_iv = {
    tieu_de: "IV. KẾ HOẠCH HỖ TRỢ HỌC SINH KHUYẾT TẬT HỌC HOÀ NHẬP",
    can_cu: "(Căn cứ Thông tư 03/2018/TT-BGDĐT quy định về giáo dục hoà nhập đối với người khuyết tật; đánh giá theo Điều 11 Thông tư 22/2021/TT-BGDĐT.)",
    muc: [["Thông tin học sinh", phang(thongTin)], ["Mục tiêu điều chỉnh", phang(lay("muc_tieu", gop("muc_tieu")))]],
    bang: hang.map(([a, b, c]) => [phang(a), phang(b), phang(c)]),
    con_lai: conLaiHD.map(phang)
  };
  // Mục IV đặt TRƯỚC "V. ĐIỀU CHỈNH…" (không có thì trước Ký duyệt / phụ lục / cuối bài)
  const iPL = tex.indexOf(PL_MARK);
  const iDoc0 = Math.max(0, tex.indexOf("\\begin{document}"));
  const mV = tex.slice(iDoc0).search(/[^\n]*\bV\.\s*ĐIỀU CHỈNH|[^\n]*\bV\.\s*(RÚT KINH NGHIỆM|GÓP Ý)/);
  const mKy = tex.slice(iDoc0).search(/[^\n]*(Ký|Kí) duyệt/);
  const cho = [mV, mKy].filter(x => x > 0).map(x => iDoc0 + x);
  const e = cho.length ? tex.lastIndexOf("\n", Math.min(...cho)) + 1 : (iPL >= 0 ? iPL : tex.lastIndexOf("\\end{document}"));
  if (e > 0) {
    tex = tex.slice(0, e) + khoiIV + tex.slice(e);
    da_sua.push(`Hoà nhập ${tenHS} (${dangTen}): mục tiêu I.4, hỗ trợ trong ${soChen || conLaiHD.length} hoạt động, bảng kế hoạch mục IV (TT 03/2018, Điều 11 TT 22/2021)` +
      (soBoLuuY ? `; thay ${soBoLuuY} câu "Lưu ý" chung chung` : ""));
  }
  if (soQT && ai) canh_bao.push(`AI chưa viết phần hỗ trợ cho ${soQT} hoạt động – đã điền theo quy tắc chung cho dạng ${dangTen}, thầy/cô xem lại.`);
}

// ===== 2. Sửa bằng code (0 token) =====
if (giuNguyen) da_sua.push("Giáo án đã đạt yêu cầu (CV 5512, YCCĐ, mã NLS theo PPCT, năng lực AI, thiết bị của tổ) – giữ nguyên, chỉ xuất lại .tex và Word");
if (!giuNguyen) {
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
const dauDong = i => (i < 0 ? i : tex.lastIndexOf("\n", i) + 1);   // chèn ở đầu dòng tiêu đề, không lọt vào giữa {\textbf{…}}
const iMT = tex.search(/I\.\s*MỤC TIÊU/iu), iTB = dauDong(tex.search(/II\.\s*THIẾT BỊ/iu));
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
  const trongHD = new Set([...(d.kiem_tra?.nls_hoat_dong || []), ...(ai?.nls_trong_hoat_dong || []).map(x => x.ma).filter(m => nlsDuocPhep.has(m)),
    ...(d.kiem_tra?.nls_ppct_thieu || [])]);     // mã PPCT ghi cho bài: luôn có trong Mục tiêu
  const them = [...trongHD].filter(m => !coMT.has(m) && NLS[m]).sort();
  // vị trí đầu dòng tiêu đề "Phẩm chất" (chèn trước nó khi không có danh sách itemize sau "Năng lực số")
  const viTriPC = () => { const k = mt.search(/(\d\.\s*)?(Về\s*)?phẩm chất\s*:?\s*\}/i); return k > 0 ? mt.lastIndexOf("\n", k) + 1 : mt.length; };
  if (them.length) {
    const j0 = mt.search(/Năng lực số/);
    const pc = viTriPC();
    let j1 = j0 >= 0 ? mt.indexOf("\\end{itemize}", j0) : -1;
    if (j1 > pc) j1 = -1;
    if (j1 > 0) mt = mt.slice(0, j1) + them.map(m => `\\item ${DO(`${m}: ${NLS[m]}`)}\n\n`).join("") + mt.slice(j1);
    else mt = mt.slice(0, pc) + "\\begin{itemize}\n" + them.map(m => `\\item ${DO(`${m}: ${NLS[m]}`)}\n`).join("") + "\\end{itemize}\n\n" + mt.slice(pc);
    da_sua.push(`Thêm vào Mục tiêu – Năng lực số các mã theo PPCT/đang dùng: ${them.join(", ")}`);
    W.nls_muc_tieu.push(...them.map(m => `${m}: ${NLS[m]}`));
  }
  // Năng lực AI (QĐ 2422) ở Mục tiêu
  const aiMa = [...new Set(aiChon.map(x => x.ma))];
  if (aiMa.length) {
    const pc = viTriPC();
    mt = mt.slice(0, pc) + `{\\noindent\\textcolor[HTML]{EE0000}{\\textit{\\textbf{+ Năng lực AI (QĐ 2422/QĐ-BGDĐT):}}}\\par}\n\\begin{itemize}\n` +
      aiMa.map(m => `\\item ${DO(`${m}: ${AIM[m]}`)}\n`).join("") + "\\end{itemize}\n\n" + mt.slice(pc);
    da_sua.push(`Thêm năng lực AI (QĐ 2422) vào Mục tiêu: ${aiMa.join(", ")}`);
    W.ai_muc_tieu.push(...aiMa.map(m => `${m}: ${AIM[m]}`));
  }
  tex = tex.slice(0, iMT) + mt + tex.slice(iTB);
}

// 2g. Thiết bị dạy học theo PPCT (kho thiết bị của tổ, có mã mượn): bổ sung vào mục II những thiết bị còn thiếu
if (!soanMoi) {
  const tbPP = (d.ppct || meta.ppct || {}).thiet_bi || [];
  const iII = tex.search(/II\.\s*THIẾT BỊ/iu), iIII = dauDong(tex.search(/III\.\s*TIẾN TRÌNH/iu));
  if (tbPP.length && iII >= 0 && iIII > iII) {
    let muc = tex.slice(iII, iIII);
    const chuII = muc.normalize("NFC").toLowerCase();
    const tuKhoa = t => String(t.ten || "").toLowerCase().replace(/\(.*?\)/g, "").split(/[\s,–-]+/).filter(w => w.length > 3);
    const thieu = tbPP.filter(t => !chuII.includes(String(t.ma).toLowerCase()) &&
      !(tuKhoa(t).length && tuKhoa(t).every(w => chuII.includes(w))));
    if (thieu.length) {
      const dong = `{\\color[HTML]{0070C0}\\textbf{Thiết bị mượn của tổ (theo PPCT):} ` +
        thieu.map(t => `${String(t.ten).replace(/[{}\\%&$#_^~]/g, " ")} (mã ${String(t.ma).replace(/[{}\\%&$#_^~]/g, "")})`).join("; ") + ".}";
      const e1 = muc.lastIndexOf("\\end{itemize}");
      if (e1 > 0) muc = muc.slice(0, e1) + `\n\\item ${dong}\n\n` + muc.slice(e1);
      else muc = muc.replace(/\s*$/, "") + `\n\n${dong}\n\n`;
      tex = tex.slice(0, iII) + muc + tex.slice(iIII);
      da_sua.push(`Bổ sung thiết bị theo PPCT vào mục II: ${thieu.map(t => t.ma).join(", ")}`);
      W.thiet_bi = "Thiết bị mượn của tổ (theo PPCT): " + thieu.map(t => `${t.ten} (mã ${t.ma})`).join("; ") + ".";
    }
  }
}

// 2e. Khối "Ký duyệt" cuối giáo án (Tổ trưởng chuyên môn – Giáo viên)
// Khối ký có sẵn trong file Word (bảng ẩn hẹp, lệch, dòng "Ký duyệt" lọt vào danh sách…) → xoá, thay bằng khối chuẩn:
// rộng hết trang, chia đôi hai bên, chữ ở chính giữa.
const coKySan = /Tổ trưởng|TỔ TRƯỞNG/.test(tex.slice(Math.max(0, tex.indexOf("\\begin{document}")))) && /(Ký|Kí) duyệt|KÝ DUYỆT/.test(tex);
if (!tex.includes(KY_MARK) && !coKySan) {      // giáo án đã có khối Ký duyệt → giữ nguyên của GV
  const iDoc = Math.max(0, tex.indexOf("\\begin{document}"));
  let than = tex.slice(iDoc), soXoaKy = 0;
  const laBangKy = b => b.length < 2000 && /Tổ trưởng|TỔ TRƯỞNG/.test(b) && /Giáo viên|GIÁO VIÊN|Người soạn|NGƯỜI SOẠN|Người duyệt/.test(b);
  than = than.replace(/\\begin\{center\}\s*\\begin\{(tabular\*?|tabularx|longtable)\}[\s\S]*?\\end\{\1\}\s*\\end\{center\}|(?:\\noindent\s*)?\\begin\{(tabular\*?|tabularx|longtable)\}[\s\S]*?\\end\{\2\}/g,
    b => laBangKy(b.normalize("NFC")) ? (soXoaKy++, "") : b);
  // dòng chỉ có chữ "Ký duyệt" (kể cả nằm trong danh sách / có màu, in đậm)
  than = than.split("\n").filter(l => {
    const t = l.replace(/\\item\b/g, "").replace(/\\fontsize\{[^}]*\}\{[^}]*\}/g, " ").replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{[0-9A-Fa-f]{6}\})?/g, " ").replace(/[{}~\\]/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
    if (l.length < 200 && /^(ký|kí) duyệt[\s.:]*$/i.test(t)) { soXoaKy++; return false; }
    return true;
  }).join("\n");
  tex = tex.slice(0, iDoc) + than;
  const KY = `

${KY_MARK}
\\par\\vspace{0.8cm}\\noindent
\\begin{minipage}{\\linewidth}
\\centering\\textbf{Ký duyệt}\\par\\vspace{2pt}
\\rule{\\linewidth}{0.6pt}\\par\\vspace{6pt}
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
  const iPL = tex.indexOf(PL_MARK);
  const e = iPL >= 0 ? iPL : tex.lastIndexOf("\\end{document}");
  if (e > 0) {
    tex = tex.slice(0, e) + KY + tex.slice(e);
    da_sua.push(soXoaKy ? "Thay khối Ký duyệt có sẵn bằng khối chuẩn (rộng hết trang, Tổ trưởng chuyên môn – Giáo viên)"
                        : "Thêm khối Ký duyệt (Tổ trưởng chuyên môn – Giáo viên)");
  }
}

}   // hết phần sửa (bỏ qua khi giữ nguyên)

// 2f. Hình ảnh: file .tex chỉ ghi đường dẫn tới hình, hình nằm ở thư mục riêng
const RX_IMG = /\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]+)\}/g;
const soHinh = (tex.match(RX_IMG) || []).length;
const hinhGui = [];
if (tuZip) {
  const theoTen = new Map();
  for (const h of tuZip.hinh || []) { theoTen.set(h.ten, h); theoTen.set(h.ten.replace(/\.[^.]+$/, ""), h); }
  const thieu = new Set();
  // Hình đặt cạnh file .tex trong zip trả về → đường dẫn chỉ còn tên file, mở ở đâu cũng thấy hình
  tex = tex.replace(RX_IMG, (all, opt, p) => {
    const h = theoTen.get(p.trim().split("/").pop());
    if (!h) { thieu.add(p.trim()); return all; }
    if (!hinhGui.includes(h)) hinhGui.push(h);
    return `\\includegraphics${opt || ""}{${h.ten}}`;
  });
  if (hinhGui.length) da_sua.push(`Giữ nguyên ${hinhGui.length} hình, đóng gói cùng file .tex`);
  if (thieu.size) canh_bao.push(`Không thấy ${thieu.size} hình trong file .zip: ${[...thieu].slice(0, 3).join(", ")}`);
} else if (soHinh) {
  canh_bao.push(`Giáo án có ${soHinh} hình nhưng chỉ gửi file .tex nên không có hình. Muốn nhận lại đủ hình: nén cả thư mục bài thành .zip rồi gửi (hoặc lưu file trả về vào đúng thư mục cũ, cạnh thư mục hình).`);
}

// 2g. Gói bclogo: nhiều máy (tectonic, MiKTeX mới cài) không có → dịch lỗi "bclogo.sty not found"
// Không dùng trong bài → chỉ nạp khi máy có; có dùng → gửi kèm bclogo.sty (lưu trong repo GiaoAn)
const styThem = [];
const RX_BC = /\\usepackage\[tikz\]\{bclogo\}/;
if (RX_BC.test(tex) && !/\\IfFileExists\{bclogo\.sty\}/.test(tex)) {
  const than = tex.slice(Math.max(0, tex.indexOf("\\begin{document}")));
  if (/\\begin\{bclogo\}|\\bclogo\b|\\bc(?:bombe|attention|danger|info|stop|note|crayon|loupe|lampe|book)\b/.test(than)) {
    const daCo = (tuZip?.sty || []).some(f => /^bclogo\.sty$/i.test(f.ten));
    if (!daCo) {
      try {
        const bc = await this.helpers.httpRequest({ url: "https://raw.githubusercontent.com/lantuan/GiaoAn/main/data/latex/bclogo.sty" });
        styThem.push({ ten: "bclogo.sty", mime: "text/x-tex", b64: Buffer.from(String(bc), "utf8").toString("base64") });
      } catch (e) { canh_bao.push("Bài dùng gói bclogo nhưng chưa tải được bclogo.sty – máy thiếu gói này sẽ dịch lỗi."); }
    }
  } else {
    tex = tex.replace(RX_BC, "\\IfFileExists{bclogo.sty}{\\usepackage[tikz]{bclogo}}{}");
  }
}

// 2i. GV muốn in chữ đen ("chữ đen", "màu đen", "in đen", "đen trắng", "bỏ màu") → bỏ mọi lệnh màu trong thân bài
const chuDen = /chữ đen|màu đen|in đen|đen trắng|bỏ màu|không (tô )?màu/i.test(String(meta.request?.original_text || "").normalize("NFC"));
if (chuDen) {
  const iDoc = Math.max(0, tex.indexOf("\\begin{document}"));
  const than = tex.slice(iDoc)
    .replace(/\\textcolor\[HTML\]\{[0-9A-Fa-f]{6}\}/g, "")
    .replace(/\\(color|cellcolor)\[HTML\]\{[0-9A-Fa-f]{6}\}/g, "")
    .replace(/\\textcolor\{[a-zA-Z!0-9]+\}/g, "");
  tex = tex.slice(0, iDoc) + than;
  da_sua.push("Chuyển toàn bộ chữ màu sang màu đen (theo yêu cầu)");
}

// ===== 3. Xuất file =====
// Tên lấy từ file gửi qua Telegram (đúng dấu tiếng Việt); tên file bên trong .zip có thể bị lỗi mã hoá khi giải nén
const tenGoc = (meta.file_name || (tuZip && tuZip.ten_tex) || `Bai_${meta.lesson?.bai_so || ""}.tex`).normalize("NFC");
const goc_ten = tenGoc.replace(/\.(tex|zip)$/i, "").replace(/_extest$/i, "").replace(/_CV5512$/i, "");
const fileName = goc_ten + "_CV5512.tex";
const binary = { data: await this.helpers.prepareBinaryData(Buffer.from(tex, "utf8"), fileName, "application/x-tex") };
// Nhánh .zip: thêm hình + .sty để node "12A_NEN_ZIP" nén lại
const dsSty = [...(tuZip?.sty || []), ...styThem];
const co_zip = (!!tuZip && hinhGui.length > 0) || dsSty.length > 0;
if (co_zip) {
  let i = 0;
  for (const f of [...hinhGui, ...dsSty]) {
    binary["f" + i] = await this.helpers.prepareBinaryData(Buffer.from(f.b64, "base64"), f.ten, f.mime);
    i++;
  }
}
// 3b. Word (Equation): gửi sang máy Mac của GV (app "Máy dịch PDF" chạy Tex2Word, đường hầm Cloudflare, địa chỉ do node 13 lưu)
let co_word = false, loiWord = null;
if (cache.pdf_url && cache.pdf_bi_mat) {
  try {
    const files = [{ ten: "giao_an.tex", b64: Buffer.from(tex, "utf8").toString("base64") },
      ...[...hinhGui, ...dsSty].map(f => ({ ten: f.ten, b64: f.b64 }))];
    const r = await this.helpers.httpRequest({
      method: "POST", url: cache.pdf_url + "/word", body: JSON.stringify({ files, ten_goc: goc_ten, them: { ...W, chu_den: chuDen } }),
      headers: { "Content-Type": "application/json", "X-Bi-Mat": cache.pdf_bi_mat },
      encoding: "arraybuffer", returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 300000
    });
    const buf = Buffer.from(r.body);
    if (r.statusCode === 200 && buf.slice(0, 2).toString() === "PK") {
      binary.f_word = await this.helpers.prepareBinaryData(buf, goc_ten + "_CV5512.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      co_word = true;
    } else {
      let m = ""; try { m = JSON.parse(buf.toString("utf8")).loi || ""; } catch (e) { m = "HTTP " + r.statusCode; }
      loiWord = "Máy Mac chuyển sang Word bị lỗi: " + String(m).slice(0, 300);
    }
  } catch (e) { loiWord = "Máy Mac đang tắt (hoặc app Máy dịch PDF đang tắt) – lần này chỉ có file .tex."; }
} else loiWord = "Chưa kết nối máy Mac (mở app \"Máy dịch PDF\") – lần này chỉ có file .tex.";
if (loiWord) canh_bao.push(loiWord);
const co_zip2 = co_zip || co_word;          // có Word thì nén .tex + .docx (+ hình, .sty) thành một file .zip
const ds_binary = Object.keys(binary).join(",");
const zip_name = goc_ten + "_CV5512.zip";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Hết lượt AI miễn phí → OpenRouter tự chuyển sang model trả phí: báo token + chi phí lần chạy này
const u = inp.usage || {};
const traPhi = !!model_dung && !/:free$/.test(model_dung) && !(typeof u.cost === "number" && u.cost === 0);
let dongPhi = "";
if (traPhi) {
  const so = n => Number(n || 0).toLocaleString("vi-VN");
  const usd = typeof u.cost === "number" ? u.cost : null;
  // Tỷ giá thật USD→VND (open.er-api.com, miễn phí, cập nhật hằng ngày); lưu trong ngày; lỗi thì chỉ ghi USD
  let tyGia = null;
  if (usd !== null) {
    const ngay = new Date().toISOString().slice(0, 10);
    if (cache.ty_gia_ngay === ngay && cache.ty_gia_vnd) tyGia = cache.ty_gia_vnd;
    else {
      try {
        const r = await this.helpers.httpRequest({ url: "https://open.er-api.com/v6/latest/USD", json: true, timeout: 8000 });
        const v = Number(r?.rates?.VND);
        if (r?.result === "success" && v > 1000) { tyGia = v; cache.ty_gia_vnd = v; cache.ty_gia_ngay = ngay; }
      } catch (e) {}
    }
  }
  dongPhi = `💳 <b>Lượt AI miễn phí hôm nay đã hết</b> – lần này dùng AI trả phí (${esc(model_dung)}): ` +
    `${so(u.total_tokens)} token (gửi ${so(u.prompt_tokens)}, nhận ${so(u.completion_tokens)})` +
    (usd === null ? `; chi phí xem tại openrouter.ai/activity.`
      : `, chi phí trả OpenRouter: <b>${usd.toFixed(5)} USD</b>` +
        (tyGia ? ` (≈ ${so(Math.round(usd * tyGia))} đ, tỷ giá ${so(Math.round(tyGia))} đ/USD)` : "") + ".");
}
let caption = `<b>✅ ${soanMoi ? "Đã soạn KHBD theo CV 5512" : giuNguyen ? "Giáo án đã đạt yêu cầu – giữ nguyên" : "Đã chỉnh theo CV 5512"}: ${meta.lesson?.bai_so ? "Bài " + esc(meta.lesson.bai_so) + ". " : ""}${esc(meta.lesson?.bai)}</b>\n` +
  (dongPhi ? dongPhi + "\n" : "") +
  (da_sua.length ? da_sua.map(s => "• " + esc(s)).join("\n") : "Không có gì cần sửa.") +
  (canh_bao.length ? `\n<b>Lưu ý:</b>\n` + canh_bao.map(s => "• " + esc(s)).join("\n") : "") +
  (co_zip2 ? `\n📦 File .zip gồm giáo án${co_word ? " (.tex + Word .docx có Equation)" : ""}${hinhGui.length ? " + " + hinhGui.length + " hình" : ""}${dsSty.length ? " + " + dsSty.map(f => f.ten).join(", ") : ""} – giải nén rồi mở file Word (.docx) hoặc .tex.` : "") +
  (giuNguyen ? "" : `\n<i>${chuDen ? "Đã chuyển hết sang chữ đen – thầy/cô rà soát kỹ phần AI viết thêm." : "Phần màu xanh do AI viết – thầy/cô rà soát trước khi dùng."}${model_dung ? " (" + esc(model_dung) + ")" : ""}</i>`);
caption += ` <code>${BAN_LUONG}</code>`;
if (caption.length > 1000) {
  // cắt bớt nhưng không để thẻ HTML dở dang / chưa đóng (Telegram sẽ báo lỗi)
  caption = caption.slice(0, 985).replace(/<[^>]*$/, "").replace(/&[a-z]*$/, "") + "…";
  for (const t of ["b", "i"]) {
    const mo = (caption.match(new RegExp(`<${t}>`, "g")) || []).length, dong = (caption.match(new RegExp(`</${t}>`, "g")) || []).length;
    if (mo > dong) caption += `</${t}>`;
  }
}

return [{ json: { chat_id: meta.chat_id, message_id: meta.message_id, caption, da_sua, canh_bao, model_dung, tra_phi: traPhi, usage: u, file_name: fileName, co_zip: co_zip2, co_word, ds_binary, zip_name, them_word: { ...W, chu_den: chuDen } }, binary }];
