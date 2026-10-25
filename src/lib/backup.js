// ระบบสำรอง/กู้คืนข้อมูลสำหรับผู้ใช้ทั่วไป
//  1) รหัสกู้คืน  : สำรองขึ้นระบบกลาง จดรหัส 10 ตัวไว้ ใส่รหัสในเครื่องใหม่ก็ได้ข้อมูลกลับมา (วิธีหลัก)
//  2) ไฟล์สำรอง   : บันทึก/ส่งเป็นไฟล์ .json แล้วเลือกไฟล์กลับเข้ามา
//  3) ข้อความ     : คัดลอก/วางข้อความ (ตัวเลือกขั้นสูง)
import { API, callApi, postApi } from './api.js';
import { exportBackup, parseBackup } from './storage.js';

const CODE_KEY = 'cs_backup_code_v1';
const AT_KEY = 'cs_backup_at_v1';
const AUTO_KEY = 'cs_backup_auto_v1';
const CHANGED_KEY = 'cs_backup_changed_v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function wr(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } }

export function backupAvailable() { return !!API; }
export function getBackupCode() { return rd(CODE_KEY) || ''; }
export function getLastBackupAt() { return Number(rd(AT_KEY)) || 0; }
export function isAutoBackup() { return rd(AUTO_KEY) === '1'; }
export function setAutoBackup(v) { wr(AUTO_KEY, v ? '1' : '0'); }

export function normalizeCode(text) { return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
export function formatCode(code) { return code ? code.slice(0, 5) + '-' + code.slice(5) : ''; }

function makeCode() {
  let c = '';
  try {
    const arr = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (let i = 0; i < 10; i++) c += ALPHABET[arr[i] % ALPHABET.length];
  } catch (e) {
    for (let i = 0; i < 10; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return c;
}

// ข้อมูลเปลี่ยนตั้งแต่สำรองล่าสุดหรือยัง (ไว้เตือน)
export function markChanged() { wr(CHANGED_KEY, Date.now()); }
export function needsBackupReminder(hasData) {
  if (!hasData) return false;
  const last = getLastBackupAt();
  if (!last) return true;
  const changed = Number(rd(CHANGED_KEY)) || 0;
  return changed > last && Date.now() - last > 7 * 86400000;
}

// สำรองขึ้นระบบกลาง: ถ้ายังไม่มีรหัสจะสร้างให้ ส่งแล้วตรวจกลับว่าขนาดตรงกันจริง
export async function cloudBackup(plots, activities) {
  if (!API) return { ok: false, error: 'no-api' };
  let code = getBackupCode();
  if (!code) code = makeCode();
  const data = exportBackup(plots, activities);
  const sent = await postApi({ action: 'backup_put', data: { code: code, data: data } });
  if (!sent) return { ok: false, error: 'send' };
  for (let i = 0; i < 4; i++) {
    await new Promise(function (r) { setTimeout(r, 1500 + i * 1500); });
    try {
      const info = await callApi({ action: 'backup_info', code: code }, 1, 20000);
      if (info && info.found && info.size === data.length) {
        wr(CODE_KEY, code); wr(AT_KEY, Date.now());
        return { ok: true, code: code, size: data.length };
      }
    } catch (e) { /* ลองใหม่ */ }
  }
  return { ok: false, error: 'verify' };
}

// ดึงข้อมูลสำรองจากรหัส (ยังไม่แทนที่ข้อมูลในเครื่อง ให้ผู้ใช้ตรวจก่อน)
export async function cloudFetch(codeText) {
  const code = normalizeCode(codeText);
  if (code.length !== 10) return { ok: false, error: 'format' };
  try {
    const r = await callApi({ action: 'backup_get', code: code }, 2, 30000);
    if (!r || !r.found) return { ok: false, error: 'notfound' };
    const parsed = parseBackup(r.data);
    if (!parsed) return { ok: false, error: 'corrupt' };
    return { ok: true, code: code, at: r.at, data: parsed };
  } catch (e) { return { ok: false, error: 'network' }; }
}

export function adoptCode(code) { wr(CODE_KEY, code); wr(AT_KEY, Date.now()); }

// ───── ไฟล์สำรอง ─────
function fileName() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return 'สำรองข้อมูลปฏิทินเพาะปลูก-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
}

// มือถือ: เปิดหน้าส่ง/บันทึกของเครื่อง (เลือก LINE, Drive, ไฟล์ ได้) คอมพิวเตอร์: ดาวน์โหลดไฟล์
export async function saveBackupFile(plots, activities) {
  const text = exportBackup(plots, activities);
  const name = fileName();
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'ข้อมูลสำรองปฏิทินเพาะปลูก' });
      wr(AT_KEY, Date.now());
      return { ok: true, how: 'share' };
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, error: 'cancel' };
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    wr(AT_KEY, Date.now());
    return { ok: true, how: 'download' };
  } catch (e) { return { ok: false, error: 'download' }; }
}

export function readBackupFile(file) {
  return new Promise(function (resolve) {
    const fr = new FileReader();
    fr.onload = function () {
      const parsed = parseBackup(String(fr.result || ''));
      resolve(parsed ? { ok: true, data: parsed } : { ok: false, error: 'corrupt' });
    };
    fr.onerror = function () { resolve({ ok: false, error: 'read' }); };
    fr.readAsText(file);
  });
}
