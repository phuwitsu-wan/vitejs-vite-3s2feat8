// ตัวรวมข้อมูล "ปฏิทินหน้าเดียว" (A4) จากแผนการผลิต ปุ๋ย ศัตรูพืช และชีวภัณฑ์
import { monthPrimaryIdx } from './stageMonth.js';
import { thaiDate, thaiDateShort, today } from './date.js';
import { FERTILIZER_PLAN } from '../data/fertilizer.js';
import { stageGuideFor } from '../data/stageGuide.js';
import { bioSourceLabel, bioAll } from '../data/biocontrol.js';
import { ALERT_RULES } from '../data/alertRules.js';
import { PEST_GUIDE } from '../data/pestGuide.js';
import { photoInfo } from './daylength.js';
import { phiChemicalsForCrop } from '../data/phiChemicals.js';
import { TASK_META } from '../data/crops.js';
import { excessWaterCare } from './waterCare.js';

const M_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function monthsText(ms) {
  if (!ms || !ms.length) return '-';
  const a = ms.slice().sort(function (x, y) { return x - y; });
  // ทำให้ช่วงข้ามปีอ่านต่อเนื่อง เช่น [11,12,1] -> พ.ย.–ม.ค.
  let start = a[0];
  if (a.indexOf(1) >= 0 && a.indexOf(12) >= 0) {
    for (let i = 0; i < a.length; i++) { if (a.indexOf(a[i] - 1) < 0 && a[i] > 1 && (a[i] - 1 !== 0)) { /* หาจุดเริ่ม */ } }
    const gap = a.filter(function (m) { return a.indexOf(m === 1 ? 12 : m - 1) < 0; });
    if (gap.length) start = gap[0];
  }
  const order = [];
  let cur = start;
  for (let i = 0; i < a.length; i++) { order.push(cur); cur = cur === 12 ? 1 : cur + 1; }
  return order.length === 1 ? M_SHORT[order[0] - 1] : M_SHORT[order[0] - 1] + '–' + M_SHORT[order[order.length - 1] - 1];
}

// รวมชีวภัณฑ์ชนิดเดียวกันในระยะเดียวกัน ให้อ่านง่ายและพอดีหน้าเดียว
function groupBio(list) {
  const map = {}, order = [];
  list.forEach(function (b) {
    const agent = b.agent.replace(/\s*\(.*?\)/g, '');
    if (!map[agent]) { map[agent] = { agent: agent, targets: [], rate: b.rate, srcs: [] }; order.push(agent); }
    const m = map[agent];
    const tg = b.target.replace(/\s*\(.*?\)/g, '');
    if (m.targets.indexOf(tg) < 0) m.targets.push(tg);
    if (m.srcs.indexOf(b.src) < 0) m.srcs.push(b.src);
  });
  return order.map(function (k) {
    const m = map[k];
    return { agent: m.agent, target: m.targets.join(' / '), rate: m.rate, src: m.srcs.indexOf('G') >= 0 && m.srcs.length === 1 ? 'G' : (m.srcs.filter(function (x) { return x !== 'G'; })[0] || 'G') };
  });
}

function fertForStage(crop, i) {
  const plan = FERTILIZER_PLAN[crop.id];
  if (!plan) return [];
  const s = crop.stages[i];
  const n = crop.stages[i + 1];
  return plan.items.filter(function (f) {
    if (f.stage) return f.stage === s.key;
    const sh = crop.shift || 0;
    if (f.months || f.month !== undefined) {
      // ใส่ในระยะที่ตรงกับเดือนแรกของรายการ ตามกติกาเดียวกับตัวคำนวณระยะ (ระยะท้ายสุดที่มีเดือนนั้นชนะ)
      const m0 = (f.months ? f.months[0] : f.month) + sh > 12 ? (f.months ? f.months[0] : f.month) + sh - 12 : (f.months ? f.months[0] : f.month) + sh;
      return monthPrimaryIdx(crop, m0) === i;
    }
    if (f.dap === undefined || s.dap === undefined) return false;
    const hi = n && n.dap !== undefined ? n.dap : 9999;
    return f.dap >= s.dap && f.dap < hi;
  });
}

