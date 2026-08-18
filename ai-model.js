// ============================================================
// คลังข้อมูลภาษามือและ Logic การตรวจจับด้วย Landmarking
// ขยายจาก 3 ท่า เป็น 25 ท่า โดยใช้ตำแหน่งจุด Landmark ของมือ
// (Landmark index อ้างอิงมาตรฐานของ MediaPipe Hands: 0=ข้อมือ,
//  1-4=โป้ง, 5-8=ชี้, 9-12=กลาง, 13-16=นาง, 17-20=ก้อย)
// หมายเหตุ: เป็นการตรวจจับแบบภาพนิ่งต่อเฟรม (heuristic อย่างง่าย)
// เพื่อการเรียนรู้เบื้องต้น ไม่ใช่ระบบแปลภาษามือที่สมบูรณ์
// ============================================================

// ---------- Finger-state helper functions ----------

// นิ้ว (ชี้/กลาง/นาง/ก้อย) เหยียดขึ้นหรือไม่ (tip อยู่สูงกว่าข้อ PIP)
function fingerUp(lm, tip, pip) {
  return lm[tip].y < lm[pip].y;
}

const IDX = { index: [8, 6], middle: [12, 10], ring: [16, 14], pinky: [20, 18] };

function isUp(lm, name) {
  const [tip, pip] = IDX[name];
  return fingerUp(lm, tip, pip);
}
function isDown(lm, name) {
  return !isUp(lm, name);
}

// นิ้วโป้งชี้ขึ้น / ชี้ลง (เทียบกับข้อมือ)
function thumbUp(lm) {
  return lm[4].y < lm[0].y - 0.05;
}
function thumbDown(lm) {
  return lm[4].y > lm[0].y + 0.05;
}
// นิ้วโป้งพับแนบฝ่ามือ (ปลายโป้งอยู่ใกล้ศูนย์กลางฝ่ามือ)
function thumbFolded(lm) {
  const dx = lm[4].x - lm[9].x;
  const dy = lm[4].y - lm[9].y;
  return Math.hypot(dx, dy) < 0.12;
}
// นิ้วโป้งกาง แนวนอน ไปทางขวา / ทางซ้าย ของภาพ
function thumbPointRight(lm) {
  return (lm[4].x - lm[2].x) > 0.06 && Math.abs(lm[4].y - lm[2].y) < 0.06;
}
function thumbPointLeft(lm) {
  return (lm[2].x - lm[4].x) > 0.06 && Math.abs(lm[4].y - lm[2].y) < 0.06;
}
// นิ้วชี้ แนวนอน ไปทางขวา / ทางซ้าย ของภาพ
function indexPointRight(lm) {
  return (lm[8].x - lm[6].x) > 0.06 && Math.abs(lm[8].y - lm[6].y) < 0.06;
}
function indexPointLeft(lm) {
  return (lm[6].x - lm[8].x) > 0.06 && Math.abs(lm[8].y - lm[6].y) < 0.06;
}
// โป้งกับชี้จิ้มติดกัน (Pinch)
function isPinching(lm) {
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.07;
}

