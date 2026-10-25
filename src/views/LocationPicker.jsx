import React, { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './OutbreakMap.jsx';
import { reverseGeocode } from '../lib/weather.js';
import {
  detectInApp, openInBrowser, cleanUrl, copyToClipboard,
  locateGps, gpsErrorText, searchPlace
} from '../lib/platform.js';

const TH_CENTER = [15.0, 101.0];

// เลือกตำแหน่งแปลงได้ 4 วิธี ใช้ได้ทุกแพลตฟอร์ม แม้ GPS ถูกบล็อก (เช่นเปิดผ่านแอป Facebook/LINE)
//  1) GPS  2) แตะเลือกบนแผนที่ (มีภาพดาวเทียม)  3) ค้นหาชื่อสถานที่  4) วางพิกัด/ลิงก์ Google Maps
export default function LocationPicker({ lat, lon, onPick }) {
  const env = detectInApp();
  const [msg, setMsg] = useState(null);       // { kind, text }
  const [busy, setBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latRef = useRef(lat); const lonRef = useRef(lon);
  latRef.current = lat; lonRef.current = lon;

  const hasPos = lat !== null && lat !== undefined && lon !== null && lon !== undefined && lat !== '' && lon !== '';

  const apply = async function (la, lo, how) {
    const name = await reverseGeocode(la, lo).catch(function () { return ''; });
    onPick(+(+la).toFixed(6), +(+lo).toFixed(6), name || '');
    setMsg({ kind: 'ok', text: (how || 'ตั้งตำแหน่งแล้ว') + ' ' + (+la).toFixed(5) + ', ' + (+lo).toFixed(5) + (name ? ' · ' + name : '') });
  };

  const useGps = async function () {
    setBusy(true); setMsg({ kind: 'info', text: 'กำลังอ่านตำแหน่งจาก GPS...' });
    try {
      const pos = await locateGps();
      await apply(pos.lat, pos.lon, 'ได้ตำแหน่งจาก GPS (แม่นยำประมาณ ' + Math.round(pos.acc) + ' ม.)');
      if (mapRef.current) { mapRef.current.setView([pos.lat, pos.lon], 16); }
    } catch (e) {
      setMsg({ kind: 'warn', text: gpsErrorText(e, env) + ' — เลือกวิธีอื่นด้านล่างแทนได้เลย (แตะเลือกบนแผนที่ หรือค้นหาชื่อสถานที่)' });
      setShowMap(true);
    }
    setBusy(false);
  };

  const doSearch = async function () {
    if (q.trim().length < 2) return;
    setBusy(true); setResults([]);
    const r = await searchPlace(q.trim());
    setBusy(false);
    setResults(r);
    if (!r.length) setMsg({ kind: 'warn', text: 'ไม่พบสถานที่นี้ ลองพิมพ์ชื่อตำบล/อำเภอ/จังหวัด หรือแตะเลือกบนแผนที่' });
  };

  const chooseResult = async function (r) {
    setResults([]); setQ(''); setShowMap(true);
    await apply(r.lat, r.lon, 'เลือกสถานที่แล้ว');
    if (mapRef.current) mapRef.current.setView([r.lat, r.lon], 15);
  };

  // ───── แผนที่ ─────
  useEffect(function () {
    if (!showMap) return undefined;
    let dead = false;
    loadLeaflet().then(function (L) {
      if (dead || !boxRef.current || mapRef.current) return;
      const has = latRef.current !== null && latRef.current !== undefined && latRef.current !== '';
      const center = has ? [Number(latRef.current), Number(lonRef.current)] : TH_CENTER;
      const map = L.map(boxRef.current).setView(center, has ? 16 : 6);
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
      osm.addTo(map);
      L.control.layers({ 'แผนที่': osm, 'ภาพดาวเทียม': sat }, null, { position: 'topright' }).addTo(map);
      mapRef.current = map;
      const place = function (la, lo) {
        if (markerRef.current) markerRef.current.setLatLng([la, lo]);
        else {
          markerRef.current = L.marker([la, lo], { draggable: true }).addTo(map);
          markerRef.current.on('dragend', function () { const p = markerRef.current.getLatLng(); apply(p.lat, p.lng, 'ย้ายหมุดแล้ว'); });
        }
      };
      if (has) place(center[0], center[1]);
      map.on('click', function (ev) { place(ev.latlng.lat, ev.latlng.lng); apply(ev.latlng.lat, ev.latlng.lng, 'ปักหมุดแล้ว'); });
      setTimeout(function () { map.invalidateSize(); }, 250);
    }).catch(function () { setMsg({ kind: 'warn', text: 'โหลดแผนที่ไม่สำเร็จ (ต้องมีอินเทอร์เน็ต) กรอกละติจูด/ลองจิจูดเองแทนได้' }); });
    return function () {
      dead = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
  }, [showMap]);

  // เมื่อพิกัดเปลี่ยนจากภายนอก (วางพิกัด/UTM/GPS) ให้หมุดตามไปด้วย
  useEffect(function () {
    const L = window.L;
    if (!mapRef.current || !L || !hasPos) return;
    const la = Number(lat), lo = Number(lon);
    if (markerRef.current) markerRef.current.setLatLng([la, lo]);
    else {
      markerRef.current = L.marker([la, lo], { draggable: true }).addTo(mapRef.current);
      markerRef.current.on('dragend', function () { const p = markerRef.current.getLatLng(); apply(p.lat, p.lng, 'ย้ายหมุดแล้ว'); });
    }
  }, [lat, lon]);

  const copyLink = async function () {
    const ok = await copyToClipboard(cleanUrl(window.location.href));
    setMsg({ kind: ok ? 'ok' : 'warn', text: ok ? 'คัดลอกลิงก์แล้ว นำไปวางในเบราว์เซอร์ Chrome/Safari ได้เลย' : 'คัดลอกไม่สำเร็จ กรุณากดค้างที่แถบที่อยู่เพื่อคัดลอกเอง' });
  };

  return (
    <div className="locpick">
      {env.inApp && (
        <div className="lp-note">
          <b>คุณเปิดผ่านแอป {env.name}</b> แอปนี้มักบล็อกการอ่านตำแหน่ง GPS ถ้ากด GPS ไม่ได้ ให้ใช้ "แตะเลือกบนแผนที่" ด้านล่างได้เลย
          หรือเปิดหน้านี้ในเบราว์เซอร์: {env.name === 'LINE' ? 'กดปุ่มด้านล่าง' : 'แตะเมนู ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" หรือคัดลอกลิงก์'}
          <div className="row gap mt">
            <button type="button" className="btn btn-sm flex1" onClick={function () { setMsg({ kind: 'info', text: openInBrowser() }); }}>เปิดในเบราว์เซอร์</button>
            <button type="button" className="btn btn-sm flex1" onClick={copyLink}>คัดลอกลิงก์</button>
          </div>
        </div>
      )}

      <div className="row gap">
        <button type="button" className="btn flex1" disabled={busy} onClick={useGps}>{'\u{1F4CD}'} ใช้ตำแหน่งปัจจุบัน</button>
        <button type="button" className={'btn flex1 ' + (showMap ? 'btn-on' : '')} onClick={function () { setShowMap(!showMap); }}>{'\u{1F5FA}️'} {showMap ? 'ซ่อนแผนที่' : 'เลือกบนแผนที่'}</button>
      </div>

      {msg && <div className={'lp-msg lp-' + msg.kind}>{msg.text}</div>}

      {showMap && (
        <div className="mt">
          <div className="row gap">
            <input className="flex1 lp-input" type="search" placeholder="ค้นหาชื่อสถานที่ เช่น ตำบล อำเภอ จังหวัด" value={q}
              onChange={function (e) { setQ(e.target.value); }}
              onKeyDown={function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } }} />
            <button type="button" className="btn" disabled={busy} onClick={doSearch}>ค้นหา</button>
          </div>
          {results.length > 0 && (
            <div className="lp-results">
              {results.map(function (r, i) {
                return <button type="button" key={i} onClick={function () { chooseResult(r); }}>{r.name}</button>;
              })}
            </div>
          )}
          <div ref={boxRef} className="lp-map" />
          <div className="small muted">แตะบนแผนที่เพื่อปักหมุดตำแหน่งแปลง ลากหมุดเพื่อปรับ ซูมเข้าให้เห็นแปลงก่อนปัก (มุมขวาบนสลับเป็นภาพดาวเทียมได้)</div>
        </div>
      )}


      {hasPos && <div className="small muted mt">ตำแหน่งที่จะใช้บันทึก: {Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}</div>}
    </div>
  );
}
