import { CROPS } from '../data/crops.js';
import { monthPrimaryIdx, monthConcurrentKeys } from './stageMonth.js';
import { photoInfo } from './daylength.js';
import { cropForPlot } from './orchard.js';
import { today, addDays, diffDays, toDate, ymd } from './date.js';
import { pickScoutTargets, scoutTitle, weatherFeatures } from './scout.js';
import { phiLocks, harvestBlocked } from '../data/phi.js';

const FALLBACK_RATE = 12;   // GDD ต่อวัน กรณีข้อมูลไม่พอ
const RAIN_BLOCK = 10;      // มม. ที่ถือว่าฝนแรงพอจะเลื่อนงานไวฝน

// date.js: addDays() คืนค่าเป็น Date object (จำเป็นสำหรับ CalendarView ที่ต้องเรียก .getDate()/.getMonth())
// แต่ไฟล์นี้เก็บวันที่เป็น string "YYYY-MM-DD" ทุกจุด (เทียบ <, >, .slice() กับ series/tasks อื่น)
// การส่ง Date object ปนเข้าไปทำให้การเทียบ/slice พังแบบเงียบๆ หรือ error ตรงๆ (ต้นเหตุ error หน้ารายงาน)
// ใช้ wrapper นี้แทน addDays ทุกจุดในไฟล์นี้ เพื่อให้ผลลัพธ์เป็น string เสมอ
function addDaysStr(d, n) { return ymd(addDays(d, n)); }

export function gddOfDay(row, crop) {
  if (!row || row.tmax === undefined || row.tmax === null) return 0;
  const tmax = Math.min(row.tmax, crop.tcap);
  const tmin = Math.max(row.tmin, crop.tbase);
  if (tmax <= crop.tbase) return 0;
  const g = (tmax + tmin) / 2 - crop.tbase;
  return g > 0 ? g : 0;
}

export function buildGddCurve(series, plot) {
  const crop = cropForPlot(plot);
  const out = [];
  let cum = 0;
  for (let i = 0; i < series.length; i++) {
    const r = series[i];
    if (r.date < plot.plantedAt) continue;
    const d = gddOfDay(r, crop);
    cum += d;
    out.push({
      date: r.date, gdd: Math.round(cum), daily: +d.toFixed(1),
      isPast: r.isPast, tmax: r.tmax, tmin: r.tmin, rain: r.rain || 0
    });
  }
  return out;
}

export function gddRate(curve) {
  if (!curve || !curve.length) return FALLBACK_RATE;
  const n = Math.min(14, curve.length);
  const s = curve.slice(curve.length - n);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i].daily;
  const r = sum / s.length;
  return r > 1 ? r : FALLBACK_RATE;
}

export function gddAtDate(curve, date) {
  if (!curve || !curve.length) return 0;
  const last = curve[curve.length - 1];
  if (date <= last.date) {
    let g = 0;
    for (let i = 0; i < curve.length; i++) if (curve[i].date <= date) g = curve[i].gdd;
    return Math.round(g);
  }
  // เลยช่วงข้อมูลอากาศจริง/พยากรณ์ที่มี (ปกติราว 16 วันข้างหน้า) ให้คาดการณ์ต่อด้วยอัตราสะสมเฉลี่ย 14 วันล่าสุด
  // ไม่งั้นค่าจะค้างที่ตัวเลขสุดท้ายตลอด ทำให้ระยะ/เปอร์เซ็นต์ความคืบหน้าดูเหมือนไม่ขยับเมื่อเลื่อนดูวันที่ไกลๆ ในปฏิทิน
  const daysBeyond = diffDays(last.date, date);
  const rate = gddRate(curve);
  return Math.round(last.gdd + daysBeyond * rate);
}

// แปลงค่า GDD เป้าหมายเป็นวันที่ ถ้าเกินข้อมูลที่มีจะคาดการณ์ด้วยอัตราสะสมปัจจุบัน
export function dateAtGdd(curve, plot, target) {
  if (!curve || !curve.length) {
    return addDaysStr(plot.plantedAt, Math.max(0, Math.round(target / FALLBACK_RATE)));
  }
  for (let i = 0; i < curve.length; i++) if (curve[i].gdd >= target) return curve[i].date;
  const last = curve[curve.length - 1];
  const rate = gddRate(curve);
  const need = Math.ceil((target - last.gdd) / rate);
  return addDaysStr(last.date, need > 0 ? need : 0);
}

