// รายงานการระบาดในพื้นที่แบบไม่ระบุตัวตน
// ตั้งค่า VITE_COMMUNITY_API ใน .env ชี้ไปที่ Web App ของ Google Apps Script
// ถ้าไม่ตั้งค่า ระบบจะทำงานเฉพาะเครื่อง (โหมดสาธิต) โดยไม่ error

import { reverseProvince } from './weather.js';
import { CROPS } from '../data/crops.js';

import { API, callApi, diagnoseApi, MIN_SERVER_VERSION } from './api.js';

export function serverTestUrl() { return API ? API + (API.indexOf('?') >= 0 ? '&' : '?') + 'action=ping' : ''; }
const LOCAL_KEY = 'cs_community_local';
const GRID = 0.01; // ~1.1 กม. ปัดพิกัดเพื่อไม่ให้ระบุแปลงได้

export function gridLat(lat) { return Math.round(lat / GRID) * GRID; }
export function gridLon(lon) { return Math.round(lon / GRID) * GRID; }

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; }
}
function writeLocal(arr) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr.slice(0, 500))); } catch (e) { /* ignore */ }
}

export function communityMode() { return API ? 'online' : 'local'; }

// ───── รหัสเครื่องแบบไม่ระบุตัวตน (Anonymous Device ID) ─────
// สุ่มครั้งเดียวต่อเครื่อง/เบราว์เซอร์ เก็บใน localStorage ไม่เกี่ยวกับ LINE ไม่มีชื่อหรือเบอร์ใดๆ
// เครื่องเดียวมีกี่แปลงก็นับเป็น 1 คน
const DID_KEY = 'cs_device_id_v1';
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DID_KEY);
    if (!id) {
      id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DID_KEY, id);
    }
    return id;
  } catch (e) { return 'dtemp' + Math.random().toString(36).slice(2, 10); }
}

// หาจังหวัดจากพิกัด (จำค่าไว้ ไม่ต้องเรียกซ้ำ) ใช้ Nominatim ก่อน ถ้าไม่ได้ลอง BigDataCloud
const PROV_KEY = 'cs_province_cache_v1';
function cleanProvince(n) {
  if (!n) return null;
  return String(n).replace(/^จังหวัด\s*/, '').replace(/^Changwat\s*/i, '').replace(/\s*Province$/i, '').trim() || null;
}
export async function provinceOf(lat, lon) {
  const k = (+lat).toFixed(2) + ',' + (+lon).toFixed(2);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(PROV_KEY) || '{}'); } catch (e) { cache = {}; }
  if (cache[k]) return cache[k];
  let prov = cleanProvince(await reverseProvince(lat, lon));
  if (!prov) {
    try {
      const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=th');
      if (r.ok) { const j = await r.json(); prov = cleanProvince(j.principalSubdivision); }
    } catch (e) { /* ignore */ }
  }
  if (prov) { cache[k] = prov; try { localStorage.setItem(PROV_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ } }
  return prov;
}

// ข้อ 2: ส่งข้อมูลผู้ใช้งาน (วัน-เวลา จังหวัด รหัสเครื่อง พืชที่ปลูก) ไปที่ชีต "users" อัตโนมัติ
// เรียกตอนเปิดแอป และเมื่อรายการแปลง/พืชเปลี่ยน ฝั่ง Apps Script จะ "อัปเดตแถวเดิมของเครื่องนี้" ไม่เพิ่มแถวซ้ำ
// ไม่มีธงว่า "ส่งแล้ว" ที่ทำให้ส่งไม่ซ้ำอีก ถ้าครั้งก่อนล้มเหลวครั้งหน้าจะส่งใหม่เอง
export async function syncUser(plots) {
  const list = plots || [];
  const provSet = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.lat === null || p.lat === undefined) continue;
    const pv = await provinceOf(p.lat, p.lon);
    if (pv && provSet.indexOf(pv) < 0) provSet.push(pv);
  }
  const cropSet = [];
  for (let i = 0; i < list.length; i++) {
    const c = CROPS[list[i].crop];
    const nm = (c ? c.name : String(list[i].crop)).replace(/\s*\(.*\)\s*/g, '').trim(); // ตัดวงเล็บออก เพราะชีตใช้ลูกน้ำคั่นรายชื่อพืช
    if (nm && cropSet.indexOf(nm) < 0) cropSet.push(nm);
  }
  if (!API) return false;
  try {
    const r = await callApi({ action: 'visit', data: { did: getDeviceId(), ts: Date.now(), provinces: provSet, crops: cropSet } }, 3, 20000);
    return !!(r && r.ok);
  } catch (e) { return false; }
}

