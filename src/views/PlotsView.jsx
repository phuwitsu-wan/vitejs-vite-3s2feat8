import React, { useState } from 'react';
import { CROP_LIST, CROPS, WATER_MODES } from '../data/crops.js';
import { today, thaiDate } from '../lib/date.js';
import LocationPicker from './LocationPicker.jsx';
import { storageInfo } from '../lib/storage.js';
import BackupCard from './BackupCard.jsx';
import { utmToLatLon } from '../lib/utm.js';
import About from './About.jsx';
import CropIcon from './CropIcon.jsx';
import { isOrchard, cycleStartFor, monthName } from '../lib/orchard.js';

const EMPTY = { name: '', crop: 'rice', plantedAt: today(), areaRai: '', lat: null, lon: null, locationName: '', waterMode: 'irrigated' };
const UTM_EMPTY = { zone: '47', band: 'P', easting: '', northing: '' };

export default function PlotsView({ plots, activePlotId, onAdd, onRemove, onSelect, onRestore, activities, firstRun }) {
  const [form, setForm] = useState(EMPTY);
  const [geoMsg, setGeoMsg] = useState('');
  const [showForm, setShowForm] = useState(firstRun);
  const [coordMode, setCoordMode] = useState('latlon'); // latlon | utm
  const [utm, setUtm] = useState(UTM_EMPTY);
  const [utmMsg, setUtmMsg] = useState('');

  const crop = CROPS[form.crop];
  const info = storageInfo();

  const applyUtm = function (next) {
    const u = Object.assign({}, utm, next);
    setUtm(u);
    const zone = Number(u.zone);
    const e = Number(u.easting);
    const n = Number(u.northing);
    if (!u.band || !zone || !u.easting || !u.northing || isNaN(e) || isNaN(n)) {
      setUtmMsg('');
      return;
    }
    const r = utmToLatLon(zone, u.band, e, n);
    if (!r) {
      setUtmMsg('พิกัดไม่ถูกต้อง กรุณาตรวจสอบโซน แถบอักษร หรือตัวเลขอีกครั้ง');
      return;
    }
    setForm(function (f) { return Object.assign({}, f, { lat: r.lat, lon: r.lon }); });
    setUtmMsg('แปลงเป็น ละติจูด ' + r.lat + ', ลองจิจูด ' + r.lon + ' แล้ว');
  };

  const submit = function (e) {
    e.preventDefault();
    if (form.lat === null || form.lon === null) { window.alert('กรุณาระบุตำแหน่งแปลงก่อน'); return; }
    const payload = Object.assign({}, form, { areaRai: form.areaRai ? Number(form.areaRai) : null });
    if (isOrchard(crop)) {
      payload.shift = crop.stageMode === 'month' ? (form.shift || 0) : 0;
      payload.plantedAt = cycleStartFor(crop, form.shift || 0, today());
    } else { delete payload.shift; }
    onAdd(payload);
    setForm(EMPTY); setShowForm(false); setGeoMsg('');
  };

  return (
    <>
      {firstRun && (
        <section className="card welcome">
          <div className="welcome-icon">{'\u{1F331}'}</div>
          <h2>ปฏิทินเพาะปลูกเท่าทันภูมิอากาศ</h2>
          <p className="small">
            เพิ่มแปลงของคุณเพื่อให้ระบบสร้างปฏิทินการผลิตเฉพาะแปลงจากพิกัดจริง
            พร้อมข้อมูลดิน การจัดการน้ำ และแจ้งเตือนความเสี่ยงโรคและแมลง
          </p>
        </section>
      )}

      {!firstRun && (
        <section className="card">
          <div className="card-title">แปลงของฉัน ({plots.length})</div>
          {plots.map(function (p) {
            return (
              <div key={p.id} className={'plot-row ' + (p.id === activePlotId ? 'plot-active' : '')}>
                <button className="flex1 plot-pick" onClick={function () { onSelect(p.id); }}>
                  <div className="task-title">{CROPS[p.crop] ? <CropIcon crop={CROPS[p.crop]} /> : ''} {p.name}</div>
                  <div className="small muted">
                    {CROPS[p.crop] ? CROPS[p.crop].name : p.crop} · {CROPS[p.crop] && CROPS[p.crop].orchard ? 'รอบเริ่ม ' : 'เริ่ม '}{thaiDate(p.plantedAt)} · {p.areaRai || '-'} ไร่
                  </div>
                  <div className="small muted">{p.locationName || p.lat.toFixed(4) + ', ' + p.lon.toFixed(4)}</div>
                </button>
                <button className="icon-btn danger" onClick={function () {
                  if (window.confirm('ลบแปลง ' + p.name + ' และบันทึกทั้งหมด')) onRemove(p.id);
                }}>ลบ</button>
              </div>
            );
          })}
          <button className="btn w-full mt" onClick={function () { setShowForm(!showForm); }}>
            {showForm ? 'ยกเลิก' : 'เพิ่มแปลงใหม่'}
          </button>
        </section>
      )}

      {showForm && (
        <section className="card">
          <div className="card-title">{firstRun ? 'เพิ่มแปลงแรกของคุณ' : 'เพิ่มแปลงใหม่'}</div>
          <form onSubmit={submit}>
            <label className="field">
              <span>ชื่อแปลง</span>
              <input value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }}
                placeholder="เช่น นาหลังบ้าน แปลง 1" required />
            </label>

            <div className="field">
              <span>ชนิดพืช ({CROP_LIST.length} ชนิด)</span>
              <div className="crop-grid">
                {CROP_LIST.map(function (c) {
                  return (
                    <button type="button" key={c.id}
                      className={'crop-btn ' + (form.crop === c.id ? 'crop-active' : '')}
                      onClick={function () { setForm(Object.assign({}, form, { crop: c.id, shift: 0 })); }}>
                      <span className="crop-icon"><CropIcon crop={c} /></span>{c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {crop.waterModes && (
              <div className="field">
                <span>ระบบน้ำของแปลง</span>
                {WATER_MODES.map(function (m) {
                  return (
                    <button type="button" key={m.key}
                      className={'mode-btn ' + (form.waterMode === m.key ? 'mode-active' : '')}
                      onClick={function () { setForm(Object.assign({}, form, { waterMode: m.key })); }}>
                      <b className="small">{m.label}</b>
                      <div className="small muted">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {isOrchard(crop) ? (
              <div className="field">
                <span>ไม้ผลมีรอบการผลิตวนซ้ำทุกปี เลือกเดือนที่เก็บเกี่ยวผลผลิตหลัก (แนะนำ) ระบบจะจัดปฏิทินให้ทั้งรอบ</span>
                <div className="grid2">
                  <label>
                    <span className="small muted">เดือนเก็บเกี่ยวหลัก</span>
                    <select value={((crop.orchard.harvestMonth - 1 + (form.shift || 0)) % 12 + 12) % 12 + 1}
                      onChange={function (e) { setForm(Object.assign({}, form, { shift: ((Number(e.target.value) - crop.orchard.harvestMonth) % 12 + 12) % 12 })); }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return <option key={m} value={m}>{monthName(m)}</option>; })}
                    </select>
                  </label>
                  <label>
                    <span className="small muted">เดือนตัดแต่งกิ่ง (เริ่มรอบ)</span>
                    <select value={((crop.orchard.pruneMonth - 1 + (form.shift || 0)) % 12 + 12) % 12 + 1}
                      onChange={function (e) { setForm(Object.assign({}, form, { shift: ((Number(e.target.value) - crop.orchard.pruneMonth) % 12 + 12) % 12 })); }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return <option key={m} value={m}>{monthName(m)}</option>; })}
                    </select>
                  </label>
                </div>
                <div className="small muted">
                  ค่าเริ่มต้นของ{crop.name}: เก็บเกี่ยว {monthName(crop.orchard.harvestMonth)} · ตัดแต่งกิ่ง {monthName(crop.orchard.pruneMonth)}
                  {' '}· เลือกอย่างใดอย่างหนึ่ง อีกช่องจะปรับตามอัตโนมัติ
                </div>
              </div>
            ) : (
              <label className="field">
                <span>{crop.anchorLabel || 'วันที่ปลูก หว่าน หรือย้ายกล้า'}</span>
                <input type="date" value={form.plantedAt} max={today()}
                  onChange={function (e) { setForm(Object.assign({}, form, { plantedAt: e.target.value })); }} required />
              </label>
            )}

            <label className="field">
              <span>พื้นที่ (ไร่)</span>
              <input type="number" step="0.1" value={form.areaRai}
                onChange={function (e) { setForm(Object.assign({}, form, { areaRai: e.target.value })); }} placeholder="เช่น 5" />
            </label>

            <div className="field">
              <span>ตำแหน่งแปลง ใช้ดึงข้อมูลอากาศและข้อมูลดินเฉพาะจุด</span>
              <LocationPicker lat={form.lat} lon={form.lon}
                onPick={function (la, lo, name) { setForm(function (f) { return Object.assign({}, f, { lat: la, lon: lo, locationName: name || f.locationName || '' }); }); }} />

              <div className="seg mt">
                <button type="button" className={'seg-btn ' + (coordMode === 'latlon' ? 'seg-active' : '')}
                  onClick={function () { setCoordMode('latlon'); }}>ละติจูด/ลองจิจูด</button>
                <button type="button" className={'seg-btn ' + (coordMode === 'utm' ? 'seg-active' : '')}
                  onClick={function () { setCoordMode('utm'); }}>พิกัด UTM (47P)</button>
              </div>

              {coordMode === 'latlon' ? (
                <div className="row gap mt">
                  <input className="flex1" type="number" step="0.0001" placeholder="ละติจูด" value={form.lat === null ? '' : form.lat}
                    onChange={function (e) { setForm(Object.assign({}, form, { lat: e.target.value === '' ? null : Number(e.target.value) })); }} />
                  <input className="flex1" type="number" step="0.0001" placeholder="ลองจิจูด" value={form.lon === null ? '' : form.lon}
                    onChange={function (e) { setForm(Object.assign({}, form, { lon: e.target.value === '' ? null : Number(e.target.value) })); }} />
                </div>
              ) : (
                <div className="mt">
                  <div className="small muted">
                    กรอกพิกัด UTM จากเครื่อง GPS หรือแผนที่ (ไทยส่วนใหญ่อยู่โซน 47 แถบอักษร P บางพื้นที่ภาคใต้อาจเป็นโซน 47N/48N แถบ N)
                  </div>
                  <div className="row gap mt">
                    <input className="flex1" type="number" placeholder="โซน เช่น 47" value={utm.zone}
                      onChange={function (e) { applyUtm({ zone: e.target.value }); }} />
                    <input className="flex1" type="text" maxLength={1} placeholder="แถบอักษร เช่น P" value={utm.band}
                      onChange={function (e) { applyUtm({ band: e.target.value.toUpperCase() }); }} />
                  </div>
                  <div className="row gap mt">
                    <input className="flex1" type="number" placeholder="X (Easting)" value={utm.easting}
                      onChange={function (e) { applyUtm({ easting: e.target.value }); }} />
                    <input className="flex1" type="number" placeholder="Y (Northing)" value={utm.northing}
                      onChange={function (e) { applyUtm({ northing: e.target.value }); }} />
                  </div>
                  {utmMsg ? <div className="small geo-msg mt">{utmMsg}</div> : null}
                  {form.lat !== null && form.lon !== null ? (
                    <div className="small muted mt">พิกัดที่จะใช้บันทึก: {form.lat}, {form.lon}</div>
                  ) : null}
                </div>
              )}
            </div>

            <button className="btn btn-primary w-full" type="submit">สร้างปฏิทินเพาะปลูก</button>
          </form>
        </section>
      )}

      <BackupCard plots={plots} activities={activities} onRestore={onRestore} />

      <About />
    </>
  );
}