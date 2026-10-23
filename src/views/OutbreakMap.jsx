import React, { useEffect, useRef, useState } from 'react';

// แผนที่แสดงวงสีตามระดับการระบาด ใช้ Leaflet โหลดจาก CDN ตอนเปิดหน้านี้ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
// แผนที่พื้นหลังจาก OpenStreetMap
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

let leafletPromise = null;
function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise(function (resolve, reject) {
    try {
      if (!document.querySelector('link[data-leaflet]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = LEAFLET_CSS; l.setAttribute('data-leaflet', '1');
        document.head.appendChild(l);
      }
      const sc = document.createElement('script');
      sc.src = LEAFLET_JS; sc.async = true;
      sc.onload = function () { window.L ? resolve(window.L) : reject(new Error('no leaflet')); };
      sc.onerror = function () { leafletPromise = null; reject(new Error('โหลดแผนที่ไม่สำเร็จ')); };
      document.head.appendChild(sc);
    } catch (e) { leafletPromise = null; reject(e); }
  });
  return leafletPromise;
}

export const LEVELS = [
  { id: 1, label: 'พบประปราย (เฝ้าระวัง)', color: '#F5B800' },
  { id: 2, label: 'ถึงเกณฑ์ต้องจัดการ', color: '#F57C00' },
  { id: 3, label: 'ระบาดรุนแรง', color: '#D32F2F' }
];

const WEIGHT = { found: 1, threshold: 2, outbreak: 3 };

// รวมรายงานตามช่องตาราง (กริด ~1 กม.) แล้วให้ระดับตามความรุนแรงและจำนวนรายงาน
export function buildCells(rows) {
  const map = {};
  rows.forEach(function (r) {
    const k = r.lat.toFixed(2) + ',' + r.lon.toFixed(2);
    if (!map[k]) map[k] = { lat: r.lat, lon: r.lon, count: 0, score: 0, maxSev: 0, pests: {} };
    const c = map[k];
    const w = WEIGHT[r.severity] || 1;
    c.count++; c.score += w; if (w > c.maxSev) c.maxSev = w;
    c.pests[r.pest] = (c.pests[r.pest] || 0) + 1;
  });
  return Object.keys(map).map(function (k) {
    const c = map[k];
    let level = 1;
    if (c.maxSev === 3 || c.score >= 6) level = 3;
    else if (c.maxSev === 2 || c.score >= 3) level = 2;
    return Object.assign(c, { level: level });
  });
}

export default function OutbreakMap({ plot, rows, radiusKm }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(function () {
    let dead = false;
    loadLeaflet().then(function (L) {
      if (dead || !boxRef.current || mapRef.current) return;
      const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView([plot.lat, plot.lon], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
      setTimeout(function () { map.invalidateSize(); }, 200);
    }).catch(function (e) { if (!dead) setErr(e.message || 'โหลดแผนที่ไม่สำเร็จ'); });
    return function () {
      dead = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; }
    };
  }, []);

  useEffect(function () {
    const L = window.L;
    const map = mapRef.current, layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const bounds = [];

    // วงรัศมีที่เลือก
    L.circle([plot.lat, plot.lon], {
      radius: radiusKm * 1000, color: '#607D8B', weight: 1.5, dashArray: '6 6', fill: false
    }).addTo(layer);
    bounds.push(L.latLng(plot.lat, plot.lon).toBounds(radiusKm * 2000));

    // วงสีระดับการระบาด
    buildCells(rows).forEach(function (c) {
      const lv = LEVELS[c.level - 1];
      const radius = 550 + Math.min(c.count, 6) * 120;
      const circ = L.circle([c.lat, c.lon], {
        radius: radius, color: lv.color, weight: 2, fillColor: lv.color, fillOpacity: 0.38
      }).addTo(layer);
      const list = Object.keys(c.pests).map(function (n) { return n + ' (' + c.pests[n] + ' รายงาน)'; }).join('<br/>');
      circ.bindPopup('<b>' + lv.label + '</b><br/>' + list);
      bounds.push(circ.getBounds());
    });

    // แปลงของฉัน
    L.circleMarker([plot.lat, plot.lon], {
      radius: 8, color: '#fff', weight: 3, fillColor: '#1565C0', fillOpacity: 1
    }).addTo(layer).bindTooltip('แปลงของคุณ', { permanent: false });

    try {
      let b = bounds[0];
      for (let i = 1; i < bounds.length; i++) b = b.extend(bounds[i]);
      map.fitBounds(b, { padding: [16, 16], maxZoom: 14 });
    } catch (e) { /* ignore */ }
  }, [ready, rows, radiusKm, plot.lat, plot.lon]);

  return (
    <div>
      {err ? (
        <p className="small muted">{err} (ต้องมีอินเทอร์เน็ตเพื่อแสดงแผนที่)</p>
      ) : (
        <div ref={boxRef} className="outbreak-map" />
      )}
      <div className="map-legend">
        <span><i className="dot-you" /> แปลงของคุณ</span>
        {LEVELS.map(function (l) {
          return <span key={l.id}><i style={{ background: l.color }} /> {l.label}</span>;
        })}
      </div>
    </div>
  );
}
