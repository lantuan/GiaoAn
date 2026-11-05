const d = $input.first().json;
const req = d.request;
const helpers = this.helpers;
const RAW = "https://raw.githubusercontent.com/lantuan/NganHangDe/main/data";
const cache = $getWorkflowStaticData("global");

const fail = msg => [{ json: { ...d, ok: false, error_message: msg } }];

if (!req.lesson_number) {
  return fail("Mình chưa nhận ra số bài. Bạn ghi chú thích kèm file theo mẫu: chỉnh sửa giáo án lớp 10, bài 12");
}

// Tải YCCĐ + PPCT của một khối lớp (lưu đệm)
async function taiLop(g) {
  const key = "toan" + g;
  if (!cache["yccd_" + key]) {
    let all = [];
    for (let c = 1; c <= 12; c++) {
      try {
        const r = await helpers.httpRequest({ url: `${RAW}/curriculum/${key}/L${g}_C${c}.json`, json: true });
        all = all.concat(r);
      } catch (e) {}
    }
    cache["yccd_" + key] = all.map(x => ({
      id: x.id, bai_so: String(x.bai_so), bai: x.bai, chuong: x.chuong,
      MucDo: x.MucDo, content: x.content, scope: x.scope
    }));
  }
  if (!cache["ppct_" + key]) {
    try { cache["ppct_" + key] = await helpers.httpRequest({ url: `${RAW}/ppct/${key}.json`, json: true }); }
    catch (e) { cache["ppct_" + key] = []; }
  }
  return { yccd: cache["yccd_" + key], ppct: cache["ppct_" + key] };
}

const norm = s => String(s || "").normalize("NFC").toLowerCase()
  .replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// Tìm bài: có lớp thì tìm đúng lớp, không có thì thử cả 10, 11, 12
const lopThu = req.grade ? [req.grade] : ["10", "11", "12"];
let found = [];
for (const g of lopThu) {
  const { yccd, ppct } = await taiLop(g);
  const rows = yccd.filter(x => x.bai_so === String(req.lesson_number));
  if (rows.length) found.push({ g, rows, ppct: ppct.filter(x => String(x.bai_so) === String(req.lesson_number)) });
}

// Nhiều lớp cùng có bài này thì so tên bài
if (found.length > 1 && req.lesson_title) {
  const t = norm(req.lesson_title);
  const hit = found.filter(f => { const b = norm(f.rows[0].bai); return b === t || b.includes(t) || t.includes(b); });
  if (hit.length) found = hit;
}

if (!found.length) {
  return fail(`Không tìm thấy YCCĐ của bài ${req.lesson_number}${req.grade ? " lớp " + req.grade : ""} (bộ Kết nối tri thức). Bạn kiểm tra lại giúp mình.`);
}
if (found.length > 1) {
  return fail(`Bài ${req.lesson_number} có ở lớp ${found.map(f => f.g).join(", ")}. Bạn ghi rõ lớp giúp mình, ví dụ: lớp 10, bài ${req.lesson_number}`);
}

const { g, rows, ppct } = found[0];

function demTiet(s) {
  return String(s || "").split(",").reduce((n, p) => {
    const m = p.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return n + (+m[2] - +m[1] + 1);
    return /^\d+$/.test(p.trim()) ? n + 1 : n;
  }, 0);
}
const so_tiet = ppct.reduce((n, x) => n + demTiet(x.tiet), 0) || null;

return [{
  json: {
    ...d,
    request: { ...req, grade: g },
    ok: true,
    error_message: null,
    lesson: {
      bai_so: req.lesson_number,
      bai: rows[0].bai,
      chuong: rows[0].chuong,
      hoc_ky: ppct[0]?.hoc_ky ?? null,
      tuan: ppct.length ? `${ppct[0].tuan_bat_dau}-${ppct[ppct.length - 1].tuan_ket_thuc}` : null,
      tiet_ppct: ppct.map(x => x.tiet).join(", ") || null,
      so_tiet: req.duration ? parseInt(req.duration) : so_tiet
    },
    yccd: rows.map(x => ({ id: x.id, MucDo: x.MucDo, content: x.content, scope: x.scope }))
  }
}];
