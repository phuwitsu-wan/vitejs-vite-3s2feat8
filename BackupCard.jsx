import React, { useState, useRef } from 'react';
import {
  backupAvailable, getBackupCode, getLastBackupAt, isAutoBackup, setAutoBackup,
  cloudBackup, cloudFetch, adoptCode, formatCode, normalizeCode,
  saveBackupFile, readBackupFile
} from '../lib/backup.js';
import { copyToClipboard } from '../lib/platform.js';

function when(ms) {
  if (!ms) return 'ยังไม่เคยสำรอง';
  const d = new Date(ms);
  return d.getDate() + '/' + (d.getMonth() + 1) + '/' + (d.getFullYear() + 543) + ' เวลา ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' น.';
}

export default function BackupCard({ plots, activities, onRestore }) {
  const online = backupAvailable();
  const [code, setCode] = useState(getBackupCode());
  const [last, setLast] = useState(getLastBackupAt());
  const [auto, setAuto] = useState(isAutoBackup());
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [found, setFound] = useState(null); // { data, at, code }
  const fileRef = useRef(null);

  const hasData = plots.length > 0;
  const say = function (kind, t) { setMsg({ kind: kind, text: t }); };

  const doCloud = async function () {
    if (!hasData) { say('warn', 'ยังไม่มีแปลงให้สำรอง กรุณาเพิ่มแปลงก่อน'); return; }
    setBusy('backup'); setMsg(null);
    const r = await cloudBackup(plots, activities);
    setBusy('');
    if (r.ok) {
      setCode(r.code); setLast(getLastBackupAt()); setAutoBackup(true); setAuto(true);
      say('ok', 'สำรองข้อมูลเรียบร้อยแล้ว กรุณาจดรหัสกู้คืนไว้ (หรือกดคัดลอก) ต่อไประบบจะสำรองให้อัตโนมัติเมื่อข้อมูลเปลี่ยน');
    } else if (r.error === 'no-api') {
      say('warn', 'ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ กรุณาใช้การบันทึกเป็นไฟล์แทน');
    } else {
      say('warn', 'สำรองขึ้นระบบไม่สำเร็จ (อินเทอร์เน็ตช้าหรือเซิร์ฟเวอร์ยังไม่ตอบ) กรุณาลองใหม่อีกครั้ง หรือบันทึกเป็นไฟล์ไว้ก่อน');
    }
  };

  const copyCode = function () {
    const t = formatCode(code);
    copyToClipboard(t).then(function (ok) { say(ok ? 'ok' : 'warn', ok ? 'คัดลอกรหัส ' + t + ' แล้ว' : 'คัดลอกไม่สำเร็จ กรุณากดค้างที่รหัสเพื่อคัดลอกเอง'); });
  };

  const toggleAuto = function () {
    const v = !auto; setAuto(v); setAutoBackup(v);
  };

  const findBackup = async function () {
    setBusy('find'); setMsg(null); setFound(null);
    const r = await cloudFetch(codeInput);
    setBusy('');
    if (r.ok) { setFound({ data: r.data, at: r.at, code: r.code }); return; }
    if (r.error === 'format') say('warn', 'รหัสต้องมี 10 ตัวอักษร (ตัวอักษรภาษาอังกฤษและตัวเลข) กรุณาตรวจอีกครั้ง');
    else if (r.error === 'notfound') say('warn', 'ไม่พบข้อมูลสำรองของรหัสนี้ กรุณาตรวจรหัสอีกครั้ง');
    else if (r.error === 'corrupt') say('warn', 'ข้อมูลสำรองเสียหาย ไม่สามารถกู้คืนได้');
    else say('warn', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
  };

  const confirmRestore = function () {
    if (!found) return;
    onRestore(found.data);
    if (found.code) { adoptCode(found.code); setCode(found.code); setLast(getLastBackupAt()); }
    setFound(null); setCodeInput('');
    say('ok', 'กู้คืนข้อมูลเรียบร้อยแล้ว');
  };

  const doFile = async function () {
    if (!hasData) { say('warn', 'ยังไม่มีแปลงให้สำรอง'); return; }
    const r = await saveBackupFile(plots, activities);
    if (r.ok) { setLast(getLastBackupAt()); say('ok', r.how === 'share' ? 'เลือกที่เก็บไฟล์สำรองเรียบร้อย (เช่น LINE Keep หรือ Google Drive)' : 'ดาวน์โหลดไฟล์สำรองแล้ว เก็บไว้ในโฟลเดอร์ดาวน์โหลดของเครื่อง'); }
    else if (r.error !== 'cancel') say('warn', 'บันทึกไฟล์ไม่สำเร็จ ลองใช้รหัสกู้คืนแทน');
  };

  const pickFile = async function (e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMsg(null);
    const r = await readBackupFile(f);
    if (r.ok) setFound({ data: r.data, at: 0, code: '' });
    else say('warn', 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป หรือไฟล์เสียหาย');
  };

  return (
    <section className="card backup-card">
      <div className="card-title">สำรองและกู้คืนข้อมูล</div>
      <p className="small muted">
        ข้อมูลแปลงเก็บอยู่ในเครื่องนี้ ถ้าเปลี่ยนมือถือ ลบแอป หรือล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหาย
        แนะนำให้สำรองไว้ด้วย "รหัสกู้คืน" แล้วจดรหัสไว้
      </p>

      {msg && <div className={'bk-msg bk-' + msg.kind}>{msg.text}</div>}

      {found && (
        <div className="bk-found">
          <b>พบข้อมูลสำรอง</b>
          <div className="small">
            {found.data.plots.length} แปลง · {found.data.activities.length} บันทึกกิจกรรม{found.at ? ' · สำรองเมื่อ ' + when(found.at) : ''}
          </div>
          <div className="small muted">ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่ด้วยข้อมูลสำรองนี้</div>
          <div className="row gap mt">
            <button className="btn btn-primary flex1" onClick={confirmRestore}>ยืนยันกู้คืน</button>
            <button className="btn flex1" onClick={function () { setFound(null); }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {online && (
        <div className="bk-block">
          <div className="bk-h">1. สำรองด้วยรหัสกู้คืน (แนะนำ)</div>
          {code ? (
            <>
              <div className="bk-code">{formatCode(code)}</div>
              <div className="small muted">สำรองล่าสุด: {when(last)}</div>
              <div className="row gap mt">
                <button className="btn flex1" onClick={copyCode}>คัดลอกรหัส</button>
                <button className="btn btn-primary flex1" disabled={busy === 'backup'} onClick={doCloud}>
                  {busy === 'backup' ? 'กำลังสำรอง...' : 'สำรองตอนนี้'}
                </button>
              </div>
              <label className="bk-auto">
                <input type="checkbox" checked={auto} onChange={toggleAuto} />
                สำรองอัตโนมัติเมื่อข้อมูลเปลี่ยน
              </label>
            </>
          ) : (
            <>
              <div className="small muted">กดปุ่มเดียว ระบบจะสร้างรหัส 10 ตัวให้ จดไว้ใช้กู้คืนในเครื่องใหม่</div>
              <button className="btn btn-primary w-full mt" disabled={busy === 'backup'} onClick={doCloud}>
                {busy === 'backup' ? 'กำลังสำรอง...' : 'สำรองข้อมูลขึ้นระบบ'}
              </button>
            </>
          )}
          <div className="small muted mt">รหัสนี้เป็นกุญแจเปิดข้อมูลของคุณ ไม่ควรบอกคนอื่น ข้อมูลที่สำรองมีตำแหน่งแปลงและบันทึกกิจกรรม</div>
        </div>
      )}

      <div className="bk-block">
        <div className="bk-h">{online ? '2. ' : '1. '}บันทึกเป็นไฟล์</div>
        <div className="small muted">เก็บไฟล์ไว้ใน LINE Keep, Google Drive หรือในเครื่อง</div>
        <button className="btn w-full mt" onClick={doFile}>บันทึกไฟล์สำรอง</button>
      </div>

      <div className="bk-block">
        <div className="bk-h">กู้คืนข้อมูล</div>
        {online && (
          <>
            <div className="small muted">ใส่รหัสกู้คืนที่เคยจดไว้</div>
            <div className="row gap mt">
              <input className="flex1 bk-input" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
                placeholder="เช่น AB12C-DE34F" value={codeInput}
                onChange={function (e) { setCodeInput(e.target.value.toUpperCase()); }} />
              <button className="btn btn-primary" disabled={busy === 'find' || normalizeCode(codeInput).length < 10} onClick={findBackup}>
                {busy === 'find' ? 'กำลังค้นหา...' : 'ค้นหา'}
              </button>
            </div>
          </>
        )}
        <div className="small muted mt">หรือเลือกไฟล์สำรองที่บันทึกไว้</div>
        <input ref={fileRef} type="file" accept=".json,application/json,text/plain" style={{ display: 'none' }} onChange={pickFile} />
        <button className="btn w-full mt" onClick={function () { fileRef.current.click(); }}>เลือกไฟล์สำรอง</button>
      </div>

    </section>
  );
}
