// คำแนะนำเมื่อน้ำเกินความต้องการ: การระบายน้ำ และการดูแลพืชหลังน้ำลด
// ใช้ข้อมูลฝนย้อนหลัง/พยากรณ์จากตารางสมดุลน้ำ (rows) ของแปลง
const ROOT_ROT = ['durian', 'avocado', 'avocadoLight', 'avocadoHeavy', 'macadamia', 'chili', 'cassava', 'garlic', 'cabbage', 'mungbean'];

function sumRain(rows, from, to) {
  let s = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].date >= from && rows[i].date <= to) s += rows[i].rain || 0;
  }
  return s;
}

export function ymdAdd(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = function (x) { return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ระดับ: none ปกติ | wet ฝนมาก/ดินอิ่มน้ำ ควรระบาย | flood ฝนหนักต่อเนื่อง/น้ำท่วมขัง
export function excessWaterCare(water, crop, todayStr) {
  if (!water || !water.rows || !water.rows.length) return { level: 'none' };
  const rows = water.rows;
  const past3 = sumRain(rows, ymdAdd(todayStr, -2), todayStr);
  const next3 = sumRain(rows, ymdAdd(todayStr, 1), ymdAdd(todayStr, 3));
  let streak = 0, best = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].date > todayStr) break;
    if ((rows[i].rain || 0) >= 20) { streak++; if (streak > best) best = streak; } else streak = 0;
  }
  const lvl = water.summary && water.summary.level;
  let level = 'none';
  if (best >= 3 || past3 >= 120 || (past3 >= 80 && next3 >= 40)) level = 'flood';
  else if (lvl === 'wet' || next3 >= 40 || past3 >= 60) level = 'wet';
  if (level === 'none') return { level: 'none', past3: past3, next3: next3 };

  const rot = ROOT_ROT.indexOf(crop.id) >= 0;
  const tree = !!crop.perennial;
  const drain = [
    'ขุดหรือเปิดร่องระบายน้ำรอบแปลง และเปิดทางน้ำออกก่อนฝนมา ไม่ให้น้ำขังเกิน 24 ชั่วโมง',
    tree ? 'พูนโคนให้สูงเป็นโคก/ยกร่อง ไม่ให้น้ำขังที่โคนต้น เปิดทางน้ำไหลออกจากทรงพุ่ม'
      : 'ยกร่องหรือขุดร่องน้ำระหว่างแถว ใช้เครื่องสูบน้ำช่วยถ้าน้ำท่วมขังนานกว่า 1 วัน',
    'งดให้น้ำและงดใส่ปุ๋ยเม็ดจนกว่าดินจะหมาด เพราะปุ๋ยจะถูกชะล้างและรากดูดไม่ได้',
    'งดการเข้าไปเหยียบย่ำในแปลงขณะดินเปียกแฉะ'
  ];
  const after = [
    'เมื่อน้ำลด ให้ระบายน้ำให้แห้งเร็วที่สุด ล้างโคลนที่เกาะใบ ลำต้น และโคนต้นด้วยน้ำสะอาด',
    'รอดินหมาดแล้วพรวนผิวดินเบาๆ ให้รากได้อากาศ ระวังไม่ให้กระทบราก',
    rot ? 'สำรวจโคนเน่า รากเน่า ใบเหลืองซีด เหี่ยวทั้งที่ดินชื้น ถ้าพบให้ถอนหรือตัดต้นที่เสียหายออกและราดไตรโคเดอร์มา/สารตามคำแนะนำ' : 'สำรวจโรคเน่า ใบเหลือง ใบจุด ภายใน 3–7 วันหลังน้ำลด',
    'ฟื้นต้นด้วยปุ๋ยไนโตรเจนอัตราน้อยหรือปุ๋ยน้ำทางใบหลังดินหมาด 5–7 วัน ยังไม่ต้องใส่หนักจนกว่ารากฟื้น',
    'ตัดแต่งกิ่ง ใบ ผลที่เสียหายและเก็บออกจากแปลง เพื่อลดแหล่งสะสมโรค',
    'ถ้าพ่นสารป้องกันโรคราหลังน้ำลด ให้ตรวจค่า PHI บนฉลากก่อนใกล้เก็บเกี่ยว'
  ];
  return { level: level, past3: Math.round(past3), next3: Math.round(next3), streak: best, drain: drain, after: after };
}
