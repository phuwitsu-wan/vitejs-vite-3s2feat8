import React from 'react';
import { thaiDateShort, toDate } from '../lib/date.js';

const TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function WaterChart({ water }) {
  if (!water || !water.rows || !water.rows.length) return null;
  const rows = water.rows;
  const W = 520, H = 185, padL = 34, padR = 10, padT = 10, padB = 40;
  const iw = W - padL - padR, ih = H - padT - padB;
  const taw = rows[0].taw, raw = rows[0].raw;
  const maxRain = Math.max(10, Math.max.apply(null, rows.map(function (r) { return r.rain; })));
  const bw = iw / rows.length;

  const yDep = function (v) { return padT + (v / taw) * ih; };
  const yRain = function (v) { return padT + ih - (v / maxRain) * ih * 0.5; };

  let path = '';
  for (let i = 0; i < rows.length; i++) {
    const x = padL + bw * i + bw / 2;
    const y = yDep(rows[i].depletion);
    path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }

  const todayIdx = rows.findIndex(function (r) { return r.isToday; });
  const todayX = todayIdx >= 0 ? padL + bw * todayIdx + bw / 2 : null;

  // ป้ายวันที่ทุก 2 วัน แสดงแค่ตัวเลขวัน (ไม่เอียงข้อความ อ่านง่ายไม่ทับกัน)
  // ส่วนชื่อเดือนโชว์เฉพาะวันแรกของเดือนนั้น ๆ เป็นอีกแถวด้านล่าง กันข้อความแน่นเกินไป
  const dateLabels = [];
  for (let i = 0; i < rows.length; i += 2) dateLabels.push(i);
  if (dateLabels[dateLabels.length - 1] !== rows.length - 1) dateLabels.push(rows.length - 1);

  const dayRowY = padT + ih + 13;
  const monthRowY = padT + ih + 25;
  let lastMonth = null;
  const monthLabels = [];
  for (let k = 0; k < dateLabels.length; k++) {
    const i = dateLabels[k];
    const d = toDate(rows[i].date);
    const m = d.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ x: padL + bw * i + bw / 2, text: TH_MONTH_SHORT[m] });
      lastMonth = m;
    }
  }

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet">
        <rect x={padL} y={padT} width={iw} height={yDep(raw) - padT} fill="#F0FBF4" />
        <rect x={padL} y={yDep(raw)} width={iw} height={padT + ih - yDep(raw)} fill="#FFF5F5" />
        {rows.map(function (r, i) {
          const x = padL + bw * i;
          const y = yRain(r.rain);
          return r.rain > 0 ? <rect key={'b' + i} x={x + 1} y={y} width={Math.max(1, bw - 2)} height={padT + ih - y} fill="#1C7ED6" opacity="0.5" /> : null;
        })}
        <line x1={padL} y1={yDep(raw)} x2={W - padR} y2={yDep(raw)} stroke="#1F2429" strokeDasharray="4 3" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="#E8590C" strokeWidth="2.2" />
        {todayX !== null && (
          <>
            <line x1={todayX} y1={padT} x2={todayX} y2={padT + ih} stroke="#2B8A3E" strokeWidth="1.5" strokeDasharray="3 2" />
            <text x={todayX} y={padT - 2} fontSize="8" fill="#2B8A3E" textAnchor="middle" fontWeight="700">วันนี้</text>
          </>
        )}
        <text x="2" y={padT + 8} fontSize="9" fill="#7A858E">0</text>
        <text x="2" y={yDep(raw) + 3} fontSize="9" fill="#7A858E">เกณฑ์</text>
        <text x="2" y={padT + ih} fontSize="9" fill="#7A858E">{Math.round(taw)}</text>
        {dateLabels.map(function (i) {
          const x = padL + bw * i + bw / 2;
          return (
            <text key={'d' + i} x={x} y={dayRowY} fontSize="8.5" fill="#495057" textAnchor="middle">
              {toDate(rows[i].date).getDate()}
            </text>
          );
        })}
        {monthLabels.map(function (m, i) {
          return (
            <text key={'m' + i} x={m.x} y={monthRowY} fontSize="8" fill="#7A858E" textAnchor="middle" fontWeight="600">
              {m.text}
            </text>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span className="cl-item"><i className="cl-bar" />ฝน (มม.)</span>
        <span className="cl-item"><i className="cl-line" />น้ำที่ดินสูญไป (มม.)</span>
        <span className="cl-item"><i className="cl-dash" />เกณฑ์ต้องให้น้ำ</span>
        <span className="cl-item"><i className="cl-today" />วันนี้</span>
      </div>
    </div>
  );
}