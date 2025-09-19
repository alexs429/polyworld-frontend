// ===== Debug toggle & logger =====
let __ttsDebug = JSON.parse(localStorage.getItem("pw_tts_debug") || "false");
function dbg(...args) { if (__ttsDebug) console.log("[TTS]", ...args); }
window.PWdebugTTS = function (on = true) {
  __ttsDebug = !!on;
  localStorage.setItem("pw_tts_debug", JSON.stringify(__ttsDebug));
  console.log("TTS debug =", __ttsDebug);
};

// --- Global TTS tracking + audio handle ---
let __emberSpeaking = false;
let __polistarSpeaking = false;
let __emberAudio = null;

// ---- Voice utilities ----
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const GENDER = { FEMALE: "FEMALE", MALE: "MALE" };

function _isFemaleName(name='') {
  const s = name.toLowerCase();
  return ['female','aria','jenny','zira','samantha','victoria','karen','tessa','zoe','natalie','emma','olivia','amy','lucy','lily'].some(h => s.includes(h));
}
function _isMaleName(name='') {
  const s = name.toLowerCase();
  return ['male','matthew','daniel','george','james','michael','allan','stephen','alex','fred','oliver','harry','charlie','edward','guy'].some(h => s.includes(h));
}
function nameGenderHint(name) {
  const s = (name || "").toLowerCase();
  if (_isFemaleName(s)) return GENDER.FEMALE;
  if (_isMaleName(s)) return GENDER.MALE;
  return null;
}
function getVoicesAsync() {
  return new Promise((resolve) => {
    const have = window.speechSynthesis?.getVoices?.() || [];
    if (have.length) return resolve(have);
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 500);
  });
}
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsGet(k) { try { return localStorage.getItem(k) || null; } catch { return null; } }

// ===== Active Ember voice =====
const defaultEmberVoice = { lang: "en-US", rate: 1.0, pitch: 1.0, ssmlGender: null, googleVoiceName: null };
let __emberVoice = { ...defaultEmberVoice };

export function setEmberVoice(voiceObj) {
  try {
    dbg("setEmberVoice - raw voiceObj:", voiceObj);
    const cfg = voiceObj?.synthesizeSpeechConfig || voiceObj || {};
    const gName = cfg?.voice?.name || null;
    const ssmlGender = (cfg?.voice?.ssmlGender || "").toUpperCase().trim() || null;
    let lang = cfg.languageCode || null;
    if (!lang && typeof gName === "string") {
      const m = gName.match(/^([a-z]{2})-([A-Z]{2})/);
      if (m) lang = `${m[1]}-${m[2]}`;
    }
    const rate  = clamp(Number(cfg.speakingRate ?? 1.0), 0.1, 4.0);
    const pitch = typeof cfg.pitch === "number" ? clamp(1 + cfg.pitch / 20, 0, 2) : 1.0;
    __emberVoice = { lang: lang || "en-US", rate, pitch, ssmlGender, googleVoiceName: gName };
    console.log("[TTS] setEmberVoice normalized:", __emberVoice);
  } catch (e) {
    console.warn("[speech] setEmberVoice failed; using defaults", e);
    __emberVoice = { ...defaultEmberVoice };
  }
}

function pickBrowserVoiceFor({ lang, ssmlGender }, voices) {
  const wantLang = (lang || "en-US").toLowerCase();
  const base = (wantLang.slice(0,2) || "en").toLowerCase();
  const g = (ssmlGender === "FEMALE" || ssmlGender === "MALE") ? ssmlGender : null;

  const savedLang = lsGet(`pw_tts_pref_${base}_${g || "ANY"}`);
  const savedAny  = lsGet(`pw_tts_pref_${g || "ANY"}`);
  const trySaved = (name) => name ? voices.find(v => v.name === name) : null;
  const savedPick = trySaved(savedLang) || trySaved(savedAny);
  if (savedPick) return savedPick;

  const poolExact = voices.filter(v => (v.lang || "").toLowerCase().startsWith(wantLang));
  const poolBase  = voices.filter(v => (v.lang || "").toLowerCase().startsWith(base));

  const choose = (pool, gender) => {
    let list = gender ? pool.filter(v => nameGenderHint(v.name) === gender) : pool;
    return list.find(v => v.name.includes("Google")) || list.find(v => v.name.includes("Microsoft")) || list[0] || null;
  };

  return choose(poolExact, g) || choose(poolBase, g) || voices[0] || null;
}

