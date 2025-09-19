// balances.js — token-aware, same-origin calls
import { ENDPOINTS } from "./config.js";
import { typeStatusMessage } from "./ui.js";

const toNum = (v) => (v == null || v === "" ? 0 : Number(v));

async function authHeadersRequired() {
  if (window.authReady) await window.authReady;
  const token = await window.getIdToken();

  return { "Content-Type":"application/json", "Authorization":`Bearer ${token}` };
}

export async function getPolistarBalance(uid) {
  
  const res = await fetch(ENDPOINTS.getPolistarBalance, {
    method: "POST",
    headers: await authHeadersRequired(),
    body: JSON.stringify({ uid }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch POLISTAR balance (${res.status}) ${text}`);
  }
  const data = await res.json();
  return {
    ...data,
    balance: toNum(data.balance),
    withdrawable: toNum(data.withdrawable),
    pending: toNum(data.pending),
  };
}

export async function getPoliBalance(address) {
  const res = await fetch(ENDPOINTS.getPoliBalance, {
    method: "POST",
    headers: await authHeadersRequired(),
    body: JSON.stringify({ address }),
    cache: "no-store",
  });
  
  if (!res.ok) throw new Error("Failed to fetch POLI balance");
  const data = await res.json();
  return toNum(data.amount);
}

export async function getUsdtBalance(address) {
  const res = await fetch(ENDPOINTS.getUsdtBalance, {
    method: "POST",
    headers: await authHeadersRequired(),
    body: JSON.stringify({ address }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch USDT balance");
  const data = await res.json();
  return toNum(data.amount);
}

export function updateBalanceDisplay(balance, withdrawable) {
  const a = document.getElementById("balPolistar");
  if (a) a.textContent = Number(balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

  const c = document.getElementById("poliAmount"); // NOTE: this currently mirrors Polistar; rename if meant for POLI
  if (c) c.textContent = Number(balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

  const w = document.getElementById("withdrawableBalance");
  if (w) w.textContent = Number(withdrawable || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export async function displayOnchainBalance() {
  const addr = window.currentWalletAddress;
  if (!addr) return;
  try {
    const [poli, usdt] = await Promise.all([
      getPoliBalance(addr),
      getUsdtBalance(addr).catch(() => 0),
    ]);
    const elPoli = document.getElementById("balPoli");
    if (elPoli) elPoli.textContent = Number(poli).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const elUsdt = document.getElementById("balUsdt");
    if (elUsdt) elUsdt.textContent = Number(usdt).toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch (e) {
    console.error(e);
    typeStatusMessage("⚠️ Could not load on-chain balances right now.");
  }
}

export async function displayPolistarBalance(firstTime = false) {
  if (window.authReady) await window.authReady; // ensure token exists
  const addr = window.currentWalletAddress;
  if (!addr) return;
  try {
    const ps = await getPolistarBalance(addr); // your convention: uid == wallet
    const bal = Number(ps.balance || 0);
    updateBalanceDisplay(bal, ps.withdrawable);
    if (firstTime) {
      if (bal === 0) {
        typeStatusMessage("✨ Poly is preparing your gift…");
        if (typeof window.startPolistarTimers === "function") window.startPolistarTimers();
      } else {
        typeStatusMessage("✨ Your balance has been restored.");
      }
    }
    return ps;
  } catch (e) {
    console.error(e);
    typeStatusMessage("⚠️ Could not load POLISTAR balance right now.");
  }
}

export async function mintPolistarReward(uid, address, amount) {
  if (!uid || !address || !amount) return false;
  try {
    await fetch(ENDPOINTS.rewardPolistar, {
      method: "POST",
      headers: await authHeadersRequired(),
      body: JSON.stringify({ uid, address, amount }),
      cache: "no-store",
    });
    const el = document.getElementById("balPolistar");
    if (el) el.textContent = parseInt(el.textContent || "0", 10) + amount;
    return true;
  } catch (e) {
    console.error("Minting failed:", e);
    return false;
  }
}

export async function burnPolistarToken(userId, amount = 1, reason = "Ember session") {
  if (!userId) throw new Error("Missing userId for burn");
  const res = await fetch(ENDPOINTS.burnToken, {
    method: "POST",
    headers: await authHeadersRequired(),
    body: JSON.stringify({ userId, tokenId: "POLISTAR", amount, reason }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Burn failed");
  return res.json().catch(() => ({}));
}
