import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initLiff, liffState, closeApp } from './lib/liff.js';
import * as store from './lib/storage.js';
import { fetchWeatherSeries } from './lib/weather.js';
import { fetchSoil, soilAdvice } from './lib/soil.js';
import { CROPS } from './data/crops.js';
import { buildGddCurve, currentStage, generateTasks, stageTimeline, seasonEnd, stageSegments, phiLocks } from './lib/agronomy.js';
import { buildWaterSeries } from './lib/water.js';
import { evaluateAlerts } from './lib/alerts.js';
import { pushAlerts, pushNearby } from './lib/notify.js';
import { backupAvailable, isAutoBackup, cloudBackup, markChanged, needsBackupReminder } from './lib/backup.js';
import { fetchNearby, summarizeNearby, syncUser, syncPendingReports } from './lib/community.js';
import { reverseProvince } from './lib/weather.js';
import { addDays } from './lib/date.js';

import Home from './views/Home.jsx';
import CalendarView from './views/CalendarView.jsx';
import LogView from './views/LogView.jsx';
import PlotsView from './views/PlotsView.jsx';
import ReportView from './views/ReportView.jsx';
import ChatView from './views/ChatView.jsx';
import CommunityView from './views/CommunityView.jsx';
import CropIcon from './views/CropIcon.jsx';

