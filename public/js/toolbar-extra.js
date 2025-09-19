import { getPolistarBalance } from "./balances.js";

export async function updateMyEmbersVisibility(uid) {
  const el = document.getElementById("toolMyEmbers");
  if (!el) return;

  try {
    const balObj = await getPolistarBalance(uid);
    const balance = balObj.balance;
    //console.log("POLISTAR balance =", balance);
    //console.log("toolMyEmbers", el);
    // show if >100, otherwise hide
    el.style.display = balance > 100 ? "block" : "none";
    console.log("balance > 100:", balance > 100);
  } catch (err) {
    console.warn("updateMyEmbersVisibility failed", err);
    el.style.display = "none";
  }
}
