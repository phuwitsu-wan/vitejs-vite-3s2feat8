// ตัวเชื่อมต่อกับ Google Apps Script (เซิร์ฟเวอร์ส่วนกลางของแอป)
// ใช้วิธี JSONP (โหลดผ่านแท็ก script) แทน fetch เพราะ:
//  - ไม่ติดข้อจำกัด CORS และการ redirect ของ Apps Script (ซึ่งบนมือถือ/เว็บวิวภายในแอปมักพังเงียบๆ)
//  - ได้คำตอบจริงจากเซิร์ฟเวอร์ทุกครั้ง จึงยืนยันได้ว่า "ถึงเซิร์ฟเวอร์แล้ว" ไม่ต้องเดา
export const API = import.meta.env.VITE_COMMUNITY_API || '';
export const MIN_SERVER_VERSION = 9;

let seq = 0;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

export function jsonp(params, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (!API) { reject(new Error('no-api')); return; }
    const name = '__csb' + Date.now().toString(36) + (seq++);
    const qs = buildQuery(params);
    const s = document.createElement('script');
    let done = false;
    let timer = null;
    const cleanup = function () {
      done = true; clearTimeout(timer);
      try { delete window[name]; } catch (e) { window[name] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    };
    timer = setTimeout(function () { if (!done) { cleanup(); reject(new Error('timeout')); } }, timeoutMs || 20000);
    window[name] = function (d) { if (done) return; cleanup(); resolve(d); };
    s.onerror = function () { if (!done) { cleanup(); reject(new Error('load-error')); } };
    s.src = API + (API.indexOf('?') >= 0 ? '&' : '?') + qs + '&callback=' + name + '&_=' + Date.now();
    document.head.appendChild(s);
  });
}

function buildQuery(params) {
  return Object.keys(params).map(function (k) {
    const v = params[k];
    return encodeURIComponent(k) + '=' + encodeURIComponent(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  }).join('&');
}

// ทางสำรอง: เรียกด้วย fetch ธรรมดา (บางเครื่อง/บางเว็บวิวบล็อกแท็ก script แต่ fetch ผ่าน หรือกลับกัน)
async function fetchJson(params, timeoutMs) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 20000);
  try {
    const res = await fetch(API + (API.indexOf('?') >= 0 ? '&' : '?') + buildQuery(params) + '&_=' + Date.now(), ctl ? { signal: ctl.signal } : {});
    const text = await res.text();
    return parseServerText(text);
  } finally { clearTimeout(timer); }
}

function parseServerText(text) {
  let t = String(text || '').trim();
  const m = t.match(/^[A-Za-z0-9_.$]+\(([\s\S]*)\);?$/);
  if (m) t = m[1];
  return JSON.parse(t);
}

// เรียกพร้อมลองใหม่อัตโนมัติ: รอบละ 2 ทาง (JSONP แล้วตามด้วย fetch) (Apps Script ครั้งแรกที่ตื่นอาจช้า 5-10 วินาที)
export async function callApi(params, tries, timeoutMs) {
  let last = null;
  const n = tries || 3;
  for (let i = 0; i < n; i++) {
    try { return await jsonp(params, timeoutMs); }
    catch (e) {
      last = e;
      if (e && e.message === 'no-api') throw e;
      try { return await fetchJson(params, timeoutMs); } catch (e2) { /* ลองรอบถัดไป */ }
      await sleep(700 * (i + 1));
    }
  }
  throw last;
}

// วินิจฉัยว่าเชื่อมต่อเซิร์ฟเวอร์ไม่ได้เพราะอะไร (ไว้บอกผู้ดูแลให้แก้ถูกจุด)
export async function diagnoseApi() {
  if (!API) return { kind: 'no-api' };
  try {
    const res = await fetch(API + (API.indexOf('?') >= 0 ? '&' : '?') + 'action=ping&_=' + Date.now());
    const text = await res.text();
    try { const j = parseServerText(text); return { kind: 'json', data: j }; } catch (e) { /* ไม่ใช่ JSON */ }
    if (/ServiceLogin|accounts\.google\.com|Sign in/i.test(text)) return { kind: 'login' };
    if (/authorization|authorize|สิทธิ์/i.test(text)) return { kind: 'auth', snippet: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160) };
    return { kind: 'html', snippet: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160) };
  } catch (e) {
    return { kind: 'blocked' };
  }
}

// ส่ง POST แบบไม่รออ่านคำตอบ ใช้กับข้อมูลก้อนใหญ่ (สำรองข้อมูล) ที่ใส่ใน URL ไม่ไหว
export async function postApi(payload) {
  if (!API) return false;
  try {
    await fetch(API, {
      method: 'POST', mode: 'no-cors', keepalive: false,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (e) { return false; }
}
