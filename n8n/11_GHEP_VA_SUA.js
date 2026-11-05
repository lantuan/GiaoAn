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

let tex = goc.normalize("NFC");
const da_sua = [];
const canh_bao = [];
const XANH = c => `{\\color[HTML]{0070C0}\n${c}\n}`;           // phần AI viết: màu xanh để GV rà soát
const DO = c => `\\textcolor[HTML]{EE0000}{${c}}`;            // năng lực số: màu đỏ như giáo án gốc
const canBang = s => { let n = 0; for (const ch of s.replace(/\\[{}]/g, "")) { if (ch === "{") n++; if (ch === "}") n--; if (n < 0) return false; } return n === 0; };
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
if (soanMoi) {
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
    const iPL = tex.indexOf(PL_MARK);
    const e = iPL >= 0 ? iPL : tex.lastIndexOf("\\end{document}");
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
  const iPL = tex.indexOf(PL_MARK);
  const e = iPL >= 0 ? iPL : tex.lastIndexOf("\\end{document}");
  if (e > 0) { tex = tex.slice(0, e) + KY + tex.slice(e); da_sua.push("Thêm khối Ký duyệt (Tổ trưởng chuyên môn – Giáo viên)"); }
}

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

// ===== 3. Xuất file =====
// Tên lấy từ file gửi qua Telegram (đúng dấu tiếng Việt); tên file bên trong .zip có thể bị lỗi mã hoá khi giải nén
const tenGoc = (meta.file_name || (tuZip && tuZip.ten_tex) || `Bai_${meta.lesson?.bai_so || ""}.tex`).normalize("NFC");
const goc_ten = tenGoc.replace(/\.(tex|zip)$/i, "").replace(/_extest$/i, "");
const fileName = goc_ten + "_CV5512.tex";
const binary = { data: await this.helpers.prepareBinaryData(Buffer.from(tex, "utf8"), fileName, "application/x-tex") };
// Nhánh .zip: thêm hình + .sty để node "12A_NEN_ZIP" nén lại
const co_zip = !!tuZip && (hinhGui.length > 0 || (tuZip.sty || []).length > 0);
if (co_zip) {
  let i = 0;
  for (const f of [...hinhGui, ...(tuZip.sty || [])]) {
    binary["f" + i] = await this.helpers.prepareBinaryData(Buffer.from(f.b64, "base64"), f.ten, f.mime);
    i++;
  }
}
const ds_binary = Object.keys(binary).join(",");
const zip_name = goc_ten + "_CV5512.zip";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let caption = `<b>✅ ${soanMoi ? "Đã soạn KHBD theo CV 5512" : "Đã chỉnh theo CV 5512"}: ${meta.lesson?.bai_so ? "Bài " + esc(meta.lesson.bai_so) + ". " : ""}${esc(meta.lesson?.bai)}</b>\n` +
  (da_sua.length ? da_sua.map(s => "• " + esc(s)).join("\n") : "Không có gì cần sửa.") +
  (canh_bao.length ? `\n<b>Lưu ý:</b>\n` + canh_bao.map(s => "• " + esc(s)).join("\n") : "") +
  (co_zip ? `\n📦 File .zip gồm giáo án${hinhGui.length ? " + " + hinhGui.length + " hình" : ""} + ex_test.sty – giải nén rồi mở file .tex.` : "") +
  `\n<i>Phần màu xanh do AI viết – thầy/cô rà soát trước khi dùng.${model_dung ? " (" + esc(model_dung) + ")" : ""}</i>`;
if (caption.length > 1000) caption = caption.slice(0, 990) + "…";

return [{ json: { chat_id: meta.chat_id, message_id: meta.message_id, caption, da_sua, canh_bao, model_dung, file_name: fileName, co_zip, ds_binary, zip_name }, binary }];