// ---------- Programmatic demo-icon generator ----------
// สร้างไอคอน SVG อย่างง่ายจาก pattern ของนิ้ว [thumb,index,middle,ring,pinky]
// true = เหยียดออก (เส้นยาว สีฟ้า), false = พับ (เส้นสั้น สีเทา)
function buildHandIcon(pattern) {
  const tips = [
    [18, 14], // thumb
    [26, 10], // index
    [34, 9],  // middle
    [42, 11], // ring
    [48, 20]  // pinky
  ];
  const base = [32, 40];
  const lines = tips.map(([tx, ty], i) => {
    const extended = pattern[i];
    const ex = base[0] + (tx - base[0]) * (extended ? 1 : 0.45);
    const ey = base[1] + (ty - base[1]) * (extended ? 1 : 0.45);
    const color = extended ? 'var(--primary-color)' : 'var(--text-muted)';
    const width = extended ? 4 : 3;
    return `<line x1="${base[0]}" y1="${base[1]}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  }).join('');
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <g fill="none">${lines}</g>
      <rect x="20" y="38" width="24" height="18" rx="8" fill="var(--accent-color)" opacity="0.85"/>
    </svg>`;
}

// ไอคอนแบบพิเศษ สำหรับท่าที่ไม่ใช่แค่ "เหยียด/พับ" ตรงๆ (ทิศทาง)
function buildArrowIcon(direction) {
  // direction: 'up' | 'down' | 'left' | 'right'
  const arrows = {
    up: 'M32 50 L32 14 M22 24 L32 14 L42 24',
    down: 'M32 14 L32 50 M22 40 L32 50 L42 40',
    left: 'M50 32 L14 32 M24 22 L14 32 L24 42',
    right: 'M14 32 L50 32 M40 22 L50 32 L40 42'
  };
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="${arrows[direction]}" fill="none" stroke="var(--primary-color)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="20" y="46" width="24" height="12" rx="6" fill="var(--accent-color)" opacity="0.6"/>
    </svg>`;
}

// ไอคอนท่าจิ้มนิ้วโป้ง-ชี้เป็นวงกลม (OK / Zero) othersUp = นิ้วกลาง นาง ก้อย เหยียดหรือพับ
function buildPinchIcon(othersUp) {
  const others = [10, 11, 12].map((cy, i) => {
    const color = othersUp ? 'var(--primary-color)' : 'var(--text-muted)';
    const y2 = othersUp ? cy : 22;
    return `<line x1="${26 + i * 6}" y1="34" x2="${26 + i * 6}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  }).join('');
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="24" r="5" fill="none" stroke="var(--primary-color)" stroke-width="4"/>
      ${others}
      <rect x="14" y="38" width="30" height="18" rx="8" fill="var(--accent-color)" opacity="0.85"/>
    </svg>`;
}

// ---------- Vocabulary (25 ท่า) ----------
const VOCABULARY = [
  {
    id: "hello",
    word: "สวัสดี (Hello)",
    instruction: "กางนิ้วมือทั้ง 5 ออก และหันฝ่ามือเข้าหากล้อง",
    detect: (lm) => isHandOpen(lm),
    demoSVG: buildHandIcon([true, true, true, true, true])
  },
  {
    id: "love",
    word: "รัก / I Love You",
    instruction: "ชู นิ้วโป้ง, นิ้วชี้ และ นิ้วก้อย ออกมา (พับนิ้วกลางและนิ้วนาง)",
    detect: (lm) => isILoveYouSign(lm),
    demoSVG: buildHandIcon([true, true, false, false, true])
  },
  {
    id: "thanks",
    word: "ขอบคุณ (Thank You)",
    instruction: "พับนิ้วโป้งลง และแบมือขนานแนวนอนเข้าหากล้อง",
    detect: (lm) => isFlatHand(lm),
    demoSVG: buildHandIcon([false, true, true, true, false])
  },
  {
    id: "one",
    word: "หนึ่ง (1)",
    instruction: "ชูนิ้วชี้ขึ้นเพียงนิ้วเดียว นิ้วที่เหลือพับเก็บ",
    detect: (lm) => isUp(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([false, true, false, false, false])
  },
  {
    id: "two",
    word: "สอง (2)",
    instruction: "ชูนิ้วชี้และนิ้วกลางขึ้น นิ้วที่เหลือพับเก็บ",
    detect: (lm) => isUp(lm, "index") && isUp(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([false, true, true, false, false])
  },
  {
    id: "three",
    word: "สาม (3)",
    instruction: "ชูนิ้วชี้ นิ้วกลาง และนิ้วนางขึ้น พับนิ้วก้อยและโป้ง",
    detect: (lm) => isUp(lm, "index") && isUp(lm, "middle") && isUp(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([false, true, true, true, false])
  },
  {
    id: "four",
    word: "สี่ (4)",
    instruction: "ชูนิ้วชี้ กลาง นาง และก้อยขึ้นทั้งหมด พับนิ้วโป้งเก็บไว้",
    detect: (lm) => isUp(lm, "index") && isUp(lm, "middle") && isUp(lm, "ring") && isUp(lm, "pinky") && thumbFolded(lm),
    demoSVG: buildHandIcon([false, true, true, true, true])
  },
  {
    id: "five",
    word: "ห้า (5)",
    instruction: "กางนิ้วมือทั้ง 5 ออกให้สุด รวมนิ้วโป้งด้วย",
    detect: (lm) => isUp(lm, "index") && isUp(lm, "middle") && isUp(lm, "ring") && isUp(lm, "pinky") && thumbUp(lm),
    demoSVG: buildHandIcon([true, true, true, true, true])
  },
  {
    id: "good",
    word: "เยี่ยมมาก (Good / Thumbs Up)",
    instruction: "กำมือ แล้วชูนิ้วโป้งขึ้นด้านบน",
    detect: (lm) => thumbUp(lm) && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('up')
  },
  {
    id: "bad",
    word: "แย่จัง (Bad / Thumbs Down)",
    instruction: "กำมือ แล้วชี้นิ้วโป้งลงด้านล่าง",
    detect: (lm) => thumbDown(lm) && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('down')
  },
  {
    id: "stop",
    word: "หยุดก่อน (Stop)",
    instruction: "กำมือแน่นๆ ทุกนิ้วพับเก็บทั้งหมด",
    detect: (lm) => isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky") && thumbFolded(lm),
    demoSVG: buildHandIcon([false, false, false, false, false])
  },
  {
    id: "ok",
    word: "โอเค (OK)",
    instruction: "เอาปลายนิ้วโป้งกับนิ้วชี้มาจิ้มติดกันเป็นวงกลม นิ้วกลาง นาง ก้อย กางออก",
    detect: (lm) => isPinching(lm) && isUp(lm, "middle") && isUp(lm, "ring") && isUp(lm, "pinky"),
    demoSVG: buildPinchIcon(true)
  },
  {
    id: "call_me",
    word: "โทรหานะ (Call Me)",
    instruction: "ชูนิ้วโป้งกับนิ้วก้อยออก พับนิ้วชี้ กลาง นาง (ท่าโทรศัพท์)",
    detect: (lm) => thumbUp(lm) && isUp(lm, "pinky") && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring"),
    demoSVG: buildHandIcon([true, false, false, false, true])
  },
  {
    id: "wait",
    word: "รอแป๊บนึง (Wait / ตัว L)",
    instruction: "กางนิ้วโป้งกับนิ้วชี้ตั้งฉากกันเป็นรูปตัว L นิ้วที่เหลือพับเก็บ",
    detect: (lm) => thumbUp(lm) && isUp(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([true, true, false, false, false])
  },
  {
    id: "this_way",
    word: "ไปทางนี้ (This Way)",
    instruction: "เหยียดนิ้วชี้ออกในแนวนอน ชี้ไปทางขวาของจอ นิ้วอื่นพับเก็บ",
    detect: (lm) => indexPointRight(lm) && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('right')
  },
  {
    id: "over_there",
    word: "ไปทางโน้น (Over There)",
    instruction: "เหยียดนิ้วชี้ออกในแนวนอน ชี้ไปทางซ้ายของจอ นิ้วอื่นพับเก็บ",
    detect: (lm) => indexPointLeft(lm) && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('left')
  },
  {
    id: "pinky_promise",
    word: "ก้อยกัน (Pinky Promise)",
    instruction: "ชูนิ้วก้อยขึ้นเพียงนิ้วเดียว นิ้วอื่นพับเก็บ",
    detect: (lm) => isUp(lm, "pinky") && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring"),
    demoSVG: buildHandIcon([false, false, false, false, true])
  },
  {
    id: "a_little",
    word: "นิดหน่อย (A Little Bit)",
    instruction: "ชูนิ้วโป้ง นิ้วชี้ และนิ้วกลางขึ้น พับนิ้วนางกับก้อยเก็บ",
    detect: (lm) => thumbUp(lm) && isUp(lm, "index") && isUp(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([true, true, true, false, false])
  },
  {
    id: "sorry",
    word: "ขอโทษนะ (Sorry)",
    instruction: "พับนิ้วโป้งกับนิ้วชี้เก็บ ชูนิ้วกลาง นาง และก้อยขึ้น",
    detect: (lm) => thumbFolded(lm) && isDown(lm, "index") && isUp(lm, "middle") && isUp(lm, "ring") && isUp(lm, "pinky"),
    demoSVG: buildHandIcon([false, false, true, true, true])
  },
  {
    id: "tiny_bit",
    word: "นิดเดียว (Just A Tiny Bit)",
    instruction: "ชูเฉพาะนิ้วนางกับนิ้วก้อยขึ้น นิ้วที่เหลือพับเก็บ",
    detect: (lm) => isUp(lm, "ring") && isUp(lm, "pinky") && isDown(lm, "index") && isDown(lm, "middle") && thumbFolded(lm),
    demoSVG: buildHandIcon([false, false, false, true, true])
  },
  {
    id: "almost",
    word: "เกือบแล้ว (Almost There)",
    instruction: "ชูนิ้วโป้ง ชี้ กลาง และนาง ขึ้น พับเฉพาะนิ้วก้อยเก็บ",
    detect: (lm) => thumbUp(lm) && isUp(lm, "index") && isUp(lm, "middle") && isUp(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildHandIcon([true, true, true, true, false])
  },
  {
    id: "love_you_so_much",
    word: "รักเธอมากๆ (Love You So Much)",
    instruction: "ชูนิ้วโป้ง นิ้วชี้ และนิ้วก้อยขึ้นพร้อมกัน พับนิ้วกลางกับนางเก็บ (ท่า ILY เต็มรูปแบบ)",
    detect: (lm) => thumbUp(lm) && isUp(lm, "index") && isUp(lm, "pinky") && isDown(lm, "middle") && isDown(lm, "ring"),
    demoSVG: buildHandIcon([true, true, false, false, true])
  },
  {
    id: "go_right",
    word: "ไปทางขวา (Go Right)",
    instruction: "กำมือ แล้วกางนิ้วโป้งออกในแนวนอน ชี้ไปทางขวาของจอ",
    detect: (lm) => thumbPointRight(lm) && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('right')
  },
  {
    id: "go_left",
    word: "ไปทางซ้าย (Go Left)",
    instruction: "กำมือ แล้วกางนิ้วโป้งออกในแนวนอน ชี้ไปทางซ้ายของจอ",
    detect: (lm) => thumbPointLeft(lm) && isDown(lm, "index") && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildArrowIcon('left')
  },
  {
    id: "zero",
    word: "ศูนย์ (Zero)",
    instruction: "เอาปลายนิ้วโป้งกับนิ้วชี้มาจิ้มติดกันเป็นวงกลม พับนิ้วกลาง นาง ก้อย เก็บทั้งหมด",
    detect: (lm) => isPinching(lm) && isDown(lm, "middle") && isDown(lm, "ring") && isDown(lm, "pinky"),
    demoSVG: buildPinchIcon(false)
  }
];

let currentVocabIndex = 0;
let camera = null;
let hands = null;
let isCorrectState = false;

// Initialize MediaPipe Hands
function initAIModel(videoElement, canvasElement, onCorrectCallback) {
  const canvasCtx = canvasElement.getContext('2d');

  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  hands.onResults((results) => {
    // Clear Canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];

      // Draw Landmarks & Connections
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#38bdf8', lineWidth: 3 });
      drawLandmarks(canvasCtx, landmarks, { color: '#22c55e', lineWidth: 1, radius: 4 });

      // Run Gesture Check
      const targetVocab = VOCABULARY[currentVocabIndex];
      if (targetVocab && targetVocab.detect(landmarks) && !isCorrectState) {
        isCorrectState = true;
        onCorrectCallback(targetVocab);
      }
    }
    canvasCtx.restore();
  });

  // Camera Setup
  camera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });
}

function startCamera() {
  if (camera) camera.start();
}

function stopCamera() {
  if (camera) camera.stop();
}

// ================= GESTURE HEURISTICS (3 ท่าดั้งเดิม) ================= //

// 1. ตรวจจับ มือแผ่ออก (Open Palm - สวัสดี)
function isHandOpen(lm) {
  return lm[8].y < lm[6].y &&  // Index finger extended
         lm[12].y < lm[10].y && // Middle finger extended
         lm[16].y < lm[14].y && // Ring finger extended
         lm[20].y < lm[18].y;   // Pinky extended
}

// 2. ตรวจจับ I Love You (ชู โป้ง, ชี้, ก้อย)
function isILoveYouSign(lm) {
  const indexExtended = lm[8].y < lm[6].y;
  const pinkyExtended = lm[20].y < lm[18].y;
  const middleFolded = lm[12].y > lm[10].y;
  const ringFolded = lm[16].y > lm[14].y;

  return indexExtended && pinkyExtended && middleFolded && ringFolded;
}

// 3. ตรวจจับ แบมือแนวตั้ง/ขนาน (ขอบคุณ)
function isFlatHand(lm) {
  return lm[8].y < lm[5].y &&
         lm[12].y < lm[9].y &&
         lm[16].y < lm[13].y &&
         Math.abs(lm[4].x - lm[2].x) < 0.1; // Thumb folded in
}
