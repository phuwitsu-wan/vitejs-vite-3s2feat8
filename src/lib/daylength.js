// ความยาวช่วงกลางวัน (ชั่วโมง) จากละติจูดและวันที่ — สูตรดาราศาสตร์มาตรฐาน (ดวงอาทิตย์ที่ขอบฟ้า -0.833°)
const RAD = Math.PI / 180;
function dayOfYear(dateStr) {
  const y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7) - 1, d = +dateStr.slice(8, 10);
  return Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000);
}
export function daylengthHours(lat, dateStr) {
  const n = dayOfYear(dateStr);
  const decl = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + n) / 365);
  const x = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
  if (x >= 1) return 0;
  if (x <= -1) return 24;
  return 2 * Math.acos(x) / RAD / 15;
}
// วันแรกหลังครีษมายัน (ซีกโลกเหนือ) ที่กลางวันสั้นกว่า maxHours  คืน 'YYYY-MM-DD' หรือ null ถ้าไม่เกิดในปีนั้น
export function shortDayStart(lat, year, maxHours) {
  const h = maxHours || 12;
  const north = lat >= 0;
  const from = north ? Date.UTC(year, 5, 21) : Date.UTC(year, 11, 21);
  for (let i = 0; i < 200; i++) {
    const d = new Date(from + i * 86400000);
    const s = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    if (daylengthHours(lat, s) < h) return s;
  }
  return null;
}
export function photoInfo(crop, plot, dateStr) {
  if (!crop || !crop.photoperiod || !plot || plot.lat === null || plot.lat === undefined) return null;
  const pp = crop.photoperiod;
  const year = +dateStr.slice(0, 4);
  const hours = daylengthHours(plot.lat, dateStr);
  const shortFrom = shortDayStart(plot.lat, year, pp.maxHours);
  return { maxHours: pp.maxHours, hours: +hours.toFixed(2), shortFrom: shortFrom, ok: hours < pp.maxHours, gateKey: pp.gateKey };
}
