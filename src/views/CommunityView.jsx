import React, { useEffect, useState } from 'react';
import { fetchNearby, summarizeNearby, reportOutbreak, resolveReport, myActiveReports, communityMode, checkServer, serverTestUrl, getNearbyStatus, pendingReportCount, syncPendingReports } from '../lib/community.js';
import OutbreakMap from './OutbreakMap.jsx';
import { SCOUT_TARGETS } from '../data/scoutTargets.js';
import { today, thaiDate } from '../lib/date.js';
import { CROPS } from '../data/crops.js';

// รายงานหมดอายุเมื่อพืชของผู้รายงานพ้นระยะที่พบ (วันเริ่มระยะถัดไป) แต่ไม่ต่ำกว่า 3 วัน ไม่เกิน 30 วัน
function untilFromStage(derived) {
  const DAY = 86400000;
  const now = Date.now();
  let end = null;
  try {
    const si = derived && derived.stageInfo;
    const d = si && (si.nextDate || si.endDate);
    if (d) end = new Date(d + 'T23:59:59').getTime();
  } catch (e) { end = null; }
  if (!end || isNaN(end)) end = now + 14 * DAY;
  return Math.min(Math.max(end, now + 3 * DAY), now + 30 * DAY);
}

export default function CommunityView({ plot, derived, onReported }) {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(myActiveReports());
  const [server, setServer] = useState(null);   // ผลทดสอบการเชื่อมต่อ
  const [checking, setChecking] = useState(false);
  const [nb, setNb] = useState(getNearbyStatus());
  const [pend, setPend] = useState(pendingReportCount());
  const [radius, setRadius] = useState(5);
  const [form, setForm] = useState({ pest: '', kind: 'insect', severity: 'found', count: '', note: '', date: today() });

  const load = async function (r) {
    if (!plot) return;
    setBusy(true);
    const data = await fetchNearby(plot, r || radius, 14);
    // ข้อ 6: แจ้งเตือนเฉพาะรายงานของพืชชนิดเดียวกับแปลงนี้เท่านั้น
    const sameCropData = data.filter(function (x) { return x.crop === plot.crop; });
    setRows(sameCropData);
    setGroups(summarizeNearby(sameCropData));
    setNb(Object.assign({}, getNearbyStatus(), { inCrop: sameCropData.length }));
    setPend(pendingReportCount());
    setBusy(false);
  };

  const runCheck = async function () {
    setChecking(true);
    setServer(await checkServer());
    setChecking(false);
  };

  const retryPending = async function () {
    setChecking(true);
    await syncPendingReports();
    setPend(pendingReportCount());
    await load(radius);
    setChecking(false);
  };

  useEffect(function () { load(radius); }, [plot ? plot.id : null, radius]);
  useEffect(function () { runCheck(); }, []);
  // รีเฟรชอัตโนมัติทุก 45 วินาทีและเมื่อกลับมาเปิดหน้าแอป เพื่อเห็นรายงานใหม่จากเครื่องอื่น
  useEffect(function () {
    const t = setInterval(function () { load(radius); }, 45000);
    const onVis = function () { if (document.visibilityState === 'visible') load(radius); };
    document.addEventListener('visibilitychange', onVis);
    return function () { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [plot ? plot.id : null, radius]);

  if (!plot) return <div className="card">ยังไม่ได้เลือกแปลง</div>;

  const options = (SCOUT_TARGETS[plot.crop] || []).map(function (t) { return t; });
  const mode = communityMode();

  const submit = async function (e) {
    e.preventDefault();
    if (!form.pest) { window.alert('กรุณาเลือกหรือพิมพ์ชื่อศัตรูพืช'); return; }
    setBusy(true);
    const res = await reportOutbreak(plot, {
      pest: form.pest, kind: form.kind, severity: form.severity,
      count: form.count ? Number(form.count) : null, note: form.note, date: form.date,
      until: untilFromStage(derived)
    });
    setMine(myActiveReports());
    setBusy(false);
    setForm(Object.assign({}, form, { count: '', note: '' }));
    window.alert(res.mode === 'online'
      ? 'ส่งรายงานแล้ว ขอบคุณครับ ข้อมูลนี้จะช่วยเตือนเพื่อนเกษตรกรรอบ ๆ โดยไม่เปิดเผยตัวตนและไม่ระบุแปลง'
      : res.mode === 'pending'
        ? 'บันทึกรายงานไว้แล้ว แต่ยังยืนยันไม่ได้ว่าถึงเซิร์ฟเวอร์ส่วนกลาง ระบบจะลองส่งซ้ำอัตโนมัติเมื่อเปิดแอปครั้งถัดไป'
        : 'บันทึกไว้ในเครื่องแล้ว (ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ส่วนกลาง จึงยังไม่แชร์ให้แปลงอื่น)');
    if (onReported) onReported();
    load(radius);
  };

  const doResolve = async function (rid) {
    if (!window.confirm('ยืนยันว่ากำจัดศัตรูพืชนี้แล้ว? รายงานจะถูกเอาออกจากแผนที่และการแจ้งเตือนของเพื่อนบ้าน')) return;
    await resolveReport(rid);
    setMine(myActiveReports());
    load(radius);
  };

  return (
    <>
      <section className="card">
        <div className="card-title">
          สถานการณ์ศัตรูพืชรอบแปลง
          <span className="badge badge-grey">{mode === 'online' ? 'เชื่อมต่อส่วนกลาง' : 'โหมดเฉพาะเครื่อง'}</span>
        </div>
        <div className="filter-row">
          {[3, 5, 10, 20].map(function (r) {
            return (
              <button key={r} className={'chip ' + (radius === r ? 'chip-active' : '')} onClick={function () { setRadius(r); }}>
                รัศมี {r} กม.
              </button>
            );
          })}
        </div>
        {mode === 'online' && (
          <div className={'srv-box srv-' + (server ? (server.state === 'ok' ? 'ok' : 'bad') : 'wait')}>
            <div className="small">
              {checking && !server ? 'กำลังตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์...' : (server ? (server.state === 'ok' ? '\u2705 ' : '\u26A0\uFE0F ') + server.text : '')}
            </div>
            {nb.ok && (
              <div className="small muted">
                รายงานในระบบรอบแปลง {nb.serverCount} รายการ (พืชชนิดเดียวกับแปลงนี้ {nb.inCrop === undefined ? '-' : nb.inCrop} รายการ) · อัปเดตล่าสุด {new Date(nb.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </div>
            )}
            {!nb.ok && nb.error && nb.error !== 'no-api' && (
              <div className="small">ดึงรายงานจากเซิร์ฟเวอร์ไม่สำเร็จ ({nb.error === 'timeout' ? 'เซิร์ฟเวอร์ไม่ตอบ' : nb.error}) จึงแสดงเฉพาะรายงานในเครื่องนี้</div>
            )}
            {pend > 0 && (
              <div className="small srv-warn">
                มีรายงานของคุณ {pend} รายการที่ยังไม่ถึงเซิร์ฟเวอร์ เพื่อนบ้านจึงยังมองไม่เห็น
                <button className="btn btn-sm" disabled={checking} onClick={retryPending} style={{ marginLeft: 8 }}>ส่งอีกครั้ง</button>
              </div>
            )}
            {server && server.state !== 'ok' && (
              <div className="small muted">
                สำหรับผู้ดูแลระบบ: เปิด <a href={serverTestUrl()} target="_blank" rel="noreferrer">ลิงก์ทดสอบเซิร์ฟเวอร์</a> ถ้าเห็นข้อความที่ขึ้นต้นด้วย {'{"ok":true'} แปลว่าสคริปต์ทำงานปกติ
              </div>
            )}
            <button className="bk-link" disabled={checking} onClick={function () { runCheck(); load(radius); }}>
              {checking ? 'กำลังตรวจสอบ...' : 'ทดสอบการเชื่อมต่อ / รีเฟรช'}
            </button>
          </div>
        )}
        {busy && <p className="muted small">กำลังโหลดข้อมูล...</p>}
        {!busy && groups.length === 0 && <p className="ok-msg">ยังไม่มีรายงานการระบาดในรัศมี {radius} กม. ภายใน 14 วันที่ผ่านมา</p>}
        {groups.map(function (g, i) {
          return (
            <div key={i} className={'risk-row ' + (g.nearestKm <= 5 && g.sameCrop ? 'risk-high' : g.nearestKm <= 10 ? 'risk-alert' : 'risk-watch')}>
              <div className="flex1">
                <div className="task-title">{g.pest}</div>
                <div className="small">{g.text}</div>
                <div className="small muted">พืชที่รายงาน {CROPS[g.crop] ? CROPS[g.crop].name : g.crop}</div>
              </div>
            </div>
          );
        })}
        <div className="mt">
          <OutbreakMap plot={plot} rows={rows} radiusKm={radius} />
        </div>
        <p className="small muted mt">
          รายงานจะหายไปจากแผนที่เมื่อผู้รายงานกด "กำจัดแล้ว" หรือเมื่อพืชของผู้รายงานพ้นระยะการเติบโตที่พบศัตรูพืชนั้น
        </p>
        <p className="small muted mt">
          รายงานทั้งหมดไม่ระบุตัวตนและไม่เก็บพิกัดจริง ระบบปัดตำแหน่งลงตารางกริดประมาณ 1 กิโลเมตรก่อนส่ง
        </p>
      </section>

      {mine.length > 0 && (
        <section className="card">
          <div className="card-title">รายงานของฉันที่ยังแสดงอยู่</div>
          {mine.map(function (r) {
            return (
              <div key={r.rid} className="my-report">
                <div className="flex1">
                  <div className="task-title">{r.pest}</div>
                  <div className="small muted">
                    {CROPS[r.crop] ? CROPS[r.crop].name : r.crop} · พบเมื่อ {thaiDate(r.date)} · แสดงถึง {thaiDate(new Date(r.until).toISOString().slice(0, 10))}
                  </div>
                </div>
                <button type="button" className="btn btn-sm" onClick={function () { doResolve(r.rid); }}>กำจัดแล้ว</button>
              </div>
            );
          })}
        </section>
      )}

      <section className="card">
        <div className="card-title">แจ้งสิ่งที่พบในแปลงของคุณ</div>
        <form onSubmit={submit}>
          <div className="field">
            <span>ศัตรูพืชที่พบ</span>
            <div className="crop-grid">
              {options.map(function (o) {
                return (
                  <button type="button" key={o.key}
                    className={'crop-btn ' + (form.pest === o.name ? 'crop-active' : '')}
                    onClick={function () { setForm(Object.assign({}, form, { pest: o.name, kind: o.type })); }}>
                    <span className="crop-icon">{o.type === 'disease' ? '\u{1F9A0}' : '\u{1F41B}'}</span>{o.name}
                  </button>
                );
              })}
            </div>
            <input className="mt" type="text" placeholder="หรือพิมพ์ชื่อเอง"
              value={form.pest} onChange={function (e) { setForm(Object.assign({}, form, { pest: e.target.value })); }} />
          </div>

          <label className="field">
            <span>วันที่พบ</span>
            <input type="date" max={today()} value={form.date}
              onChange={function (e) { setForm(Object.assign({}, form, { date: e.target.value })); }} />
          </label>

          <div className="row gap">
            <label className="field flex1">
              <span>ระดับความรุนแรง</span>
              <select value={form.severity} onChange={function (e) { setForm(Object.assign({}, form, { severity: e.target.value })); }}>
                <option value="found">พบประปราย ยังไม่ถึงเกณฑ์</option>
                <option value="threshold">ถึงเกณฑ์ต้องจัดการ</option>
                <option value="outbreak">ระบาดรุนแรง</option>
              </select>
            </label>
            <label className="field flex1">
              <span>จำนวนที่นับได้</span>
              <input type="number" step="0.1" placeholder="ตัวต่อต้น หรือ %"
                value={form.count} onChange={function (e) { setForm(Object.assign({}, form, { count: e.target.value })); }} />
            </label>
          </div>

          <label className="field">
            <span>หมายเหตุ</span>
            <textarea rows="2" maxLength="140" value={form.note}
              onChange={function (e) { setForm(Object.assign({}, form, { note: e.target.value })); }} />
          </label>

          <button className="btn btn-primary w-full" type="submit" disabled={busy}>ส่งรายงานแบบไม่ระบุตัวตน</button>
        </form>
      </section>
    </>
  );
}