// ข้อความปริมาณน้ำที่คนทั่วไปอ่านแล้วใช้ได้เลย (ไม่ใช้คำว่า Kc)
// พืชยืนต้นที่มีตัวเลขจากไฟล์แนบ ใช้ลิตร/ต้น  พืชอื่นคำนวณจากการใช้น้ำของพืช (ประมาณ 4.5 มม./วัน ในหน้าแล้ง) 1 มม. = 1.6 ม³/ไร่
function waterText(crop, s, guide) {
  if (s.water) {
    return Number(s.water).toLocaleString('en-US') + ' ลิตร/ไร่/วัน ให้ 1 วัน เว้น 2 วัน (สปริงเกอร์) ลดตามฝน';
  }
  if (guide && guide.hold) return 'งดน้ำ 30–45 วัน เพื่อชักนำดอก';
  if (crop.id === 'rice' || crop.id === 'ricePhoto') return 'รักษาระดับน้ำขัง 3–5 ซม. ระบายน้ำออกก่อนใส่ปุ๋ยและก่อนเก็บเกี่ยว 10–14 วัน';
  if (guide && guide.water) {
    const first = guide.water.split(' · ')[0];
    return first + ' (ลดตามฝนที่ตก)';
  }
  const mm = 4.5 * (s.kc || 0.8) * 7;
  const m3 = Math.round(mm * 1.6);
  return 'ประมาณ ' + m3 + ' ม³/ไร่/สัปดาห์ (≈' + Math.round(mm) + ' มม.) ถ้าไม่มีฝน แบ่งให้ 2–3 ครั้ง ลดตามฝนที่ตก';
}

function shortChem(c) {
  const t = String(c).replace(/\s+/g, ' ');
  return t.length > 90 ? t.slice(0, 88) + '…' : t;
}

