// 07C_LAY_TEX_TU_ZIP – đặt SAU node "07B_GIAI_NEN" (Compression → Decompress)
// Lấy file .tex trong zip + các hình được \includegraphics dùng + file .sty (ex_test.sty)
const item = $input.first();
const bin = item.binary || {};
const helpers = this.helpers;

const duongDan = k => `${bin[k].directory || ""}/${bin[k].fileName || ""}`;
const ten = k => String(bin[k].fileName || "").split("/").pop();
const keys = Object.keys(bin).filter(k => !/__MACOSX/.test(duongDan(k)) && !/^\._/.test(ten(k)) && !/^\./.test(ten(k)));
const doc = async (k, enc) => (await helpers.getBinaryDataBuffer(0, k)).toString(enc);

// 1. Chọn file .tex: ưu tiên bản ex_test (_extest), rồi file lớn nhất
const dsTex = [];
for (const k of keys.filter(k => /\.tex$/i.test(ten(k)))) {
  const s = (await doc(k, "utf8")).normalize("NFC");
  dsTex.push({ k, ten: ten(k).normalize("NFC"), s });
}
if (!dsTex.length) {
  return [{ json: { giao_an_tex: "", loi_zip: "Trong file .zip không có file .tex nào." } }];
}
dsTex.sort((a, b) =>
  (/_extest\.tex$/i.test(b.ten) || /\{ex_test\}/.test(b.s)) - (/_extest\.tex$/i.test(a.ten) || /\{ex_test\}/.test(a.s)) ||
  b.s.length - a.s.length);
const chon = dsTex[0];

// 2. Hình được dùng trong .tex (so theo tên file, có hoặc không có đuôi)
const thamChieu = new Set([...chon.s.matchAll(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)]
  .map(m => m[1].trim().split("/").pop()));
const coDung = n => thamChieu.has(n) || thamChieu.has(n.replace(/\.[^.]+$/, ""));
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", pdf: "application/pdf", eps: "application/postscript", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", svg: "image/svg+xml" };

const hinh = [], sty = [];
for (const k of keys) {
  const n = ten(k).normalize("NFC");
  const ext = (n.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (ext && MIME[ext] && coDung(n)) hinh.push({ ten: n, mime: MIME[ext], b64: await doc(k, "base64") });
  else if (ext === "sty" || ext === "cls") sty.push({ ten: n, mime: "text/x-tex", b64: await doc(k, "base64") });
}

return [{ json: { giao_an_tex: chon.s, ten_tex: chon.ten, hinh, sty, so_hinh_tham_chieu: thamChieu.size } }];
