// ** ให้ระบุ Google Apps Script Web App URL ที่คุณ Deploy ได้ตรงนี้ **
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyuWemA4teBY9lFnNBtUpb7q73T7laYXElxUr0nVjcKVXCACSUfO_WkBLN8_yvvoU0r/exec";

document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.getElementById("navbar");
  const pages = document.querySelectorAll(".page");
  const navBtns = document.querySelectorAll(".nav-btn");

  const videoElement = document.getElementById("webcam");
  const canvasElement = document.getElementById("output-canvas");
  const correctOverlay = document.getElementById("correct-overlay");
  const statusBadge = document.getElementById("status-badge");

  // Setup Canvas Size
  canvasElement.width = 640;
  canvasElement.height = 480;

  // Render Vocab Buttons
  renderVocabButtons();

  // Initialize AI
  initAIModel(videoElement, canvasElement, handleCorrectGesture);

  // Form 1: Onboarding Submit
  document.getElementById("onboarding-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      type: "onboarding",
      userStatus: document.getElementById("user-status").value,
      reason: document.getElementById("reason").value,
      referral: document.getElementById("referral").value
    };

    sendToGoogleSheets(payload);
    
    // Switch to Learning Page
    navbar.classList.remove("hidden");
    switchPage("learning-page");
    startCamera();
    statusBadge.textContent = "AI กำลังทำงาน...";
    statusBadge.style.background = "rgba(34, 197, 94, 0.6)";
  });

  // Form 2: Review Submit
  document.getElementById("review-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      type: "review",
      rating: document.getElementById("rating").value,
      feedback: document.getElementById("feedback").value
    };

    sendToGoogleSheets(payload);
    alert("ขอบคุณสำหรับรีวิวและความรู้สึกดีๆ ครับ!");
    document.getElementById("review-form").reset();
  });

  // Navigation Click Event
  navBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.getAttribute("data-target");
      
      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      switchPage(target);

      if (target === "learning-page") {
        startCamera();
      } else {
        stopCamera();
      }
    });
  });

  // Toggle Camera Button
  document.getElementById("toggle-cam-btn").addEventListener("click", () => {
    if (videoElement.srcObject) {
      stopCamera();
      statusBadge.textContent = "ปิดกล้องแล้ว";
      statusBadge.style.background = "rgba(239, 68, 68, 0.6)";
    } else {
      startCamera();
      statusBadge.textContent = "AI กำลังทำงาน...";
      statusBadge.style.background = "rgba(34, 197, 94, 0.6)";
    }
  });
});

// Switch Page View
function switchPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
  document.getElementById(pageId).classList.remove("hidden");
}

// Render Vocab Buttons
function renderVocabButtons() {
  const container = document.getElementById("vocab-list");
  container.innerHTML = "";

  VOCABULARY.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = `vocab-btn ${index === 0 ? 'active' : ''}`;
    btn.textContent = item.word;
    btn.addEventListener("click", () => selectVocab(index));
    container.appendChild(btn);
  });
}

// Select Vocab Item
function selectVocab(index) {
  currentVocabIndex = index;
  isCorrectState = false;

  document.querySelectorAll(".vocab-btn").forEach((btn, idx) => {
    btn.classList.toggle("active", idx === index);
  });

  const vocab = VOCABULARY[index];
  document.getElementById("target-word").textContent = vocab.word;
  document.getElementById("gesture-instruction").textContent = vocab.instruction;
}

// Handle AI Correct Detect Action
function handleCorrectGesture(vocab) {
  const correctOverlay = document.getElementById("correct-overlay");
  correctOverlay.classList.remove("hidden");

  setTimeout(() => {
    correctOverlay.classList.add("hidden");
    // Next Vocab Automatic Switch
    if (currentVocabIndex < VOCABULARY.length - 1) {
      selectVocab(currentVocabIndex + 1);
    } else {
      selectVocab(0); // Loop back
    }
  }, 1800);
}

// Send Data to Google Sheets via Apps Script Web App API
function sendToGoogleSheets(data) {
  if (GOOGLE_SCRIPT_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
    console.log("Mock Submit Data:", data);
    return;
  }

  fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).catch(err => console.error("Error sending data:", err));
}