export function buildOnePager(plot, crop, plan, derived) {
  const stages = plan.stageWatch.map(function (w, i) {
    const s = crop.stages[i];
    const guide = stageGuideFor(crop.id, s.key);
    let period;
    if (s.spanText) period = s.spanText;
    else if (guide && guide.span && !crop.shift) period = guide.span;
    else if (crop.stageMode === 'month') period = monthsText(s.months);
    else if (w.startDate) period = thaiDateShort(w.startDate) + (w.endDate ? '–' + thaiDateShort(w.endDate) : ' เป็นต้นไป');
    else period = 'อายุ ' + (s.dap !== undefined ? s.dap : 0) + ' วัน';
    const pests = [];
    w.calendarPests.forEach(function (x) { if (pests.indexOf(x.name) < 0) pests.push(x.name); });
    w.targets.forEach(function (x) { if (x.type !== 'general' && pests.indexOf(x.name) < 0) pests.push(x.name); });
    return {
      key: s.key, name: s.name, period: period, current: !!w.current, kc: s.kc,
      signs: guide ? guide.signs : '', care: guide ? guide.care : '',
      water: waterText(crop, s, guide),
      hold: !!(guide && guide.hold),
      fert: fertForStage(crop, i), pests: pests.slice(0, 6),
      chems: w.calendarPests.filter(function (x) { return x.chem && x.chem.length; }).slice(0, 2).map(function (x) { return { pest: x.name, chem: x.chem.slice(0, 1).map(function (c) { return shortChem(c); }) }; }),
      bio: groupBio(w.bio || []).slice(0, 4)
    };
  });
  const fp = FERTILIZER_PLAN[crop.id];
  const upcoming = plan.upcoming.filter(function (x) { return x.type !== 'water'; }).slice(0, 8);
  const t0 = today();
  const nowKey = t0.slice(0, 7);
  const monthRows = plan.months.filter(function (m) { return m.key >= nowKey; }).slice(0, 12).map(function (m) {
    const byType = {};
    const order = [];
    m.items.forEach(function (x) {
      let label = (TASK_META[x.type] || { label: x.type }).label;
      if (x.type === 'water') { if (x.title.indexOf('งดน้ำ') < 0) return; label = 'งดน้ำ'; }
      if (x.type === 'scout') return;
      if (!byType[label]) { byType[label] = []; order.push(label); }
      const d = +x.date.slice(8, 10);
      if (byType[label].indexOf(d) < 0) byType[label].push(d);
    });
    return { key: m.key, month: +m.key.slice(5, 7), lines: order.map(function (l) { return { label: l, days: byType[l].slice(0, 4).join(', ') + (byType[l].length > 4 ? '…' : '') }; }) };
  });
  // วันเก็บเกี่ยวที่คาดไว้ = งานเก็บเกี่ยวแรกที่ยังไม่ถึง
  let harvestDate = null;
  (derived.tasks || []).forEach(function (x) { if (x.type === 'harvest' && x.date >= t0 && (!harvestDate || x.date < harvestDate)) harvestDate = x.date; });
  const phiList = phiChemicalsForCrop(crop.id).slice().sort(function (a, b) { return (b.specific ? 1 : 0) - (a.specific ? 1 : 0) || b.days - a.days; }).slice(0, 6).map(function (c) {
    let stop = null;
    if (harvestDate) { const d = new Date(harvestDate + 'T00:00:00'); d.setDate(d.getDate() - c.days); const p = function (n) { return (n < 10 ? '0' : '') + n; }; stop = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
    return { name: c.thaiGeneric + (c.trade ? ' (' + c.trade + ')' : ''), days: c.days, stop: stop, specific: c.specific };
  });
  const excess = excessWaterCare(derived.water, crop, t0);
  const stageName = function (k) { const x = crop.stages.filter(function (s) { return s.key === k; })[0]; return x ? x.name : k; };
  // ตารางศัตรูพืชฉบับเต็ม: รวมจากกฎเตือน (ตามอากาศ) + ฐานข้อมูลศัตรูพืชของพืชนั้น
  const rows = [], seen = {};
  const addRow = function (r) { const k = r.name.replace(/\s*\(.*?\)/g, '').trim(); if (seen[k]) return; seen[k] = 1; rows.push(r); };
  const stText = function (keys) {
    if (!keys || !keys.length) return 'ทุกระยะ';
    const names = keys.map(stageName);
    return names.length > 3 ? names[0] + ' → ' + names[names.length - 1] : names.join(', ');
  };
  const cid = crop.id;
  (PEST_GUIDE[cid] || []).forEach(function (g) {
    if (!g.chem || !g.chem.length) return;
    addRow({
      name: g.name, kind: g.type, stages: stText(g.stageKeys), cond: g.cond, watch: g.watch, manage: g.manage,
      chems: g.chem.slice(0, 4).map(function (c) { return (c.g ? 'กลุ่ม ' + c.g + ' ' : '') + c.t; })
    });
  });
  ALERT_RULES.filter(function (r) { return r.crop === cid; }).forEach(function (r) {
    addRow({
      name: r.name, kind: r.kind === 'disease' ? 'โรค' : (r.kind === 'insect' || r.kind === 'pest' ? 'แมลง' : (r.kind === 'abiotic' ? 'สภาพอากาศ' : r.kind)),
      stages: stText(r.stages), cond: r.risk || '', watch: '', manage: (r.act || []).slice(0, 3).join(' · '),
      chems: (r.chem || []).slice(0, 4)
    });
  });
  (PEST_GUIDE[cid] || []).forEach(function (g) {
    if (g.chem && g.chem.length) return;
    addRow({ name: g.name, kind: g.type, stages: stText(g.stageKeys), cond: g.cond, watch: g.watch, manage: g.manage, chems: [] });
  });
  const pestRows = rows.slice(0, 22);
  const bioSeen = {};
  const bioRef = [];
  bioAll(cid).forEach(function (b) {
    const k = b.agent + '|' + b.target;
    if (bioSeen[k]) return; bioSeen[k] = 1;
    bioRef.push({ agent: b.agent.replace(/\s*\(.*?\)/g, ''), target: b.target, rate: b.rate, how: b.how || '', stages: stText(b.stages), src: b.src });
  });
  const photo = photoInfo(crop, plot, t0);
  return {
    plot: plot, crop: crop, stages: stages, months: plan.months, monthRows: monthRows,
    harvestDate: harvestDate, phiList: phiList,
    organic: fp && fp.organic ? fp.organic : [],
    unitNote: fp ? fp.unitNote : '',
    upcoming: upcoming, overdue: plan.overdue.length,
    phi: plan.phiLocks, alerts: (plan.alerts || []).filter(function (a) { return a.level === 'high' || a.level === 'alert'; }).slice(0, 4),
    stageNow: plan.stage.afterHarvest ? 'สิ้นสุดรอบแล้ว' : (plan.stage.stage ? plan.stage.stage.name : '-'),
    age: plan.age, endDate: plan.endDate, waterAdvice: plan.water && plan.water.summary ? plan.water.summary.advice : '',
    excess: excess, pestRows: pestRows, bioRef: bioRef.slice(0, 24), photo: photo,
    printedAt: today()
  };
}

export function onePagerText(op) {
  const L = [];
  L.push('ปฏิทินเพาะปลูก 1 หน้า · ' + op.crop.name + ' · แปลง ' + op.plot.name);
  L.push('อายุ ' + op.age + ' วัน · ระยะปัจจุบัน ' + op.stageNow + ' · สิ้นสุดรอบ ' + thaiDate(op.endDate, true));
  if (op.waterAdvice) L.push('น้ำวันนี้: ' + op.waterAdvice);
  L.push('');
  op.stages.forEach(function (s) {
    L.push((s.current ? '>> ' : '') + s.name + ' (' + s.period + ')' + (s.current ? ' [ระยะปัจจุบัน]' : ''));
    L.push('  น้ำ: ' + s.water);
    s.fert.forEach(function (f) {
      L.push('  ปุ๋ย: ' + f.formula + ' ' + f.rate + (f.altFormula ? ' | ทางเลือก: ' + f.altFormula + ' ' + f.altRate : '') + (f.alt3Formula ? ' | ' + f.alt3Formula + ' ' + f.alt3Rate : ''));
    });
    s.chems.forEach(function (c) { L.push('  สารกำจัด: ' + c.pest + ' → ' + c.chem.join(' | ')); });
    if (s.pests.length) L.push('  เฝ้าระวัง: ' + s.pests.join(', '));
    s.bio.forEach(function (b) { L.push('  ชีวภัณฑ์: ' + b.target + ' → ' + b.agent + ' (' + b.rate + ') [' + bioSourceLabel(b.src) + ']'); });
  });
  if (op.organic.length) {
    L.push('');
    L.push('ปุ๋ยอินทรีย์/ชีวภาพทางเลือก: ' + op.organic.map(function (o) { return o.name + ' ' + o.rate; }).join(' · '));
  }
  if (op.photo) L.push('เกณฑ์ช่วงแสง: ออกดอกเมื่อกลางวันสั้นกว่า ' + op.photo.maxHours + ' ชม./วัน' + (op.photo.shortFrom ? ' (ที่พิกัดแปลงเริ่ม ' + thaiDate(op.photo.shortFrom) + ')' : ''));
  if (op.pestRows.length) {
    L.push('');
    L.push('ศัตรูพืชและการจัดการ');
    op.pestRows.forEach(function (r) { L.push(' - ' + r.name + ' [' + r.stages + ']' + (r.manage ? ' : ' + r.manage : '') + (r.chems.length ? ' | สาร: ' + r.chems.join(' ; ') : '')); });
  }
  if (op.bioRef.length) {
    L.push('');
    L.push('ชีวภัณฑ์และอัตราใช้');
    op.bioRef.forEach(function (b) { L.push(' - ' + b.agent + ' → ' + b.target + ' (' + b.rate + ')' + (b.how ? ' : ' + b.how : '')); });
  }
  L.push('');
  L.push('งดพ่นสารก่อนเก็บเกี่ยว (PHI)' + (op.harvestDate ? ' คาดเก็บเกี่ยว ' + thaiDate(op.harvestDate) : ''));
  op.phiList.forEach(function (c) { L.push(' - ' + c.name + ': งดพ่น ' + c.days + ' วัน' + (c.stop ? ' (หยุดพ่นตั้งแต่ ' + thaiDateShort(c.stop) + ')' : '')); });
  op.phi.forEach(function (p) { L.push(' - ที่พ่นไปแล้ว ' + p.chem + ' เก็บเกี่ยวได้ตั้งแต่ ' + thaiDateShort(p.safeDate)); });
  L.push('ฝนหนัก/น้ำขัง: เปิดร่องระบายน้ำภายใน 24 ชม. งดปุ๋ยเม็ด หลังน้ำลดล้างโคลน พรวนดินเมื่อหมาด สำรวจรากเน่า');
  L.push('');
  L.push('ข้อมูลเป็นแนวทางเริ่มต้น ควรปรับตามพันธุ์ ดิน และผลวิเคราะห์จริง ตรวจฉลากสารและปรึกษาเจ้าหน้าที่เกษตรก่อนใช้');
  return L.join('\n');
}