// ───── รายงานการระบาด ─────
function newRid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function markSynced(rid) {
  const arr = readLocal();
  for (let i = 0; i < arr.length; i++) if (arr[i].rid === rid) arr[i].synced = true;
  writeLocal(arr);
}

async function pushReport(rec) {
  try {
    const r = await callApi({ action: 'report', data: rec }, 3, 20000);
    if (r && r.ok) { markSynced(rec.rid); return true; }
  } catch (e) { /* ลองใหม่ตอนเปิดแอป */ }
  return false;
}

// until = เวลาที่รายงานนี้หมดอายุ (คำนวณจากระยะการปลูกของผู้รายงาน) ส่งมาจากหน้าจอ
export async function reportOutbreak(plot, payload) {
  const rec = {
    rid: newRid(),
    did: getDeviceId(),
    lat: +gridLat(plot.lat).toFixed(4),
    lon: +gridLon(plot.lon).toFixed(4),
    crop: plot.crop,
    pest: payload.pest,
    kind: payload.kind || 'insect',
    severity: payload.severity || 'found',
    count: payload.count === undefined ? null : payload.count,
    note: (payload.note || '').slice(0, 140),
    date: payload.date,
    ts: Date.now(),
    until: payload.until || (Date.now() + 14 * 86400000),
    mine: true,
    synced: false
  };
  const arr = readLocal(); arr.unshift(rec); writeLocal(arr);
  if (!API) return { ok: true, mode: 'local', rid: rec.rid };
  const ok = await pushReport(rec);
  // ok=false: ยังไม่ยืนยันว่าถึงชีต ระบบจะลองส่งซ้ำอัตโนมัติทุกครั้งที่เปิดแอป (syncPendingReports)
  return { ok: ok, mode: ok ? 'online' : 'pending', rid: rec.rid };
}

// ส่งซ้ำรายงานที่ยังไม่ถึงเซิร์ฟเวอร์ (เช่นส่งตอนสคริปต์ยังไม่ Deploy หรือออฟไลน์) เรียกตอนเปิดแอป
export async function syncPendingReports() {
  if (!API) return 0;
  const now = Date.now();
  const pending = readLocal().filter(function (r) { return r.mine && !r.synced && r.rid && (!r.until || r.until > now); });
  let n = 0;
  for (let i = 0; i < pending.length; i++) {
    if (await pushReport(pending[i])) n++;
  }
  // รายงานที่ถูกกดกำจัดแล้วแต่ยังไม่ซิงก์ ให้แจ้งเซิร์ฟเวอร์ด้วย
  const res = readLocal().filter(function (r) { return r.mine && r.resolved && !r.resolvedSynced && r.rid; });
  for (let i = 0; i < res.length; i++) {
    let okR = false;
    try { const rr = await callApi({ action: 'resolve', data: { rid: res[i].rid, did: getDeviceId() } }, 2, 15000); okR = !!(rr && rr.ok); } catch (e) { okR = false; }
    if (!okR) continue;
    const arr = readLocal();
    for (let j = 0; j < arr.length; j++) if (arr[j].rid === res[i].rid) arr[j].resolvedSynced = true;
    writeLocal(arr);
  }
  return n;
}

