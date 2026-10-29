import React from 'react';
import { createPortal } from 'react-dom';
import { TASK_META } from '../data/crops.js';
import { thaiDate, thaiDateShort } from '../lib/date.js';
import { onePagerText } from '../lib/onepager.js';
import { copyToClipboard } from '../lib/platform.js';

const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function OnePager({ op, onClose }) {
  const doCopy = async function () {
    const txt = onePagerText(op);
    if (await copyToClipboard(txt)) window.alert('คัดลอกข้อความแล้ว');
    else window.prompt('คัดลอกข้อความด้านล่าง', txt);
  };
  const doPrint = function () { window.print(); };

  const node = (
    <div className="op-portal">
      <div className="op-toolbar">
        <button className="btn btn-primary" onClick={doPrint}>พิมพ์ / บันทึกเป็น PDF</button>
        <button className="btn" onClick={doCopy}>คัดลอกข้อความ</button>
        <button className="btn" onClick={onClose}>ปิด</button>
        <span className="small muted">เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ ขนาด A4</span>
      </div>
      <div className="op-sheet">
        <div className="op-head">
          <div>
            <div className="op-title">ปฏิทินเพาะปลูก · {op.crop.name}</div>
            <div className="op-sub">แปลง {op.plot.name} · อายุ {op.age} วัน · ระยะปัจจุบัน <b>{op.stageNow}</b></div>
          </div>
          <div className="op-meta">
            <div>สิ้นสุดรอบ {thaiDate(op.endDate, true)}</div>
            <div>พิมพ์เมื่อ {thaiDate(op.printedAt)}</div>
          </div>
        </div>

        {op.waterAdvice && <div className="op-banner">น้ำวันนี้: {op.waterAdvice}</div>}
        {op.photo && (
          <div className="op-banner">
            เกณฑ์ช่วงแสง: ออกดอกเมื่อกลางวันสั้นกว่า {op.photo.maxHours} ชม./วัน · วันนี้ที่พิกัดแปลง {op.photo.hours.toFixed(1)} ชม.
            {op.photo.shortFrom ? ' · กลางวันสั้นกว่าเกณฑ์ตั้งแต่ ' + thaiDate(op.photo.shortFrom) : ''}
          </div>
        )}

        <div className="op-sec">ทำอะไรวันไหน (เฉพาะงานหลัก)</div>
        <div className="op-strip">
          {op.monthRows.map(function (m) {
            return (
              <div key={m.key} className="op-mcell">
                <b>{TH_M[m.month - 1]}</b>
                {m.lines.length === 0 && <div className="op-small">-</div>}
                {m.lines.map(function (l, i) { return <div key={i} className="op-mline"><span>{l.label}</span> {l.days}</div>; })}
              </div>
            );
          })}
        </div>

        <table className="op-table">
          <colgroup><col style={{ width: '15%' }} /><col style={{ width: '14%' }} /><col style={{ width: '25%' }} /><col style={{ width: '20%' }} /><col style={{ width: '26%' }} /></colgroup>
          <thead>
            <tr><th>ระยะ / ช่วง</th><th>น้ำที่ควรให้</th><th>ปุ๋ย (หลัก · ทางเลือก)</th><th>เฝ้าระวัง</th><th>สารกำจัด / ชีวภัณฑ์</th></tr>
          </thead>
          <tbody>
            {op.stages.map(function (s) {
              return (
                <tr key={s.key} className={s.current ? 'op-now' : ''}>
                  <td>
                    <b>{s.name}</b>{s.current ? ' ◀ ตอนนี้' : ''}
                    <div className="op-small">{s.period}</div>
                    {s.signs && <div className="op-small">{s.signs}</div>}
                  </td>
                  <td>{s.hold ? <b>{s.water}</b> : s.water}</td>
                  <td>
                    {s.fert.length === 0 ? <span className="op-small">-</span> : s.fert.map(function (f, i) {
                      return (
                        <div key={i} className="op-fert">
                          <b>{f.formula}</b> {f.rate}
                          {f.altFormula && <div className="op-small">ทางเลือก: {f.altFormula} {f.altRate}</div>}
                          {f.alt3Formula && <div className="op-small">หรือ: {f.alt3Formula} {f.alt3Rate}</div>}
                        </div>
                      );
                    })}
                  </td>
                  <td>{s.pests.length ? s.pests.join(' · ') : '-'}</td>
                  <td>
                    {s.chems.map(function (c, i) { return <div key={'c' + i} className="op-chem">⚗ <b>{c.pest}</b>: {c.chem.join(' · ')}</div>; })}
                    {s.bio.length === 0 && s.chems.length === 0 ? '-' : s.bio.map(function (b, i) {
                      return <div key={i} className="op-bio"><b>{b.agent}</b> → {b.target} <span className="op-small">{b.rate !== 'ตามฉลาก' ? '(' + b.rate + ')' : ''}{b.src === 'G' ? ' *' : ''}</span></div>;
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="op-grid">
          {op.organic.length > 0 && (
            <div className="op-box">
              <b>ปุ๋ยอินทรีย์/ชีวภาพทางเลือก</b>
              {op.organic.map(function (o, i) { return <div key={i} className="op-small">• {o.name} {o.rate} — {o.note}</div>; })}
            </div>
          )}
          <div className="op-box">
            <b>งานที่ใกล้ถึง{op.overdue > 0 ? ' (เลยกำหนด ' + op.overdue + ' รายการ)' : ''}</b>
            {op.upcoming.length === 0 && <div className="op-small">ไม่มีงานใน 60 วันข้างหน้า</div>}
            {op.upcoming.map(function (x) {
              const meta = TASK_META[x.type] || { label: x.type };
              return <div key={x.key} className="op-small">• {thaiDateShort(x.date)} [{meta.label}] {x.title}</div>;
            })}
          </div>
          <div className="op-box op-phi">
            <b>งดพ่นสารก่อนเก็บเกี่ยว (PHI)</b>
            {op.harvestDate && <div className="op-small">คาดเก็บเกี่ยวประมาณ {thaiDate(op.harvestDate)}</div>}
            {op.phiList.map(function (c, i) {
              return <div key={i} className="op-small">• {c.name}: งดพ่น {c.days} วันก่อนเก็บ{c.stop ? ' (หยุดพ่นตั้งแต่ ' + thaiDateShort(c.stop) + ')' : ''}</div>;
            })}
            {op.phi.map(function (p) { return <div key={p.id} className="op-small"><b>ที่พ่นไปแล้ว:</b> {p.chem} เก็บได้ตั้งแต่ {thaiDateShort(p.safeDate)}</div>; })}
            <div className="op-small">ค่าอ้างอิง ให้ยึดฉลากผลิตภัณฑ์เป็นหลัก</div>
          </div>
          <div className="op-box">
            <b>ฝนหนัก / น้ำขัง</b>
            <div className="op-small">• เปิดร่องระบายน้ำ ไม่ให้ขังเกิน 24 ชม. งดให้น้ำและงดใส่ปุ๋ยเม็ด</div>
            <div className="op-small">• หลังน้ำลด ล้างโคลนที่ใบ/โคน พรวนดินเบาๆ เมื่อหมาด</div>
            <div className="op-small">• สำรวจรากเน่า โคนเน่า ใบเหลือง 3–7 วัน ตัดส่วนเสียออก</div>
            <div className="op-small">• ฟื้นต้นด้วยปุ๋ยน้อยๆ หลังดินหมาด 5–7 วัน</div>
          </div>
        </div>


        {op.pestRows.length > 0 && (
          <div className="op-break">
            <div className="op-sec">ศัตรูพืช โรค และการจัดการ (สารกำจัดพร้อมอัตราใช้)</div>
            <table className="op-table op-pest">
              <colgroup><col style={{ width: '17%' }} /><col style={{ width: '13%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /><col style={{ width: '26%' }} /></colgroup>
              <thead><tr><th>ศัตรูพืช</th><th>ระยะที่พบ</th><th>สภาพที่เสี่ยง / อาการ</th><th>การจัดการ</th><th>สารกำจัด (กลุ่ม · อัตรา)</th></tr></thead>
              <tbody>
                {op.pestRows.map(function (r, i) {
                  return (
                    <tr key={i}>
                      <td><b>{r.name}</b><div className="op-small">{r.kind}</div></td>
                      <td>{r.stages}</td>
                      <td>{r.cond}{r.watch ? <div className="op-small">{r.watch}</div> : null}</td>
                      <td>{r.manage || '-'}</td>
                      <td>{r.chems.length ? r.chems.map(function (c, k) { return <div key={k} className="op-chem">⚗ {c}</div>; }) : <span className="op-small">เน้นวิธีเขตกรรม/ชีวภัณฑ์</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {op.bioRef.length > 0 && (
          <div>
            <div className="op-sec">ชีวภัณฑ์ อัตราใช้ และวิธีใช้</div>
            <table className="op-table op-pest">
              <colgroup><col style={{ width: '20%' }} /><col style={{ width: '24%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} /><col style={{ width: '20%' }} /></colgroup>
              <thead><tr><th>ชีวภัณฑ์</th><th>ใช้กับ</th><th>อัตรา</th><th>ระยะ</th><th>วิธีใช้</th></tr></thead>
              <tbody>
                {op.bioRef.map(function (b, i) {
                  return (
                    <tr key={i}>
                      <td><b>{b.agent}</b></td><td>{b.target}</td><td>{b.rate}{b.src === 'G' ? ' *' : ''}</td><td>{b.stages}</td><td>{b.how || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="op-foot">
          {op.unitNote && <div>{op.unitNote}</div>}
          <div>ข้อมูลเป็นแนวทางเริ่มต้น ควรปรับตามพันธุ์ ดิน และผลวิเคราะห์จริง ตรวจฉลากสารและปรึกษาเจ้าหน้าที่เกษตรก่อนใช้ ชีวภัณฑ์ที่มี * คือแนวปฏิบัติทั่วไป ไม่ได้มาจากเอกสารแนบ ใช้ตามฉลาก</div>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