function monthAnchorDate(plot, month, day) {
  const start = toDate(plot.plantedAt);
  let y = start.getFullYear();
  let d = y + '-' + String(month).padStart(2, '0') + '-' + String(day || 1).padStart(2, '0');
  if (d < plot.plantedAt) {
    y++;
    d = y + '-' + String(month).padStart(2, '0') + '-' + String(day || 1).padStart(2, '0');
  }
  return d;
}

// ───────── ไม้ผลยืนต้น: ระยะอิงปฏิทิน (เดือน/จำนวนวัน) ไม่อิง GDD ─────────
// ไทม์ไลน์ แถบความคืบหน้า และระยะปัจจุบัน ใช้ตัวคำนวณ "หน้าต่างเวลา" ชุดเดียวกันนี้ จึงสอดคล้องกันเสมอ
export function isCalendarBasis(crop) {
  return !!crop.perennial && (crop.stageMode === 'month' || crop.stageMode === 'dap');
}
function addMonthsStr(dateStr, n) {
  const d = toDate(dateStr);
  d.setMonth(d.getMonth() + n);
  return ymd(d);
}
// คืนหน้าต่างเวลาของแต่ละระยะในรอบปัจจุบัน [{ idx, key, name, start, end }] เฉพาะระยะที่มีเดือนของตัวเอง
// เดือนที่ระยะซ้อนกัน ให้ระยะท้ายสุดที่มีเดือนนั้นชนะ (กติกาเดียวกับตัวคำนวณระยะ)
export function calendarWindows(crop, plot, dateStr) {
  const t = dateStr || today();
  if (crop.stageMode === 'dap') {
    const out = [];
    for (let i = 0; i < crop.stages.length; i++) {
      const s = crop.stages[i];
      const n = crop.stages[i + 1];
      out.push({
        idx: i, key: s.key, name: s.name,
        start: addDaysStr(plot.plantedAt, s.dap),
        end: addDaysStr(plot.plantedAt, n ? n.dap : crop.cycleDays)
      });
    }
    return out;
  }
  if (crop.stages.length && crop.stages[0].span) {
    // ไม้ผลที่ช่วงเดือนซ้อนกัน: หน้าต่างของแต่ละระยะ = ช่วงเดือนตามไฟล์ทั้งช่วง (ซ้อนกันได้)
    const b = crop.stages[0].span[0];
    const td0 = toDate(t);
    let y0 = td0.getFullYear();
    let cs0 = y0 + '-' + String(b).padStart(2, '0') + '-01';
    if (cs0 > t) { y0--; cs0 = y0 + '-' + String(b).padStart(2, '0') + '-01'; }
    return crop.stages.map(function (st, i) {
      const off = (st.span[0] - b + 12) % 12;
      const len = ((st.span[1] - st.span[0] + 12) % 12) + 1;
      let start = addMonthsStr(cs0, off);
      let end = addMonthsStr(start, len);
      // ช่วงที่ต่อท้ายรอบก่อน (ข้ามปี) ที่ยังครอบคลุมวันนี้
      const pStart = addMonthsStr(start, -12), pEnd = addMonthsStr(end, -12);
      const inPrev = pStart <= t && t < pEnd;
      if (inPrev) { start = pStart; end = pEnd; }
      return { idx: i, key: st.key, name: st.name, start: start, end: end, overlap: true };
    });
  }
  const own = crop.stages.map(function () { return []; });
  for (let m = 1; m <= 12; m++) {
    let owner = -1;
    for (let i = 0; i < crop.stages.length; i++) {
      if (crop.stages[i].months && crop.stages[i].months.indexOf(m) >= 0) owner = i;
    }
    if (owner >= 0) own[owner].push(m);
  }
  const vis = [];
  for (let i = 0; i < own.length; i++) {
    if (!own[i].length) continue;
    // เดือนเริ่ม = เดือนแรกของช่วงต่อเนื่อง (เผื่อข้ามปี เช่น พ.ย.–ม.ค.)
    let startM = own[i][0];
    for (let k = 0; k < own[i].length; k++) {
      const prev = own[i][k] === 1 ? 12 : own[i][k] - 1;
      if (own[i].indexOf(prev) < 0) { startM = own[i][k]; break; }
    }
    vis.push({ idx: i, startM: startM });
  }
  if (!vis.length) return [];
  const base = vis[0].startM;
  const td = toDate(t);
  let csYear = td.getFullYear();
  let cs = csYear + '-' + String(base).padStart(2, '0') + '-01';
  if (cs > t) { csYear--; cs = csYear + '-' + String(base).padStart(2, '0') + '-01'; }
  const out = [];
  for (let k = 0; k < vis.length; k++) {
    const off = (vis[k].startM - base + 12) % 12;
    const st = crop.stages[vis[k].idx];
    out.push({ idx: vis[k].idx, key: st.key, name: st.name, start: addMonthsStr(cs, off), end: null });
  }
  for (let k = 0; k < out.length; k++) {
    out[k].end = k + 1 < out.length ? out[k + 1].start : addMonthsStr(cs, 12);
  }
  return out;
}

