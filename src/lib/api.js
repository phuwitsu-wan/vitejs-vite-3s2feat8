// ตัวเชื่อมต่อกับ Google Apps Script (เซิร์ฟเวอร์ส่วนกลางของแอป)
// ใช้วิธี JSONP (โหลดผ่านแท็ก script) แทน fetch เพราะ:
//  - ไม่ติดข้อจำกัด CORS และการ redirect ของ Apps Script (ซึ่งบนมือถือ/เว็บวิวภายในแอปมักพังเงียบๆ)
//  - ได้คำตอบจริงจากเซิร์ฟเวอร์ทุกครั้ง จึงยืนยันได้ว่า "ถึงเซิร์ฟเวอร์แล้ว" ไม่ต้องเดา
export const API = import.meta.env.VITE_COMMUNITY_API || '';
export const MIN_SERVER_VERSION = 8;

let seq = 0;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

export function jsonp(params, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (!API) { reject(new Error('no-api')); return; }
    const name = '__csb' + Date.now().toString(36) + (seq++);
    const qs = Object.keys(params).map(function (k) {
      const v = params[k];
      return encodeURIComponent(k) + '=' + encodeURIComponent(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
    }).join('&');
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

// เรียกพร้อมลองใหม่อัตโนมัติ (Apps Script ครั้งแรกที่ตื่นอาจช้า 5-10 วินาที)
export async function callApi(params, tries, timeoutMs) {
  let last = null;
  const n = tries || 3;
  for (let i = 0; i < n; i++) {
    try { return await jsonp(params, timeoutMs); }
    catch (e) { last = e; if (e && e.message === 'no-api') throw e; await sleep(700 * (i + 1)); }
  }
  throw last;
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