// ===== Ember speech =====
export async function speakWithEmber(text) {
  stopEmberNow(); // Stop anything playing
  const synth = window.speechSynthesis;
  if (!synth || !text) return;

  const voices = await getVoicesAsync();
  const u = new SpeechSynthesisUtterance(text);

  // ✅ Simple but effective picker
  const preferred =
    voices.find(v => v.lang.includes(__emberVoice.lang) && v.name.toLowerCase().includes("female")) ||
    voices.find(v => v.lang.includes(__emberVoice.lang)) ||
    voices.find(v => v.name.toLowerCase().includes("female")) ||
    voices[0];

  u.voice = preferred;
  u.lang = __emberVoice.lang;
  u.rate = __emberVoice.rate;
  u.pitch = __emberVoice.pitch;

  dbg("WebSpeech utterance:", {
    lang: u.lang, rate: u.rate, pitch: u.pitch,
    chosenVoice: preferred ? { name: preferred.name, lang: preferred.lang } : null
  });

  u.onstart = () => {
    __emberSpeaking = true;
    window.dispatchEvent(new CustomEvent("pw:tts-start", { detail: { who: "ember" } }));
  };
  const end = () => {
    __emberSpeaking = false;
    window.dispatchEvent(new CustomEvent("pw:tts-end", { detail: { who: "ember" } }));
  };
  u.onend = end;
  u.onerror = end;

  synth.cancel();
  synth.speak(u);
}


// ===== Polistar voice =====
export function speakWithPolistar(text) {
  if (!ttsEnabled || !("speechSynthesis" in window)) return;
  const speak = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; u.pitch = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => v.lang.includes("en-GB") && v.name.toLowerCase().includes("female")) ||
      voices.find(v => v.lang.includes("en-GB")) ||
      voices.find(v => v.name.toLowerCase().includes("female")) ||
      voices[0];
    if (preferred) u.voice = preferred;

    u.onstart = () => {
      __polistarSpeaking = true; updateTtsButtons(true);
      window.dispatchEvent(new CustomEvent("pw:tts-start", { detail: { who: "polistar" } }));
    };
    const end = () => {
      __polistarSpeaking = false; updateTtsButtons(false);
      window.dispatchEvent(new CustomEvent("pw:tts-end",   { detail: { who: "polistar" } }));
    };
    u.onend = end; u.onerror = end;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length > 0) speak();
  else window.speechSynthesis.onvoiceschanged = speak;
}

// ===== TTS UI and toggles =====
export function stopEmberNow() {
  if (__emberAudio) { try { __emberAudio.pause(); } catch {} __emberAudio = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  __emberSpeaking = false;
  __polistarSpeaking = false;

  window.dispatchEvent(new CustomEvent("pw:tts-end", { detail: { who: "ember", reason: "manual-cancel" } }));
  window.dispatchEvent(new CustomEvent("pw:tts-end", { detail: { who: "polistar", reason: "manual-cancel" } }));
  try { updateTtsButtons(false); } catch {}
}

let ttsEnabled = JSON.parse(localStorage.getItem("polistar_tts_enabled") || "true");
function updateTtsButtons(isSpeaking = false) {
  const ids = ["btnTTS", "tbTTS", "aiTtsToggle"];
  ids.forEach((id) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.setAttribute("aria-pressed", String(ttsEnabled));
    b.dataset.on = String(ttsEnabled);
    b.textContent = ttsEnabled ? "🔊" : "🔇";
    b.dataset.label = ttsEnabled ? "ON" : "OFF";
    b.classList.toggle("speaking", !!isSpeaking && ttsEnabled);
  });
}
export function getTTSEnabled() { return ttsEnabled; }
export function setTTSEnabled(v) { ttsEnabled = !!v; localStorage.setItem("polistar_tts_enabled", JSON.stringify(ttsEnabled)); updateTtsButtons(false); }
export function toggleTTSEnabled() { setTTSEnabled(!ttsEnabled); }
export function initTTSUI() {
  updateTtsButtons(false);
  const handler = () => toggleTTSEnabled();
  document.getElementById("btnTTS")?.addEventListener("click", handler);
  document.getElementById("tbTTS")?.addEventListener("click", handler);
  document.getElementById("aiTtsToggle")?.addEventListener("click", handler);
}

// ===== Dev tool =====
window.PWvoices = async () => {
  const list = await getVoicesAsync();
  console.table(list.map(v => ({ name: v.name, lang: v.lang })));
  return list;
};