const TABS = [
  { key: 'home', label: 'หน้าหลัก', emoji: '\u{1F3E0}' },
  { key: 'calendar', label: 'ปฏิทิน', emoji: '\u{1F4C5}' },
  { key: 'report', label: 'รายงาน', emoji: '\u{1F4CA}' },
  { key: 'log', label: 'บันทึก', emoji: '\u{1F4DD}' },
  { key: 'chat', label: 'ผู้ช่วย AI', emoji: '\u{1F916}' },
  { key: 'area', label: 'พื้นที่', emoji: '\u{1F4E1}' },
  { key: 'plots', label: 'แปลง', emoji: '\u{1F5FA}' }
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('home');

  const [plots, setPlots] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activePlotId, setActivePlotId] = useState(null);

  const [weather, setWeather] = useState(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [wxError, setWxError] = useState(null);

  const [soilCache, setSoilCache] = useState({});
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState(null);
  const [nearby, setNearby] = useState([]);

  useEffect(function () {
    (async function () {
      const s = await initLiff();
      if (!s.ready) return;
      store.setUser(s.profile ? s.profile.userId : null);
      setProfile(s.profile);
      setPlots(store.load('plots', []));
      setActivities(store.load('activities', []));
      setActivePlotId(store.load('activePlot', null));
      setSoilCache(store.load('soilCache', {}));
      setBooting(false);
    })();
  }, []);

  useEffect(function () { if (!booting) store.save('plots', plots); }, [plots, booting]);
  useEffect(function () { if (!booting) store.save('activities', activities); }, [activities, booting]);
  useEffect(function () { if (!booting) store.save('activePlot', activePlotId); }, [activePlotId, booting]);
  useEffect(function () { if (!booting) store.save('soilCache', soilCache); }, [soilCache, booting]);

  const activePlot = useMemo(function () {
    const hit = plots.filter(function (p) { return p.id === activePlotId; })[0];
    return hit || plots[0] || null;
  }, [plots, activePlotId]);

  const refreshWeather = useCallback(async function (plot) {
    if (!plot || plot.lat === null || plot.lat === undefined) return;
    setWxLoading(true); setWxError(null);
    try { setWeather(await fetchWeatherSeries(plot.lat, plot.lon, plot.plantedAt)); }
    catch (e) { setWxError('ดึงข้อมูลสภาพอากาศไม่สำเร็จ'); }
    finally { setWxLoading(false); }
  }, []);

  useEffect(function () { if (activePlot) refreshWeather(activePlot); },
    [activePlot ? activePlot.id : null, activePlot ? activePlot.plantedAt : null, refreshWeather]);

  // ดึงรายงานระบาดข้างเคียงจากเซิร์ฟเวอร์ส่วนกลาง: ตอนเปิดแอป ทุก 2 นาที และทุกครั้งที่กลับมาเปิดหน้าแอปอีกครั้ง
  // ถ้ามีรายงานใหม่ของพืชชนิดเดียวกันจากเครื่องอื่น จะแจ้งเตือน (ถ้าผู้ใช้เปิดการแจ้งเตือนไว้)
  const seenRef = useRef({});
  useEffect(function () {
    if (!activePlot) return;
    const plot = activePlot;
    let dead = false;
    const run = async function () {
      let rows = [];
      try { rows = await fetchNearby(plot, 5, 14); } catch (e) { rows = []; }
      if (dead) return;
      const same = rows.filter(function (x) { return x.crop === plot.crop; });
      setNearby(summarizeNearby(same));
      const seen = seenRef.current[plot.id];
      const ids = same.filter(function (x) { return !x.mine && x.rid; });
      if (seen) {
        const fresh = ids.filter(function (x) { return !seen[x.rid]; });
        if (fresh.length) pushNearby(plot, CROPS[plot.crop] ? CROPS[plot.crop].name : plot.crop, fresh);
      }
      const map = {};
      ids.forEach(function (x) { map[x.rid] = true; });
      seenRef.current[plot.id] = map;
    };
    run();
    const timer = setInterval(run, 120000);
    const onVis = function () { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', run);
    return function () {
      dead = true; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', run);
    };
  }, [activePlot ? activePlot.id : null, activePlot ? activePlot.crop : null]);

  // สำรองอัตโนมัติ (ถ้าผู้ใช้เปิดไว้ในหน้า "แปลง") และจดว่าข้อมูลเปลี่ยนเพื่อเตือนให้สำรอง
  const firstDataRef = useRef(true);
  const [bkDismissed, setBkDismissed] = useState(false);
  const [plotMenu, setPlotMenu] = useState(false);
  const switchRef = useRef(null);
  // เลื่อนแถบแปลงให้เห็นแปลงที่เลือกอยู่เสมอ
  useEffect(function () {
    const box = switchRef.current;
    if (!box) return;
    const el = box.querySelector('[data-on="1"]');
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* ignore */ } }
  }, [activePlotId, plots.length]);
  useEffect(function () {
    if (booting) return;
    if (firstDataRef.current) { firstDataRef.current = false; return; }
    markChanged();
    if (!isAutoBackup() || !backupAvailable() || !plots.length) return;
    const t = setTimeout(function () { cloudBackup(plots, activities); }, 8000);
    return function () { clearTimeout(t); };
  }, [plots, activities, booting]);

  // ส่งข้อมูลผู้ใช้งานไปชีต "users" อัตโนมัติ (วัน-เวลา จังหวัด รหัสเครื่องแบบไม่ระบุตัวตน พืชที่ปลูก)
  // ทำงานตอนเปิดแอป และทุกครั้งที่รายการแปลง/ชนิดพืชเปลี่ยน เครื่องเดียวหลายแปลงนับเป็น 1 คน
  const plotsSig = plots.map(function (p) { return p.id + ':' + p.crop + ':' + (p.lat === null || p.lat === undefined ? '' : (+p.lat).toFixed(2)); }).join('|');
  useEffect(function () {
    if (booting) return;
    const t = setTimeout(function () { syncUser(plots); syncPendingReports(); }, 1500);
    return function () { clearTimeout(t); };
  }, [booting, plotsSig]);

  const soilKey = activePlot ? activePlot.lat.toFixed(3) + ',' + activePlot.lon.toFixed(3) : '';
  const activeSoil = soilCache[soilKey] || null;

  const loadSoilForPlot = async function () {
    if (!activePlot) return;
    setSoilLoading(true); setSoilError(null);
    try {
      const s = await fetchSoil(activePlot.lat, activePlot.lon);
      setSoilCache(function (prev) { return Object.assign({}, prev, { [soilKey]: s }); });
    } catch (e) { setSoilError('ดึงข้อมูลดินจากพิกัดไม่สำเร็จ'); }
    finally { setSoilLoading(false); }
  };

  const derived = useMemo(function () {
    if (!activePlot || !weather || !weather.series || !weather.series.length) return null;
    const crop = CROPS[activePlot.crop];
    if (!crop) return null;

    const curve = buildGddCurve(weather.series, activePlot);
    const stageInfo = currentStage(crop, activePlot, curve);
    const water = buildWaterSeries(weather.series, crop, activePlot, curve, 14, 16, activeSoil, activities);
    const tasks = generateTasks(activePlot, weather.series, activities, { curve: curve, waterPlan: water, soil: activeSoil });
    const alerts = evaluateAlerts(activePlot, weather.series, stageInfo, activities);
    const timeline = stageTimeline(crop, activePlot, curve);
    const segments = stageSegments(crop, activePlot, curve);
    const endDate = seasonEnd(crop, activePlot, curve);
    const locks = phiLocks(activities, activePlot.id, addDays);

    if (alerts.length) pushAlerts(activePlot, alerts, crop.name);

    return {
      crop: crop, curve: curve, stageInfo: stageInfo, tasks: tasks, alerts: alerts,
      timeline: timeline, segments: segments, water: water, endDate: endDate, phiLocks: locks
    };
  }, [activePlot, weather, activities, activeSoil]);

  const sAdvice = useMemo(function () {
    if (!activeSoil) return null;
    return soilAdvice(activeSoil, activePlot ? CROPS[activePlot.crop] : null);
  }, [activeSoil, activePlot]);

  const addPlot = function (p) {
    const plot = Object.assign({}, p, { id: store.uuid(), createdAt: Date.now() });
    setPlots(function (prev) { return prev.concat([plot]); });
    setActivePlotId(plot.id);
    if (p.plantedAt) {
      setActivities(function (prev) {
        return [{ id: store.uuid(), plotId: plot.id, type: 'plant', date: p.plantedAt, note: 'เริ่มรอบการผลิต ' + CROPS[p.crop].name, createdAt: Date.now() }].concat(prev);
      });
    }
    setTab('home');
  };
  const removePlot = function (id) {
    setPlots(function (prev) { return prev.filter(function (p) { return p.id !== id; }); });
    setActivities(function (prev) { return prev.filter(function (a) { return a.plotId !== id; }); });
    if (activePlotId === id) setActivePlotId(null);
  };
  const restore = function (data) {
    setPlots(data.plots); setActivities(data.activities);
    setActivePlotId(data.plots.length ? data.plots[0].id : null);
  };
  const addActivity = function (a) {
    setActivities(function (prev) { return [Object.assign({}, a, { id: store.uuid(), createdAt: Date.now() })].concat(prev); });
  };
  const removeActivity = function (id) {
    setActivities(function (prev) { return prev.filter(function (a) { return a.id !== id; }); });
  };

  if (booting) {
    return <div className="boot"><div className="boot-logo">{'\u{1F33E}'}</div><p>กำลังเตรียมปฏิทินเพาะปลูกของคุณ</p></div>;
  }

  const noPlots = plots.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">{'\u{1F33E}'}</span>
          <div>
            <div className="topbar-title">ปฏิทินเพาะปลูกเท่าทันภูมิอากาศ</div>
            <div className="topbar-sub">{profile ? profile.displayName : ''}</div>
          </div>
        </div>
        {!liffState.mock && liffState.inClient ? <button className="icon-btn" onClick={closeApp}>ปิด</button> : null}
      </header>

      {plots.length > 1 && (
        <div className="plot-bar">
          <div className="plot-switch" ref={switchRef}>
            {plots.map(function (p) {
              const on = activePlot && p.id === activePlot.id;
              return (
                <button key={p.id} data-on={on ? '1' : '0'} className={'chip ' + (on ? 'chip-active' : '')}
                  onClick={function () { setActivePlotId(p.id); }}>
                  {CROPS[p.crop] ? <CropIcon crop={CROPS[p.crop]} /> : ''} {p.name}
                </button>
              );
            })}
          </div>
          {plots.length > 3 && (
            <button className="plot-menu-btn" aria-label="รายการแปลงทั้งหมด" onClick={function () { setPlotMenu(!plotMenu); }}>
              {plotMenu ? '\u2715' : '\u2630'}
            </button>
          )}
          {plotMenu && (
            <div className="plot-menu">
              <div className="plot-menu-title">แปลงทั้งหมด ({plots.length})</div>
              {plots.map(function (p) {
                const on = activePlot && p.id === activePlot.id;
                return (
                  <button key={p.id} className={'plot-menu-item ' + (on ? 'on' : '')}
                    onClick={function () { setActivePlotId(p.id); setPlotMenu(false); }}>
                    {CROPS[p.crop] ? <CropIcon crop={CROPS[p.crop]} /> : ''} {p.name}
                    <span className="small muted"> · {CROPS[p.crop] ? CROPS[p.crop].name : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!noPlots && tab !== 'plots' && !bkDismissed && needsBackupReminder(plots.length > 0) && (
        <div className="bk-banner">
          <span>ข้อมูลแปลงของคุณยังไม่ได้สำรอง ถ้าเปลี่ยนมือถือข้อมูลจะหาย</span>
          <button className="btn btn-sm" onClick={function () { setTab('plots'); }}>สำรองเลย</button>
          <button className="bk-x" aria-label="ปิด" onClick={function () { setBkDismissed(true); }}>{'\u2715'}</button>
        </div>
      )}

      <main className="content">
        {noPlots || tab === 'plots' ? (
          <PlotsView plots={plots} activePlotId={activePlot ? activePlot.id : null} activities={activities}
            onAdd={addPlot} onRemove={removePlot} onSelect={setActivePlotId} onRestore={restore} firstRun={noPlots} />
        ) : tab === 'home' ? (
          <Home plot={activePlot} weather={weather} derived={derived} loading={wxLoading} error={wxError}
            onRefresh={function () { refreshWeather(activePlot); }} onLog={addActivity}
            soil={activeSoil} soilAdvice={sAdvice} soilLoading={soilLoading} soilError={soilError}
            onLoadSoil={loadSoilForPlot} nearby={nearby} />
        ) : tab === 'calendar' ? (
          <CalendarView plot={activePlot} derived={derived} activities={activities} weather={weather} />
        ) : tab === 'report' ? (
          <ReportView plot={activePlot} derived={derived} activities={activities} />
        ) : tab === 'chat' ? (
          <ChatView plot={activePlot} derived={derived} weather={weather} soil={activeSoil} soilAdvice={sAdvice} nearby={nearby} />
        ) : tab === 'area' ? (
          <CommunityView plot={activePlot} derived={derived} />
        ) : (
          <LogView plot={activePlot} activities={activities} onAdd={addActivity} onRemove={removeActivity} />
        )}
      </main>

      {!noPlots && (
        <nav className="tabbar tabbar-7">
          {TABS.map(function (t) {
            return (
              <button key={t.key} className={'tab ' + (tab === t.key ? 'tab-active' : '')} onClick={function () { setTab(t.key); }}>
                <span className="tab-icon">{t.emoji}</span><span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}