import React from 'react';

// ไอคอนทุเรียนและมะม่วงดิบวาดเป็น SVG เอง แทนอิโมจิ เพราะ:
// - ทุเรียนไม่มีอิโมจิในมาตรฐาน Unicode เลย (ของเดิมใช้อิโมจิเกาลัด/มะพร้าวซึ่งไม่ใช่ทุเรียน)
// - มะม่วงดิบกับมะม่วงสุกใช้อิโมจิมะม่วง 🥭 ตัวเดียวกัน แยกไม่ออกว่าอันไหนดิบอันไหนสุก
// วาดเป็น SVG แทนการฝังรูปภาพจากเว็บ เพื่อให้คมชัดทุกขนาดจอและไม่พังหากลิงก์ภายนอกใช้ไม่ได้
const DURIAN_SPIKES = 'M 21.3,13.9 L 18.0,14.7 L 20.4,17.0 L 17.0,16.6 L 18.5,19.7 L 15.5,18.1 L 15.8,21.5 L 13.5,19.0 L 12.7,22.3 L 11.4,19.2 L 9.5,22.0 L 9.3,18.6 L 6.6,20.5 L 7.6,17.3 L 4.3,18.2 L 6.3,15.5 L 3.0,15.3 L 5.8,13.5 L 2.7,12.1 L 6.0,11.3 L 3.6,9.0 L 7.0,9.4 L 5.5,6.3 L 8.5,7.9 L 8.2,4.5 L 10.5,7.0 L 11.3,3.7 L 12.6,6.8 L 14.5,4.0 L 14.7,7.4 L 17.4,5.5 L 16.4,8.7 L 19.7,7.8 L 17.7,10.5 L 21.0,10.7 L 18.2,12.5 Z';

function DurianIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" style={{ verticalAlign: '-0.15em' }}>
      <path d={DURIAN_SPIKES} fill="#8A9A3B" stroke="#5C6B22" strokeWidth="0.6" strokeLinejoin="round" />
      <ellipse cx="12" cy="13.5" rx="4.4" ry="4.8" fill="#C9D77A" opacity="0.55" />
    </svg>
  );
}

function GreenMangoIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" style={{ verticalAlign: '-0.15em' }}>
      <path d="M 7 6 C 3 9, 2 15, 7 19 C 11 22.5, 18 21, 20 15 C 21.5 10.5, 18 5, 12.5 4.5 C 10.5 4.3, 8.5 4.7, 7 6 Z"
        fill="#6BAE3F" stroke="#3F7A24" strokeWidth="0.6" />
      <path d="M 8 8 C 7 12, 8.5 17, 13 19.5" fill="none" stroke="#3F7A24" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <ellipse cx="13.5" cy="4.6" rx="1.1" ry="1.5" fill="#5C4326" transform="rotate(-20 13.5 4.6)" />
    </svg>
  );
}

const CUSTOM_ICONS = { durian: DurianIcon, mangoGreen: GreenMangoIcon };

// ใช้แทน {crop.emoji} ทุกจุด: ถ้า crop นี้มีไอคอนวาดเองให้ใช้ไอคอนนั้น ไม่งั้น fallback เป็นอิโมจิเดิม
export default function CropIcon({ crop }) {
  if (!crop) return null;
  const Custom = CUSTOM_ICONS[crop.id];
  if (Custom) return <Custom />;
  return <>{crop.emoji}</>;
}
