// ตัวช่วยให้แอปใช้งานได้ทุกแพลตฟอร์ม (Chrome, Safari, แอป LINE, Facebook, Instagram ฯลฯ)

// ตรวจว่าเปิดอยู่ในเบราว์เซอร์ที่ฝังอยู่ในแอป (มักบล็อก GPS, การแจ้งเตือน, การดาวน์โหลดไฟล์)
export function detectInApp() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  let name = '';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) name = 'Facebook';
  else if (/Instagram/i.test(ua)) name = 'Instagram';
  else if (/\bLine\//i.test(ua)) name = 'LINE';
  else if (/MicroMessenger/i.test(ua)) name = 'WeChat';
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) name = 'TikTok';
  else if (/Messenger/i.test(ua)) name = 'Messenger';
  return { inApp: !!name, name: name, android: android, ios: ios };
}

// ล้างพารามิเตอร์ติดตามที่แอปต่างๆ แปะท้ายลิงก์ (เช่น fbclid จาก Facebook) ให้ได้ลิงก์สะอาดของแอป
const TRACKING = /^(fbclid|mibextid|igshid|igsh|gclid|gbraid|wbraid|msclkid|ttclid|twclid|_ga|_gl|ref_src|openExternalBrowser|utm_[a-z_]+)$/i;
export function cleanUrl(href) {
  try {
    const u = new URL(href || window.location.href);
    const del = [];
    u.searchParams.forEach(function (v, k) { if (TRACKING.test(k)) del.push(k); });
    del.forEach(function (k) { u.searchParams.delete(k); });
    return u.origin + u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
  } catch (e) { return href || ''; }
}

// เปลี่ยนแถบที่อยู่ให้สะอาด (ลบ fbclid ฯลฯ) โดยไม่โหลดหน้าใหม่
export function cleanAddressBar() {
  try {
    const c = cleanUrl(window.location.href);
    if (c && c !== window.location.origin + window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', c + window.location.hash);
    }
  } catch (e) { /* ignore */ }
}

// พยายามส่งต่อหน้านี้ไปเปิดในเบราว์เซอร์หลักของเครื่องด้วยลิงก์ที่ล้างค่าแล้ว
// คืนค่าข้อความอธิบายขั้นตอนที่ผู้ใช้ต้องทำเองถ้าเครื่องนี้สั่งเปิดอัตโนมัติไม่ได้
export function openInBrowser() {
  const info = detectInApp();
  const url = cleanUrl(window.location.href);
  try {
    if (info.name === 'LINE') {                       // LINE มีพารามิเตอร์ทางการสำหรับเปิดเบราว์เซอร์ภายนอก
      const u = new URL(url); u.searchParams.set('openExternalBrowser', '1');
      window.location.href = u.toString();
      return 'กำลังเปิดในเบราว์เซอร์ หากไม่เปลี่ยนหน้า ให้แตะเมนู ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์อื่น"';
    }
    const u = new URL(url);
    if (info.android) {                                // Android: ส่งต่อไป Chrome ถ้าไม่มี Chrome จะเปิดลิงก์ปกติ
      window.location.href = 'intent://' + u.host + u.pathname + u.search +
        '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
      return 'กำลังเปิดใน Chrome หากไม่เปลี่ยนหน้า ให้แตะเมนู ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" หรือกด "คัดลอกลิงก์" ไปวางใน Chrome';
    }
    if (info.ios) {                                    // iPhone: ลอง Safari/Chrome ตามลำดับ (บางแอปไม่อนุญาต)
      window.location.href = 'x-safari-' + url;
      setTimeout(function () { if (document.visibilityState === 'visible') window.location.href = 'googlechromes://' + u.host + u.pathname + u.search; }, 900);
      return 'หากไม่เปลี่ยนหน้า ให้แตะเมนู ⋯ (หรือไอคอนเข็มทิศ) แล้วเลือก "เปิดใน Safari" หรือกด "คัดลอกลิงก์" ไปวางใน Safari';
    }
  } catch (e) { /* ignore */ }
  return 'แตะเมนู ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" หรือกด "คัดลอกลิงก์" ไปวางในเบราว์เซอร์';
}

// คัดลอกข้อความ: ใช้ Clipboard API ก่อน ถ้าถูกบล็อก (เว็บวิวหลายแอป) ใช้วิธีสำรอง
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* ลองวิธีสำรอง */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) { return false; }
}

// อ่านพิกัดจากข้อความที่ผู้ใช้วาง: "16.4321, 102.8236" หรือลิงก์ Google Maps (@lat,lon / q=lat,lon / !3dlat!4dlon)
export function parseCoords(text) {
  const t = decodeURIComponent(String(text || '')).trim();
  if (!t) return null;
  let m = t.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
          t.match(/[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+)[, ]\s*(-?\d{1,3}\.\d+)/) ||
          t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
          t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
}

// อ่านตำแหน่งจาก GPS พร้อมลองใหม่แบบลดความแม่นยำ และแปลรหัสข้อผิดพลาดเป็นภาษาไทย
export function locateGps() {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) { reject({ code: 0, message: 'unsupported' }); return; }
    const attempt = function (high, timeout, retry) {
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); },
        function (err) {
          if (retry && err && err.code !== 1) attempt(false, 15000, false); // ไม่ใช่ถูกปฏิเสธ -> ลองแบบประหยัดแบตก่อนยอมแพ้
          else reject({ code: err ? err.code : 2, message: err ? err.message : '' });
        },
        { enableHighAccuracy: high, timeout: timeout, maximumAge: 300000 }
      );
    };
    attempt(true, 12000, true);
  });
}

export function gpsErrorText(err, inApp) {
  const where = inApp && inApp.inApp ? ' (แอป ' + inApp.name + ' มักบล็อกการใช้ GPS)' : '';
  if (!err || err.code === 0) return 'เครื่องหรือเบราว์เซอร์นี้ไม่รองรับ GPS' + where;
  if (err.code === 1) return 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง' + where;
  if (err.code === 3) return 'อ่านตำแหน่งนานเกินไป สัญญาณ GPS อ่อน';
  return 'อ่านตำแหน่งไม่ได้ในขณะนี้' + where;
}

// ตำแหน่งโดยประมาณจากอินเทอร์เน็ต (ระดับอำเภอ/จังหวัด) ใช้ได้แม้ GPS ถูกบล็อก ให้ผู้ใช้ไปปรับละเอียดบนแผนที่ต่อ
export async function approxLocation() {
  try {
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=th');
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') return null;
    return { lat: +j.latitude.toFixed(5), lon: +j.longitude.toFixed(5), place: [j.locality, j.principalSubdivision].filter(Boolean).join(' ') };
  } catch (e) { return null; }
}

// ค้นหาชื่อสถานที่ในประเทศไทย
export async function searchPlace(q) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=th&accept-language=th&q=' + encodeURIComponent(q));
    if (!r.ok) return [];
    const j = await r.json();
    return j.map(function (x) { return { name: x.display_name, lat: +x.lat, lon: +x.lon }; });
  } catch (e) { return []; }
}
