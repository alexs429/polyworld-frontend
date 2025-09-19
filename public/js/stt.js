// /js/stt.js
let SR = null;
let recognition = null;
let listening = false;
let inputEl = null;
let buttons = [];
let onendRef = null;
let suspendForTTS = false;

function updateButtons() {
  buttons.forEach((b) => {
    if (!b) return;
    b.setAttribute("aria-pressed", listening ? "true" : "false");
    b.classList.toggle("on", listening);
  });
}

export function isSTTAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function initSTT({
  inputSelector = "#prompt",
  buttonIds = ["btnMic", "tbMic"],
  lang = "en-US",
  interim = true,
  continuous = true,
} = {}) {
  SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // Cache elements
  inputEl =
    typeof inputSelector === "string"
      ? document.querySelector(inputSelector)
      : inputSelector;
  buttons = buttonIds.map((id) => document.getElementById(id)).filter(Boolean);

  if (!SR) {
    // Graceful disable
    buttons.forEach((b) => b?.setAttribute("disabled", "disabled"));
    console.warn("STT not supported in this browser.");
    return false;
  }

  recognition = new SR();
  recognition.lang = lang;
  recognition.interimResults = interim;
  recognition.continuous = continuous;

  recognition.onstart = () => {
    listening = true;
    updateButtons();
  };

  recognition.onresult = (e) => {
    let interimText = "";
    let finalText = "";

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interimText += r[0].transcript;
    }

    // Show interim as placeholder so user sees live captioning
    if (inputEl && interim)
      inputEl.placeholder = interimText.trim() || "Type your message…";
    if (inputEl && finalText) {
      inputEl.value = (inputEl.value + " " + finalText).trim();
      // NEW: ask the autogrow to resize
      if (typeof inputEl.__pw_autogrow__ === "function") {
        inputEl.__pw_autogrow__();
      } else {
        // or just dispatch an input event
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  onendRef = () => {
    if (inputEl) inputEl.placeholder = "Type your message…";
    if (listening && !suspendForTTS) {
      // ← check the suspend flag
      try {
        recognition.start();
      } catch {}
    } else {
      updateButtons();
    }
  };
  recognition.onend = onendRef;

  recognition.onerror = (err) => {
    console.error("STT error:", err);
    stopSTT();
  };

  // Hook buttons
  buttons.forEach((b) => b?.addEventListener("click", toggleSTT));

  window.addEventListener("pw:tts-start", () => {
    if (!recognition) return;
    if (listening) {
      suspendForTTS = true;
      try {
        recognition.stop();
      } catch {}
      // keep the mic button in the "on" state; we’ll resume after TTS
    }
  });

  window.addEventListener("pw:tts-end", () => {
    if (!recognition) return;
    const shouldResume = suspendForTTS && listening;
    suspendForTTS = false;
    if (shouldResume) {
      try {
        recognition.start();
      } catch {}
    }
  });

  updateButtons();
  return true;
}

export function startSTT() {
  if (!recognition || listening) return;
  try {
    recognition.start();
    listening = true;
    updateButtons();
  } catch (e) {
    console.error("startSTT failed:", e);
  }
}

export function stopSTT() {
  if (!recognition) return;
  try {
    recognition.onend = null;
    recognition.stop();
  } catch {}
  listening = false;
  updateButtons();
  // restore handler
  setTimeout(() => {
    if (recognition) recognition.onend = onendRef;
  }, 0);
}

export function toggleSTT() {
  listening ? stopSTT() : startSTT();
}