export function maturityGdd(crop) {
  if (crop.gddMature) return crop.gddMature;
  const last = crop.stages[crop.stages.length - 1];
  return last.gdd || 0;
}

// ข้อ 2: สิ้นสุดรอบการผลิตคำนวณจาก GDD เป็นหลัก วันตายตัวใช้เป็นกรอบกันค่าเพี้ยน
export function seasonEnd(crop, plot, curve) {
  if (crop.stageMode === 'month' || crop.perennial) {
    return addDaysStr(plot.plantedAt, crop.cycleDays);
  }
  const target = maturityGdd(crop);
  if (!target) return addDaysStr(plot.plantedAt, crop.cycleDays);
  let d = dateAtGdd(curve, plot, target);
  const min = addDaysStr(plot.plantedAt, Math.round(crop.cycleDays * 0.65));
  const max = addDaysStr(plot.plantedAt, Math.round(crop.cycleDays * 1.5));
  if (d < min) d = min;
  if (d > max) d = max;
  return d;
}

export { monthPrimaryIdx, monthConcurrentKeys };

export function stageKeyAtGdd(crop, gdd, date) {
  if (crop.stageMode === 'month') {
    const m = toDate(date).getMonth() + 1;
    const pi = monthPrimaryIdx(crop, m);
    return pi >= 0 ? crop.stages[pi].key : crop.stages[0].key;
  }
  let key = crop.stages[0].key;
  for (let i = 0; i < crop.stages.length; i++) if (gdd >= crop.stages[i].gdd) key = crop.stages[i].key;
  return key;
}

