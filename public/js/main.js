import "./auth.js"; // exposes window.authReady / window.getIdTokenimport "./auth.js";
import { typeStatusMessage, setSheet } from "./ui.js";
import { loadExistingUser, showUserAddress } from "./wallet.js";
import { updateMyEmbersVisibility } from "./toolbar-extra.js";
import { displayPolistarBalance, getPolistarBalance } from "./balances.js";
import { initCamera } from "./camera.js";
import { setupPrompt } from "./chat.js";
import { speakWithPolistar } from "./speech.js";
import { initFlip } from "./flip.js";
import { initTTSUI } from "./speech.js";
import { initSTT } from "./stt.js";
import { bindAutoGrow } from "./autoTextarea.js";
import { initToolbarTray } from "./toolbar-tray.js";

window.addEventListener("DOMContentLoaded", () => {
  // Wrap async logic in an IIFE so we don't use top‑level await
  (async () => {
    // 1) Wait for Firebase user (authReady resolves when a user exists)
    if (window.authReady) {
      try {
        await window.authReady;
      } catch (e) {
        console.warn("Auth failed", e);
      }
    }
    //-- Init User
    loadExistingUser();
    //-- Camera
    initCamera();
    //-- Flip
    initFlip(); // 👈 wire flip interactions
    //-- Toolbar
    initToolbarTray();
    //-- Prompt
    setupPrompt();
    // wires bubble + toolbar buttons, restores saved state
    initTTSUI();
    // Travellers speech controller
    initSTT({ inputSelector: "#prompt", buttonIds: ["btnMic", "tbMic"] });
    //
    bindAutoGrow("#prompt", 40);

    setTimeout(() => {
      getPolistarBalance(window.currentWalletAddress);
      displayPolistarBalance(false);

      // 2) directly toggle My Embers visibility NOW
      updateMyEmbersVisibility(window.currentWalletAddress);

      speakWithPolistar(
        "Greetings, Traveller. I am Poly… born of flame and thought. Ask, and I shall listen."
      );
    }, 1000);
    typeStatusMessage("✨ Welcome, Traveller. Your flame is near…");
    showUserAddress();

    // Bottom sheet wiring
    const btnPlus = document.getElementById("btnPlus");
    const dim = document.getElementById("dim");
    btnPlus?.addEventListener("click", () =>
      setSheet(!document.getElementById("funcSheet").classList.contains("open"))
    );
    dim?.addEventListener("click", () => setSheet(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setSheet(false);
    });
  })();
});