// ผู้ใช้กด "กำจัดแล้ว": เอารายงานนี้ออกจากแผนที่/การแจ้งเตือนของทุกคน
export async function resolveReport(rid) {
  const arr = readLocal();
  for (let i = 0; i < arr.length; i++) if (arr[i].rid === rid) arr[i].resolved = true;
  writeLocal(arr);
  if (API) {
    try {
      const rr = await callApi({ action: 'resolve', data: { rid: rid, did: getDeviceId() } }, 3, 15000);
      if (rr && rr.ok) {
        const a2 = readLocal();
        for (let i = 0; i < a2.length; i++) if (a2[i].rid === rid) a2[i].resolvedSynced = true;
        writeLocal(a2);
      }
    } catch (e) { /* จะลองส่งซ้ำตอนเปิดแอป */ }
  }
  return true;
}

// จำนวนรายงานของเครื่องนี้ที่ยังไม่ถึงเซิร์ฟเวอร์ (เพื่อนบ้านยังมองไม่เห็น)
export function pendingReportCount() {
  const now = Date.now();
  return readLocal().filter(function (r) { return r.mine && !r.synced && !r.resolved && (!r.until || r.until > now); }).length;
}

// รายงานที่เครื่องนี้ส่งไว้และยังไม่หมดอายุ/ยังไม่กำจัด
export function myActiveReports() {
  const now = Date.now();
  return readLocal().filter(function (r) { return r.mine && !r.resolved && (!r.until || r.until > now); });
}

let nearbyStatus = { ok: false, error: '', serverCount: 0, at: 0, v: 0 };
export function getNearbyStatus() { return nearbyStatus; }

// ทดสอบการเชื่อมต่อเซิร์ฟเวอร์: ตอบกลับสถานะที่คนทั่วไปอ่านเข้าใจ
export async function checkServer() {
  if (!API) return { state: 'no-api', text: 'ยังไม่ได้ตั้งค่า VITE_COMMUNITY_API ใน Vercel' };
  try {
    const r = await callApi({ action: 'ping' }, 2, 20000);
    if (!r) return { state: 'bad', text: 'เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ' };
    if (r.ok === false) return { state: 'bad', text: 'สคริปต์ทำงานแต่มีข้อผิดพลาด: ' + (r.error || 'ไม่ทราบสาเหตุ') };
    if (!r.v || r.v < MIN_SERVER_VERSION) {
      return { state: 'old', text: 'สคริปต์ Apps Script ยังเป็นเวอร์ชันเก่า (ต้องวางโค้ด Code.gs ใหม่แล้ว Deploy เป็น New version)' };
    }
    return { state: 'ok', text: 'เชื่อมต่อเซิร์ฟเวอร์ปกติ (เวอร์ชัน ' + r.v + ') มีรายงานที่ยังใช้งานอยู่ ' + (r.activeReports || 0) + ' รายการ', data: r };
  } catch (e) {
    const d = await diagnoseApi();
    let text;
    if (d.kind === 'login') text = 'สคริปต์ยังไม่เปิดให้ทุกคนเข้าถึง: ใน Deploy ให้ตั้ง "ผู้ที่มีสิทธิ์เข้าถึง" เป็น "ทุกคน" (Anyone)';
    else if (d.kind === 'auth') text = 'สคริปต์ยังไม่ได้รับอนุญาตสิทธิ์: เปิดหน้า Apps Script เลือกฟังก์ชัน setup แล้วกด "เรียกใช้" และกดอนุญาต จากนั้น Deploy เป็น New version';
    else if (d.kind === 'json') text = 'เซิร์ฟเวอร์ตอบได้แต่เวอร์ชัน ' + ((d.data && d.data.v) || 'เก่า') + ' ต้อง Deploy โค้ดใหม่ (Version: New version)';
    else if (d.kind === 'html') text = 'URL นี้ไม่ได้ตอบเป็นข้อมูลของแอป (' + (d.snippet || 'หน้าเว็บ') + ') ตรวจว่าเป็น URL ของ Web app ที่ลงท้าย /exec และ Deploy โค้ดล่าสุดแล้ว';
    else text = 'เบราว์เซอร์ในเครื่องนี้ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ต หรือ URL ใน Vercel และสิทธิ์ "ทุกคน"';
    return { state: 'down', text: text, kind: d.kind };
  }
}