// แกนกลางของการคำนวณระยะการเติบโต รับ "วันที่ที่ต้องการดู" (dateStr) เป็นพารามิเตอร์
// เพื่อให้ใช้ซ้ำได้ทั้งกรณี "วันนี้" (currentStage) และ "วันไหนก็ได้" (stageOnDate ใช้ในปฏิทิน)
// หมายเหตุ: ลำดับพารามิเตอร์ (crop, plot, curve, ...) ตรงกับฟังก์ชันอื่นทุกตัวในไฟล์นี้
// (seasonEnd, stageTimeline, stageSegments, harvestCutoff ฯลฯ) และตรงกับที่ CalendarView.jsx เรียกใช้จริง
function computeStage(crop, plot, curve, dateStr) {
  const t = dateStr;
  const beforeStart = t < plot.plantedAt;
  const age = diffDays(plot.plantedAt, t);
  const gdd = beforeStart ? 0 : gddAtDate(curve, t);
  const end = seasonEnd(crop, plot, curve);
  const afterHarvest = !crop.perennial && !beforeStart && t > end;

  let idx = 0;
  let photo = null;
  let basis = 'gdd';
  if (afterHarvest) {
    // สิ้นสุดรอบแล้วตามวันที่ (end ถูกยึดกรอบไว้แล้วใน seasonEnd) ไม่ต้องรอ GDD ไล่ตามทัน
    // ถือว่าทุกระยะผ่านหมดแล้ว แสดงระยะสุดท้ายและ 100% เสมอ ไม่ว่า GDD สะสมจริงจะถึงเป้าหรือไม่
    idx = crop.stages.length - 1;
    basis = crop.stageMode === 'month' ? 'month' : (curve.length ? 'gdd' : 'dap');
  } else if (crop.stageMode === 'month') {
    basis = 'month';
    const m = toDate(t).getMonth() + 1;
    const pi = monthPrimaryIdx(crop, m);
    if (pi >= 0) idx = pi;
    photo = photoInfo(crop, plot, t);
    if (photo) {
      const gi = crop.stages.findIndex(function (s) { return s.key === photo.gateKey; });
      // ยังไม่ถึงวันที่กลางวันสั้นกว่าเกณฑ์ → ออกดอกไม่ได้ ค้างที่ระยะก่อนออกดอก (เฉพาะช่วงหลังครีษมายัน)
      if (gi >= 0 && idx > gi && photo.shortFrom && t < photo.shortFrom && t.slice(5) >= '06-21') { idx = gi; photo.hold = true; }
    }
  } else if (crop.stageMode === 'dap' && isCalendarBasis(crop)) {
    basis = 'dap';
    for (let i = 0; i < crop.stages.length; i++) {
      if (age >= crop.stages[i].dap) idx = i;
    }
  } else {
    if (!curve.length) basis = 'dap';
    for (let i = 0; i < crop.stages.length; i++) {
      if (basis === 'gdd' ? gdd >= crop.stages[i].gdd : age >= crop.stages[i].dap) idx = i;
    }
  }

  const stage = crop.stages[idx];
  const next = crop.stages[idx + 1] || null;
  let nextDate = null;
  if (next && isCalendarBasis(crop)) {
    const wins = calendarWindows(crop, plot, t);
    for (let k = 0; k < wins.length; k++) { if (wins[k].start > t) { nextDate = wins[k].start; break; } }
    if (!nextDate && crop.stageMode === 'dap') nextDate = addDaysStr(plot.plantedAt, next.dap);
  } else if (next) {
    nextDate = dateAtGdd(curve, plot, next.gdd);
  }
  if (photo && photo.hold && next) nextDate = photo.shortFrom;
  let pct = 100;
  if (!afterHarvest && basis === 'dap' && next && next.dap > stage.dap) {
    pct = ((age - stage.dap) / (next.dap - stage.dap)) * 100;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  } else if (!afterHarvest && basis === 'month') {
    const w = calendarWindows(crop, plot, t).filter(function (x) { return x.idx === idx; })[0];
    if (w) {
      pct = ((toDate(t) - toDate(w.start)) / Math.max(1, toDate(w.end) - toDate(w.start))) * 100;
      if (pct < 0) pct = 0; if (pct > 100) pct = 100;
    }
  } else if (!afterHarvest && next && basis === 'gdd' && next.gdd > stage.gdd) {
    pct = ((gdd - stage.gdd) / (next.gdd - stage.gdd)) * 100;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  }

  return {
    age: age, gdd: gdd, rate: +gddRate(curve).toFixed(1),
    stage: stage, index: idx, next: next, nextDate: nextDate,
    pctToNext: Math.round(pct), basis: basis, endDate: end,
    maturityGdd: maturityGdd(crop),
    beforeStart: beforeStart,
    afterHarvest: afterHarvest,
    photo: photo,
    concurrent: crop.stageMode === 'month' ? monthConcurrentKeys(crop, +t.slice(5, 7)) : [stage.key]
  };
}

export function currentStage(crop, plot, curve) {
  return computeStage(crop, plot, curve, today());
}

// ใช้ดูระยะการเติบโตของ "วันไหนก็ได้" ไม่ใช่แค่วันนี้ (ปฏิทินต้องใช้แสดงแต่ละวัน)
export function stageOnDate(crop, plot, curve, dateStr) {
  return computeStage(crop, plot, curve, dateStr);
}

export function stageTimeline(crop, plot, curve) {
  const t = today();
  const end = seasonEnd(crop, plot, curve);
  const afterHarvest = !crop.perennial && t > plot.plantedAt && t > end;
  if (isCalendarBasis(crop)) {
    return calendarWindows(crop, plot, t).map(function (w) {
      const reached = w.start <= t;
      return { key: w.key, name: w.name, gdd: 0, date: w.start, end: w.end, done: reached, reached: reached };
    });
  }
  return crop.stages.map(function (s) {
    const d = dateAtGdd(curve, plot, s.gdd);
    const reached = afterHarvest || d <= t;
    return { key: s.key, name: s.name, gdd: s.gdd, date: d, done: reached, reached: reached };
  });
}

