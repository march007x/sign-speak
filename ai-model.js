// คลังข้อมูลภาษามือและ Logic การตรวจจับด้วย Landmarking
const VOCABULARY = [
  {
    id: "hello",
    word: "สวัสดี (Hello)",
    instruction: "กางนิ้วมือทั้ง 5 ออก และหันฝ่ามือเข้าหากล้อง",
    detect: (landmarks) => isHandOpen(landmarks)
  },
  {
    id: "love",
    word: "รัก / I Love You",
    instruction: "ชู นิ้วโป้ง, นิ้วชี้ และ นิ้วก้อย ออกมา (พับนิ้วกลางและนิ้วนาง)",
    detect: (landmarks) => isILoveYouSign(landmarks)
  },
  {
    id: "thanks",
    word: "ขอบคุณ (Thank You)",
    instruction: "พับนิ้วโป้งลง และแบมือขนานแนวนอนเข้าหากล้อง",
    detect: (landmarks) => isFlatHand(landmarks)
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

// ================= GESTURE HEURISTICS ================= //

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
