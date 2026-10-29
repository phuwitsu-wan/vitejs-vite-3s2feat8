// ไม้ผลยืนต้น: รอบการผลิตวนซ้ำทุกปี ผู้ใช้เลือก "เดือนเก็บเกี่ยว/เดือนตัดแต่งกิ่ง" แทนวันปลูก
// month-mode: เลื่อนเดือนทั้งตารางของพืช (stages + tasks ที่ผูกกับเดือน) ตามส่วนต่างจากเดือนมาตรฐาน
// dap-mode (ทุเรียน): ใช้วันเริ่มรอบ (เดือนตัดแต่งกิ่ง) เป็นจุดเริ่มนับวัน
import { CROPS } from '../data/crops.js';

const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function monthName(m) { return TH_M[((m - 1) % 12 + 12) % 12]; }
const wrap = function (m) { return ((m - 1) % 12 + 12) % 12 + 1; };
const cache = {};

export function isOrchard(crop) { return !!(crop && crop.orchard && crop.perennial); }

export function cropForPlot(plot) {
  const base = CROPS[plot.crop];
  const s = plot.shift || 0;
  if (!base || !s || !isOrchard(base) || base.stageMode !== 'month') return base;
  const key = base.id + ':' + s;
  if (cache[key]) return cache[key];
  const stages = base.stages.map(function (st) {
    const o = { months: (st.months || []).map(function (m) { return wrap(m + s); }) };
    if (st.span) o.span = [wrap(st.span[0] + s), wrap(st.span[1] + s)];
    return Object.assign({}, st, o);
  });
  const tasks = base.tasks.map(function (t) {
    if (t.trigger && t.trigger.by === 'month') return Object.assign({}, t, { trigger: Object.assign({}, t.trigger, { value: wrap(t.trigger.value + s) }) });
    return t;
  });
  cache[key] = Object.assign({}, base, { stages: stages, tasks: tasks, shift: s });
  return cache[key];
}

// วันแรกของ "เดือนเริ่มรอบ" ล่าสุดที่ไม่เกินวันนี้
export function cycleStartFor(crop, shift, todayStr) {
  const pm = wrap(crop.orchard.pruneMonth + (shift || 0));
  const td = new Date(todayStr + 'T00:00:00');
  let y = td.getFullYear();
  const mk = function (yy) { return yy + '-' + String(pm).padStart(2, '0') + '-01'; };
  if (mk(y) > todayStr) y--;
  return mk(y);
}

// รอบเกิน 1 ปีให้เลื่อนไปรอบปัจจุบัน (ไม้ผลวนรอบทุกปี)
export function rollPlot(plot, todayStr) {
  const base = CROPS[plot.crop];
  if (!isOrchard(base) || !plot.plantedAt) return plot;
  let d = plot.plantedAt;
  let guard = 0;
  while (guard++ < 50) {
    const next = (+d.slice(0, 4) + 1) + d.slice(4);
    if (next <= todayStr) d = next; else break;
  }
  return d === plot.plantedAt ? plot : Object.assign({}, plot, { plantedAt: d });
}