export function stageSegments(crop, plot, curve, dateStr) {
  const t = dateStr || today();
  if (isCalendarBasis(crop)) {
    const wins = calendarWindows(crop, plot, t);
    const span = function (w) { return Math.max(1, (toDate(w.end) - toDate(w.start)) / 86400000); };
    const tot = wins.reduce(function (a, w) { return a + span(w); }, 0) || 1;
    return wins.map(function (w, wi) {
      const lastWin = wi === wins.length - 1;
      let fill = (toDate(t) - toDate(w.start)) / 86400000 / span(w) * 100;
      if (fill < 0) fill = 0; if (fill > 100) fill = 100;
      return {
        key: w.key, name: w.name, startDate: w.start, endDate: w.end,
        widthPct: span(w) / tot * 100, fillPct: fill, isNow: t >= w.start && (t < w.end || (lastWin && crop.stageMode === 'dap'))
      };
    });
  }
  const gddNow = gddAtDate(curve, t);
  const total = maturityGdd(crop) * 1.05 || 1;
  const end = seasonEnd(crop, plot, curve);
  const afterHarvest = !crop.perennial && t > plot.plantedAt && t > end;
  const out = [];
  for (let i = 0; i < crop.stages.length; i++) {
    const s = crop.stages[i];
    const n = crop.stages[i + 1];
    const start = s.gdd;
    const endG = n ? n.gdd : total;
    const span = Math.max(1, endG - start);
    let fill = afterHarvest ? 100 : ((gddNow - start) / span) * 100;
    if (fill < 0) fill = 0; if (fill > 100) fill = 100;
    out.push({
      key: s.key, name: s.name, startGdd: start, endGdd: endG,
      widthPct: (span / total) * 100, fillPct: fill,
      isNow: !afterHarvest && gddNow >= start && gddNow < endG
    });
  }
  return out;
}

export function harvestCutoff(crop, plot, curve, end) {
  if (crop.perennial) return null;              // ข้อ 3: ไม้ผลไม่ตัด
  let hd = null;
  for (let i = 0; i < crop.tasks.length; i++) {
    const t = crop.tasks[i];
    if (t.type !== 'harvest') continue;
    const d = resolveBaseDate(t, crop, plot, curve);
    if (!hd || d < hd) hd = d;
  }
  return hd || end;
}

function resolveBaseDate(task, crop, plot, curve) {
  const tr = task.trigger;
  if (tr.by === 'gdd') return dateAtGdd(curve, plot, tr.value);
  if (tr.by === 'month') return monthAnchorDate(plot, tr.value, tr.day || 1);
  return addDaysStr(plot.plantedAt, tr.value);
}

function seriesRow(series, date) {
  for (let i = 0; i < series.length; i++) if (series[i].date === date) return series[i];
  return null;
}

// เลื่อนงานที่ห้ามทำตอนฝนตกหนัก
function shiftForRain(date, series) {
  const r = seriesRow(series, date);
  if (!r || (r.rain || 0) < RAIN_BLOCK) return { date: date, shifted: false };
  for (let k = 1; k <= 6; k++) {
    const d = addDaysStr(date, k);
    const rr = seriesRow(series, d);
    if (!rr) break;
    if ((rr.rain || 0) < RAIN_BLOCK) {
      return { date: d, shifted: true, note: 'เลื่อนจาก ' + date + ' เพราะพยากรณ์ฝน ' + (r.rain || 0).toFixed(0) + ' มม.' };
    }
  }
  return { date: date, shifted: false };
}

function isDone(activities, plot, type, date) {
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (a.plotId !== plot.id) continue;
    if (a.type !== type) continue;
    const d = Math.abs(diffDays(a.date, date));
    if (d <= 3) return true;
  }
  return false;
}

/**
 * ข้อ 2 3 4 5 7 รวมกัน
 * opts = { curve, waterPlan, soil }
 */
