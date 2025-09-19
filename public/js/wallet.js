import { ENDPOINTS } from "./config.js";

export function generateEphemeralWallet() {
  const wallet = ethers.Wallet.createRandom();
  const user = {
    address: wallet.address.toLowerCase(),
    privateKey: wallet.privateKey,
    generated: true,
  };
  localStorage.setItem("polyUser", JSON.stringify(user));
  window.polyUser = user;
  window.currentWalletAddress = user.address;
}

export async function mergeSessions(internal, metamask) {
  localStorage.setItem("primaryAddress", metamask.toLowerCase());
  await fetch(ENDPOINTS.mergeUserSessions, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ internal, metamask }),
  });
}

export function loadExistingUser() {
  const stored = localStorage.getItem("polyUser");
  if (stored) {
    const user = JSON.parse(stored);
    window.polyUser = user;
    window.currentWalletAddress = user.address;
    console.log("Loaded existing user:", window.currentWalletAddress);
    return user;
  }
  generateEphemeralWallet();
}

export function showUserAddress() {
  const stored = localStorage.getItem("polyUser");
  const primary = localStorage.getItem("primaryAddress");
  const address = primary || (stored && JSON.parse(stored).address);

  const el = document.getElementById("balAddr");
  if (!el) return;

  if (address && address.length >= 10) {
    const shortened = address.slice(0, 6) + "..." + address.slice(-4); // ASCII dots
    el.textContent = "🧾 " + shortened;
    el.dataset.full = address; // click-to-copy uses this
  } else {
    el.textContent = "🧾 0x…";
    el.dataset.full = "";
  }
}

export function clearUserAddress() {
  localStorage.removeItem("polyUser");
  localStorage.removeItem("primaryAddress");
  window.polyUser = null;

  const el = document.getElementById("balAddr");
  if (el) {
    el.textContent = "🧾 0x…";
    el.dataset.full = "";
  }
}
