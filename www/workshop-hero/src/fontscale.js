// ตัวอักษร TH SarabunPSK บนแผ่นป้ายในฉาก (canvas)
// TH SarabunPSK วาดตัวอักษรเล็กกว่าฟอนต์ทั่วไปราว 30% ที่ขนาดตัวเลขเท่ากัน (เหมือน 16 pt ในเอกสารราชการ)
// ป้ายในแว่น VR จึงขยายขนาดให้อ่านได้เท่าเดิม — ทุกจุดที่ตั้ง ctx.font ในเกมผ่านตรงนี้ ไม่ต้องแก้ทีละไฟล์
// Must be the first import in main.js, and the font files must be loaded before the first canvas is drawn.

export const SARABUN_SCALE = 1.4;      // same letter height as the previous font (Sukhumvit Set) on the 3D cards

const proto = CanvasRenderingContext2D.prototype;
const desc = Object.getOwnPropertyDescriptor(proto, 'font');
if (desc?.set && !proto.__sarabunScaled) {
  Object.defineProperty(proto, 'font', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) {
      if (typeof v === 'string' && v.includes('SarabunPSK')) v = v.replace(/(\d+(?:\.\d+)?)px/, (m, n) => `${(Number(n) * SARABUN_SCALE).toFixed(1)}px`);
      desc.set.call(this, v);
    },
  });
  proto.__sarabunScaled = true;
}

/** Waits until both weights of TH SarabunPSK can be used on canvases (falls back silently if the files are missing). */
export function loadThaiFont() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all([document.fonts.load('400 32px "TH SarabunPSK"'), document.fonts.load('700 32px "TH SarabunPSK"')]).catch(() => {});
}