export function generateTasks(plot, series, activities, opts) {
  const crop = cropForPlot(plot);
  const o = opts || {};
  const curve = o.curve || buildGddCurve(series, plot);
  const end = seasonEnd(crop, plot, curve);
  const cutoff = harvestCutoff(crop, plot, curve, end);
  const locks = phiLocks(activities, plot.id, addDaysStr);
  const out = [];

  for (let i = 0; i < crop.tasks.length; i++) {
    const t = crop.tasks[i];
    if (t.mode && plot.waterMode && t.mode !== plot.waterMode) continue;
    // ข้อ 5 ให้สมดุลน้ำคุมแทน ยกเว้นงานที่ระบุ keep (เช่น งดน้ำชักนำดอกของอะโวคาโด ซึ่งสมดุลน้ำไม่รู้ว่าเป็นการงดโดยตั้งใจ)
    if (t.type === 'water' && !t.keep && o.waterPlan && o.waterPlan.managed) continue;

    let base = resolveBaseDate(t, crop, plot, curve);
    let stopDate = end;
    if (t.stopAtStage) {
      for (let k = 0; k < crop.stages.length; k++) {
        if (crop.stages[k].key === t.stopAtStage) stopDate = dateAtGdd(curve, plot, crop.stages[k].gdd);
      }
    }
    if (cutoff && t.type !== 'harvest' && stopDate > cutoff) stopDate = cutoff;
    // forDays = งานที่ทำซ้ำเฉพาะช่วงสั้น ๆ ของระยะ (เช่น สำรวจเพลี้ยไฟช่วงดอกบาน) ไม่ให้ซ้ำยาวจนสิ้นรอบ
    if (t.forDays) {
      const lim = addDaysStr(base, t.forDays);
      if (lim < stopDate) stopDate = lim;
    }

    const dates = [base];
    if (t.repeatDays) {
      let d = base;
      for (let k = 0; k < 40; k++) {
        d = addDaysStr(d, t.repeatDays);
        if (d > stopDate) break;
        dates.push(d);
      }
    }

    for (let k = 0; k < dates.length; k++) {
      let d = dates[k];
      // ข้อ 3 ตัดงานทุกชนิดที่เลยวันเก็บเกี่ยว ยกเว้นงานเก็บเกี่ยวเองและไม้ผล
      if (cutoff && t.type !== 'harvest' && d > cutoff) continue;
      if (!crop.perennial && d > addDaysStr(end, 14)) continue;

      let shifted = false, note = '';
      if (t.rainSensitive) {
        const s = shiftForRain(d, series);
        d = s.date; shifted = s.shifted; note = s.note || '';
      }

      const item = {
        key: t.id + '-' + k,
        taskId: t.id,
        type: t.type,
        title: t.title,
        detail: t.detail || '',
        date: d,
        gddTarget: t.trigger.by === 'gdd' ? t.trigger.value : null,
        gddAt: gddAtDate(curve, d),
        shifted: shifted,
        note: note,
        done: isDone(activities, plot, t.type, d)
      };

      // ข้อ 4 ระบุชนิดศัตรูพืชที่ต้องสำรวจตามระยะและอากาศ
      if (t.type === 'scout') {
        const f = weatherFeatures(series, d);
        const stageKey = crop.stageMode === 'month' ? monthConcurrentKeys(crop, +d.slice(5, 7)) : stageKeyAtGdd(crop, item.gddAt, d);
        const pick = pickScoutTargets(crop, stageKey, f);
        item.title = scoutTitle(pick);
        item.generic = pick.generic;
        item.targets = pick.targets;
        item.stageKey = stageKey;
        item.detail = pick.generic
          ? pick.reason + ' — ' + pick.targets[0].method
          : pick.targets.map(function (x) { return x.name + ': ' + x.method; }).join(' | ');
      }

      // ข้อ 7 ตรวจระยะปลอดภัยก่อนเก็บเกี่ยว
      if (t.type === 'harvest') {
        const blk = harvestBlocked(locks, d);
        if (blk) {
          item.phiWarn = 'ห้ามเก็บเกี่ยวก่อน ' + blk.safeDate + ' เพราะพ่น' + blk.chem +
            ' เมื่อ ' + blk.sprayDate + ' ระยะปลอดภัย ' + blk.phi + ' วัน';
          item.phiSafeDate = blk.safeDate;
        }
      }

      out.push(item);
    }
  }

  // ข้อ 5 งานให้น้ำที่มาจากสมดุลน้ำจริง
  if (o.waterPlan && o.waterPlan.managed && o.waterPlan.nextDate) {
    const w = o.waterPlan;
    out.push({
      key: 'water-plan',
      taskId: 'water-balance',
      type: 'water',
      title: w.postponed ? 'ให้น้ำ (เลื่อนออกไปแล้ว)' : 'ให้น้ำ ' + w.amountMm + ' มม.',
      detail: w.advice,
      date: w.nextDate,
      gddAt: gddAtDate(curve, w.nextDate),
      source: 'water-balance',
      postponed: w.postponed,
      done: isDone(activities, plot, 'water', w.nextDate)
    });
  }

  out.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return out;
}

export { phiLocks };