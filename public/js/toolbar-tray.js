import { setSheet } from "./ui.js";
import { updateMyEmbersVisibility } from "./toolbar-extra.js";

export function initToolbarTray() {
  console.log("initToolbarTray called");

  const tray = document.getElementById("toolTray");
  if (!tray) return;

  tray.addEventListener("click", (e) => {
    const btn = e.target.closest(".pw-tool");
    if (!btn) return;

    const raw = (btn.dataset.cmd || "").toLowerCase();
    const cmd = raw === "buypolistar" ? "swappolistar" : raw;
    window.dispatchEvent(new CustomEvent("pw:run-cmd", { detail: { cmd } }));
    setSheet(false);
  });

  // 👇 Check visibility once on load
  const uid = window.POLY_UID || localStorage.getItem("poly_uid");
  if (uid) updateMyEmbersVisibility(uid);

  // 👇 Re-check whenever POLISTAR changes
  window.addEventListener("pw:balance-changed", (e) => {
    if (e.detail?.token === "polistar") {
      const uid = window.POLY_UID || localStorage.getItem("poly_uid");
      if (uid) updateMyEmbersVisibility(uid);
    }
  });
}