// ดึงรายงานรอบแปลงในรัศมีที่กำหนด
export async function fetchNearby(plot, radiusKm, days) {
  const rad = radiusKm || 5;
  const dayMs = 86400000;
  const since = Date.now() - (days || 14) * dayMs;
  let rows = [];

  nearbyStatus = { ok: false, error: API ? '' : 'no-api', serverCount: 0, at: Date.now(), v: 0 };
  if (API) {
    try {
      const j = await callApi({
        action: 'nearby', days: days || 14,
        lat: gridLat(plot.lat).toFixed(4), lon: gridLon(plot.lon).toFixed(4), radius: rad
      }, 3, 20000);
      if (j && Array.isArray(j.rows)) {
        rows = j.rows;
        nearbyStatus = { ok: true, error: '', serverCount: rows.length, at: Date.now(), v: j.v || 0 };
      } else {
        nearbyStatus.error = (j && j.error) || 'bad-response';
      }
    } catch (e) { nearbyStatus.error = (e && e.message) || 'error'; rows = []; }
  }
  // รวมกับรายงานในเครื่อง (ของตัวเอง) โดยไม่ซ้ำ rid และตัดที่ผู้ใช้กำจัดแล้ว/หมดอายุตามระยะพืชออก
  const local = readLocal();
  const resolvedLocal = {};
  const seen = {};
  for (let i = 0; i < local.length; i++) if (local[i].resolved) resolvedLocal[local[i].rid] = true;
  const merged = [];
  rows.concat(local).forEach(function (r) {
    if (!r) return;
    if (r.rid) { if (seen[r.rid]) return; seen[r.rid] = true; if (resolvedLocal[r.rid]) return; }
    if (r.resolved) return;
    if (r.until && r.until < Date.now()) return;
    merged.push(r);
  });
  rows = merged;
  const mineRids = {};
  for (let i = 0; i < local.length; i++) if (local[i].mine && local[i].rid) mineRids[local[i].rid] = true;
  rows.forEach(function (r) { if (r.rid && mineRids[r.rid]) r.mine = true; });

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.lat === undefined) continue;
    if (r.ts < since) continue;
    const km = haversine(plot.lat, plot.lon, r.lat, r.lon);
    if (km > rad) continue;
    out.push(Object.assign({}, r, {
      km: +km.toFixed(1),
      daysAgo: Math.max(0, Math.round((Date.now() - r.ts) / dayMs)),
      sameCrop: r.crop === plot.crop
    }));
  }
  out.sort(function (a, b) { return b.ts - a.ts; });
  return out;
}

// จัดกลุ่มเพื่อสรุปเป็นข้อความเตือน
export function summarizeNearby(rows) {
  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = r.pest + '|' + r.crop;
    if (!map[k]) map[k] = { pest: r.pest, crop: r.crop, count: 0, nearestKm: 99, latestDays: 99, sameCrop: r.sameCrop };
    map[k].count++;
    if (r.km < map[k].nearestKm) map[k].nearestKm = r.km;
    if (r.daysAgo < map[k].latestDays) map[k].latestDays = r.daysAgo;
  }
  const out = Object.keys(map).map(function (k) { return map[k]; });
  out.sort(function (a, b) { return (a.nearestKm - b.nearestKm) || (a.latestDays - b.latestDays); });
  return out.map(function (g) {
    return Object.assign({}, g, {
      text: 'พบรายงาน' + g.pest + ' ในรัศมี ' + g.nearestKm + ' กม. เมื่อ ' +
        (g.latestDays === 0 ? 'วันนี้' : g.latestDays + ' วันก่อน') +
        ' รวม ' + g.count + ' รายงาน' + (g.sameCrop ? ' (พืชชนิดเดียวกับแปลงคุณ)' : '')
    });
  });
}