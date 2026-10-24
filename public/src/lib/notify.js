import { load, save } from './storage.js';
import { today } from './date.js';

export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifyStatus() {
  if (!notifySupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotify() {
  if (!notifySupported()) return 'unsupported';
  try {
    const p = await Notification.requestPermission();
    if (p === 'granted') save('notifyOn', true);
    return p;
  } catch (e) { return 'denied'; }
}

// เปิดอยู่เมื่อผู้ใช้ไม่ได้ปิดไว้ (ถ้าเครื่องไม่อนุญาต/ไม่รองรับแจ้งเตือนของเครื่อง จะแจ้งเตือนในแอปแทน)
export function notifyEnabled() {
  return load('notifyOn', true) !== false;
}

// โหมดที่ใช้งานจริง: native = แจ้งเตือนของเครื่อง, inapp = แจ้งเตือนในแอป (เช่นเปิดผ่านแอป LINE), blocked = ผู้ใช้บล็อกไว้
export function notifyMode() {
  if (!notifySupported()) return 'inapp';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'default') return 'ask';
  return 'native';
}

// ───── แจ้งเตือนในแอป (ใช้ได้ทุกที่ รวมถึงเปิดผ่านแอป LINE ที่ไม่รองรับ Notification) ─────
export function toast(title, body, tab) {
  try { window.dispatchEvent(new CustomEvent('cs-toast', { detail: { title: title, body: body, tab: tab || null, at: Date.now() } })); } catch (e) { /* ignore */ }
}

// แจ้งเตือนของเครื่อง: ใช้ Service Worker (จำเป็นบน Chrome มือถือ) ถ้าไม่ได้ลองแบบเดิม
async function showNative(title, body, tag) {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body: body, tag: tag, icon: '/icon.svg', badge: '/icon.svg' });
      return true;
    }
  } catch (e) { /* ลองวิธีถัดไป */ }
  try {
    const n = new Notification(title, { body: body, tag: tag });
    n.onclick = function () { window.focus(); n.close(); };
    return true;
  } catch (e) { return false; }
}

// ส่งทั้งสองทาง: ป๊อปอัปในแอป (ถ้ากำลังเปิดแอปอยู่) และแจ้งเตือนของเครื่อง (ถ้าอนุญาต)
async function deliver(title, body, tag, tab) {
  toast(title, body, tab);
  const native = await showNative(title, body, tag);
  return native ? 'native' : 'inapp';
}

export function setNotifyEnabled(v) { save('notifyOn', !!v); }

function sentKey(plotId) { return 'notifySent:' + plotId + ':' + today(); }

/** ส่งแจ้งเตือนผ่านเบราว์เซอร์เฉพาะรายการที่ยังไม่เคยแจ้งในวันนี้ */
export function pushAlerts(plot, alerts, cropName) {
  if (!notifyEnabled() || !plot || !alerts) return 0;
  const important = alerts.filter(function (a) { return a.level === 'high' || a.level === 'alert'; });
  if (!important.length) return 0;

  const sent = load(sentKey(plot.id), []);
  const fresh = important.filter(function (a) { return sent.indexOf(a.id) < 0; });
  if (!fresh.length) return 0;

  const head = fresh[0];
  const title = (head.level === 'high' ? 'เฝ้าระวังสูง ' : 'แจ้งเตือน ') + head.name;
  const more = fresh.length > 1 ? ' และอีก ' + (fresh.length - 1) + ' รายการ' : '';
  const body = 'แปลง ' + plot.name + ' (' + cropName + ')\n' + head.progress + more + '\nเปิดแอปเพื่อดูคำแนะนำการจัดการ';

  deliver(title, body, 'csc-' + plot.id, 'home');

  const ids = sent.concat(fresh.map(function (a) { return a.id; }));
  save(sentKey(plot.id), ids);
  return fresh.length;
}

export async function testNotify() {
  const how = await deliver('ทดสอบการแจ้งเตือน', 'ระบบแจ้งเตือนทำงานปกติ เมื่อมีโรคแมลงเข้าเกณฑ์ หรือมีรายงานระบาดใกล้แปลง จะแจ้งแบบนี้', 'csc-test', null);
  return how;
}

/** แจ้งเตือนเมื่อมีรายงานระบาดใหม่จากแปลงข้างเคียง (พืชชนิดเดียวกัน) */
export function pushNearby(plot, cropName, rows) {
  if (!notifyEnabled() || !rows || !rows.length) return 0;
  const head = rows[0];
  const more = rows.length > 1 ? ' และอีก ' + (rows.length - 1) + ' รายงาน' : '';
  deliver('มีรายงานระบาดใกล้แปลงคุณ',
    head.pest + ' (' + cropName + ') ห่างประมาณ ' + head.km + ' กม.' + more,
    'csc-nearby-' + plot.id, 'area');
  return rows.length;
}
