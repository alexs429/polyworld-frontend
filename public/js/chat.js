// chat.js
import {
  els,
  addMsg,
  addSystemMessage,
  setSheet,
  typeStatusMessage,
  flipToBack,
  startStatusBlinking,
  stopStatusBlinking,
} from "./ui.js";
import {
  displayOnchainBalance,
  displayPolistarBalance,
  getPolistarBalance,
  mintPolistarReward,
  burnPolistarToken,
} from "./balances.js";
import {
  showUserAddress,
  clearUserAddress,
  loadExistingUser,
  mergeSessions,
} from "./wallet.js";
import { ENDPOINTS, DEV } from "./config.js";
import {
  setEmberVoice,
  stopEmberNow,
  speakWithPolistar,
  speakWithEmber,
} from "./speech.js";
import {
  showEmberPanel,
  showMyEmberPanel,
  onEmberSelected,
  setActiveEmberUI,
  getActiveEmber,
  restorePolistarUI,
  replaceWithTrainingCircle,
  showAvatarCaptureStep,
} from "./embers.js";
import { loadEmbers, loadMyEmbers } from "./render-embers.js";

let hasOfferedEmber = false;
let currentSpeaker = "polistar";
let currentEmber = null;
let emberBurnInterval = null;
let firstResponseSent = false;
let _burnHooksBound = false;
// Conversational action state
let action = { mode: null, step: 0, payload: {}, prevPlaceholder: "" };
let emberTraining = {
  active: false,
  step: 0,
  data: {},
};
window.emberTraining = emberTraining;
// Map steps → friendly labels
const stepLabels = {
  1: "Name",
  2: "Focus",
  3: "Avatar",
  4: "Voice",
  5: "Identity",
  6: "Wallet",
  7: "Persona",
  8: "Long Description",
  9: "Mint NFT",
  10: "Finalize Ember",
};

export async function startEmberTraining() {
  emberTraining = { active: true, step: 1, data: {} };

  try {
    const res = await fetch(
      `${ENDPOINTS.getFlameById}?id=${encodeURIComponent(
        window.currentWalletAddress
      )}`
    );

    if (res.ok) {
      const flame = await res.json();
      emberTraining.data.flame = flame; // 🔥 cache Flame identity

      if (flame?.firstName && flame?.lastName) {
        // ✅ Flame identity already exists
        emberTraining.data.firstName = flame.firstName;
        emberTraining.data.lastName = flame.lastName;

        emberTraining.step = 2;
        speakWithPolistar("Please enter your Ember's focus");
        typeStatusMessage("✨ Raising your Ember — Focus");
        addMsg(
          "assistant",
          "Great. Now type your Ember’s Focus (e.g. Travel, Finance, Personal)."
        );
        setPromptHint("Focus (e.g. Travel, Finance, Personal)");
        return;
      }
    }
  } catch (e) {
    console.error("startEmberTraining flame check failed:", e);
    // fallback to asking for name
  }

  // 🔹 If Flame not found or missing names → ask for them
  typeStatusMessage("✨ Raising your Ember — Your name");
  addMsg("assistant", "Please enter your First + Last Name");
  setPromptHint("First + Last Name");
}

async function persistEmberProgress(emberId, step, partial = {}) {
  if (!emberId) return;
  try {
    await fetch(ENDPOINTS.updateEmber, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emberId,
        ...partial,
        trainingProgress: { step }, // ← canonical progress marker
        status: "training",
      }),
    });
  } catch (e) {
    console.warn("persistEmberProgress failed", e);
  }
}

function setPromptHint(txt) {
  const ta = els.prompt();
  if (!ta) return;
  if (!action.prevPlaceholder) action.prevPlaceholder = ta.placeholder || "";
  ta.placeholder = txt || action.prevPlaceholder;
}

function resetPromptHint() {
  const ta = els.prompt();
  if (!ta) return;
  ta.placeholder = action.prevPlaceholder || "Type your message…";
  action.prevPlaceholder = "";
}

function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || "";
  const lastName = parts.length > 0 ? parts.join(" ") : "";
  return { firstName, lastName };
}

// robust numeric parsing (grabs first decimal number from text)
function parseAmount(s) {
  const m = String(s)
    .replace(",", ".")
    .match(/[-+]?\d*\.?\d+/);
  return m ? parseFloat(m[0]) : NaN;
}

async function fetchPolistarRate() {
  // Prefer explicit dev override
  if (Number.isFinite(DEV?.POLISTAR_PER_POLI)) return DEV.POLISTAR_PER_POLI;

  if (!ENDPOINTS.getPolistarRate) return 1.0; // safe default 1:1
  try {
    const res = await fetch(ENDPOINTS.getPolistarRate, { method: "GET" });
    const data = await res.json();
    const n = Number(data?.polistarPerPoli);
    if (isFinite(n) && n > 0) return n;
    throw new Error("bad rate");
  } catch {
    return 1.0;
  }
}
async function fetchPoliRate() {
  // Prefer explicit dev override
  if (Number.isFinite(DEV?.POLI_PER_USDT)) return DEV.POLI_PER_USDT;

  // No endpoint? avoid fetch/console noise
  if (!ENDPOINTS.getPoliRate) return 10.0;

  try {
    const res = await fetch(ENDPOINTS.getPoliRate, { method: "GET" });
    const data = await res.json();
    const n = Number(data?.poliPerUsdt);
    if (isFinite(n) && n > 0) return n;
    throw new Error("bad rate");
  } catch {
    return 10.0; // safe default
  }
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json().catch(() => ({}));
}

async function startTransferPolistarFlow() {
  if (!window.currentTravellerId && !window.currentWalletAddress) {
    typeStatusMessage("Please connect MetaMask first.");
    return;
  }
  action = {
    mode: "transferpolistar",
    step: 1,
    payload: {},
    prevPlaceholder: "",
  };

  addMsg("assistant", "Who would you like to send POLISTAR to?");
  typeStatusMessage("Enter the recipient ID (wallet address or user ID).");
  setPromptHint("Recipient (0x… or user ID)");
}

async function confirmTransferRecipient(recipientRaw) {
  const recipient = String(recipientRaw).trim();
  if (!recipient) {
    typeStatusMessage("Please enter a valid recipient or type CANCEL.");
    setPromptHint("Recipient (0x… or user ID)");
    return;
  }
  action.payload.recipient = recipient;
  action.step = 2;

  addMsg("assistant", `Recipient set to ${prettyRecipient(recipient)}.`);

  typeStatusMessage("How many POLISTAR do you want to transfer?");
  setPromptHint("Amount (e.g., 5)");
}

async function confirmTransferAmount(amountRaw) {
  const amt = parseAmount(amountRaw);
  if (!isFinite(amt) || amt <= 0) {
    typeStatusMessage("Please enter a valid amount (e.g., 5) or type CANCEL.");
    setPromptHint("Amount (e.g., 5)");
    return;
  }
  action.payload.amount = amt;
  action.step = 3;

  const to = prettyRecipient(action.payload.recipient);
  addMsg(
    "assistant",
    `You are about to transfer ${amt} POLISTAR to ${to}.\n` +
      `Type YES to continue, or CANCEL to abort.`
  );
  typeStatusMessage("Type YES to continue, or CANCEL to abort.");
  setPromptHint("Type YES to continue");
}

async function executeTransferPolistar() {
  const fromUserId = window.currentTravellerId || window.currentWalletAddress;
  const toUserId = action.payload.recipient;
  const amount = action.payload.amount;
  const simulate =
    DEV?.SIMULATE_TRANSFER_POLISTAR || !ENDPOINTS.transferPolistar;

  try {
    typeStatusMessage("Submitting transfer…");

    if (!simulate) {
      const res = await fetch(ENDPOINTS.transferPolistar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId, toUserId, amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Transfer failed");
    } else {
      await new Promise((r) => setTimeout(r, 800)); // demo delay
    }

    addMsg(
      "assistant",
      `✅ Sent ${amount} POLISTAR to ${prettyRecipient(toUserId)}${
        simulate ? " (simulated)" : ""
      }.`
    );
    typeStatusMessage("Transfer complete!");
    await displayPolistarBalance(); // refresh POLISTAR panel
    endAction();
  } catch (err) {
    console.error("transferPolistar failed:", err);
    typeStatusMessage("Transfer failed. Please try again.");
    addMsg(
      "assistant",
      `❌ Transfer failed: ${err.message || "Unknown error"}`
    );
  }
}

async function startSwapPolistarFlow() {
  if (!window.currentWalletAddress) {
    typeStatusMessage("Please connect MetaMask first.");
    return;
  }

  action = { mode: "swappolistar", step: 1, payload: {}, prevPlaceholder: "" };

  const rate = await fetchPolistarRate();
  action.payload.rate = rate;

  addMsg(
    "assistant",
    `Current rate is ${rate} POLISTAR per 1 POLI.\n` +
      `For example, 10 POLI → ${(10 * rate).toFixed(2)} POLISTAR.`
  );
  typeStatusMessage("Please enter POLI amount to swap to POLISTAR.");
  setPromptHint("Enter POLI amount (e.g., 10)");
}

async function confirmSwapPolistar(poliAmount) {
  const rate = action.payload.rate || (await fetchPolistarRate());
  const polistar = poliAmount * rate;

  action.step = 2;
  action.payload.poli = poliAmount;
  action.payload.polistar = polistar;

  addMsg(
    "assistant",
    `You are about to swap ${poliAmount} POLI for ${polistar.toFixed(
      2
    )} POLISTAR.\n` + `Please type YES to continue, or CANCEL to abort.`
  );
  typeStatusMessage("Type YES to continue, or CANCEL to abort.");
  setPromptHint("Type YES to continue");
}
async function executeSwapPolistar() {
  // inputs computed during confirm step
  const poli = action.payload.poli; // amount user typed (POLI)
  const polistar = action.payload.polistar; // previewed POLISTAR to receive
  const userId = window.currentTravellerId || window.currentWalletAddress;

  try {
    typeStatusMessage("⏳ Preparing swap…");
    addMsg("assistant", "Bridging POLI → POLISTAR…");

    // Call your existing CF
    const res = await fetch(ENDPOINTS.bridgeToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        tokenId: "POLISTAR", // target asset in your previous code
        amount: parseAmount(poli.toString()), // amount in POLI (matches your old pattern)
        toAsset: "POLI",
        bridgeDirection: "fromEVM",
      }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = result?.error || "Bridge failed";
      throw new Error(msg);
    }

    // (your old snippet delayed here)
    await new Promise((r) => setTimeout(r, 3000));

    addMsg(
      "assistant",
      `✅ Swapped ${poli} POLI → ${polistar.toFixed(2)} POLISTAR.`
    );
    typeStatusMessage("✅ Swap complete!");

    await displayOnchainBalance();
    await displayPolistarBalance();

    endAction();
  } catch (err) {
    console.error("swapPolistar failed:", err);
    if (err?.code === 4001) {
      typeStatusMessage("Operation cancelled.");
      addMsg(
        "assistant",
        "❌ You cancelled the operation. Type CANCEL to abort or try again."
      );
      return;
    }
    typeStatusMessage("Swap failed. Please try again.");
    addMsg("assistant", `❌ Swap failed: ${err.message || "Unknown error"}`);
  }
}

async function startBuyPoliFlow() {
  // preconditions
  if (!window.currentWalletAddress) {
    typeStatusMessage("Please connect MetaMask first.");
    return;
  }

  action = { mode: "buypoli", step: 1, payload: {}, prevPlaceholder: "" };

  // get rate & prime UX
  const rate = await fetchPoliRate();
  action.payload.rate = rate;

  addMsg(
    "assistant",
    `Current exchange rate is ${rate} POLI per 1 USDT.\n` +
      `For example, 10 USDT → ${(10 * rate).toFixed(2)} POLI.`
  );
  typeStatusMessage("Please enter USDT amount to purchase POLI.");
  setPromptHint("Enter USDT amount (e.g., 10)");
}

async function confirmBuyPoli(usdt) {
  const rate = action.payload.rate || (await fetchPoliRate());
  const poli = usdt * rate;

  action.step = 2;
  action.payload.usdt = usdt;
  action.payload.poli = poli;

  addMsg(
    "assistant",
    `You are about to purchase ${poli.toFixed(2)} POLI using ${usdt} USDT.\n` +
      `Your MetaMask signature is required; a network fee may apply.\n` +
      `Please type YES to continue, or CANCEL to abort.`
  );
  typeStatusMessage("Type YES to continue, or CANCEL to abort.");
  setPromptHint("Type YES to continue");
}

function isHexAddr(s) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(s).trim());
}
function prettyRecipient(id) {
  if (isHexAddr(id)) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return id;
}
// Get signer/provider from MetaMask, ensure account is available
// --- MetaMask + ethers helper (add to chat.js) ---
function getSignerAndProvider() {
  // ethers is loaded from the CDN (UMD). Use the global safely.
  const E =
    typeof window !== "undefined" && window.ethers ? window.ethers : null;
  if (!window.ethereum) throw new Error("MetaMask not available");
  if (!E) throw new Error("ethers library not loaded");

  const provider = new E.providers.Web3Provider(window.ethereum, "any");
  // ensure account access (no-op if already granted)
  return provider.send("eth_requestAccounts", []).then(() => {
    const signer = provider.getSigner();
    return signer.getAddress().then((addr) => ({
      provider,
      signer,
      from: String(addr).toLowerCase(),
    }));
  });
}

async function executeBuyPoli() {
  const usdt = action.payload.usdt; // number from earlier step
  const poli = action.payload.poli;
  const uiAddr = window.currentWalletAddress || "";
  const usdtAmount = Math.floor(usdt * 1e6);

  if (!ENDPOINTS.buildApproveUsdtTx) {
    typeStatusMessage("Cannot proceed: approve endpoint not configured.");
    addMsg(
      "assistant",
      "❕ USDT approval step is missing (buildApproveUsdtTx). Please set it in config."
    );
    return;
  }

  try {
    typeStatusMessage("Preparing transaction…");
    addMsg("assistant", "Submitting transaction for signature…");

    // 1) get signer/provider from MetaMask
    const { provider, signer, from } = await getSignerAndProvider();
    const travellerAddress = uiAddr || from;
    console.log("Current User Address:", travellerAddress);
    // 2) APPROVE USDT (if backend decides it's needed)
    try {
      const approvePayload = {
        travellerAddress,
        amount: usdtAmount.toString(), // backend expects string
      };

      const approveRes = await fetch(ENDPOINTS.buildApproveUsdtTx, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approvePayload),
      });

      // If backend returns 204/skip or empty, just continue
      if (approveRes.ok && approveRes.status !== 204) {
        const approveTx = await approveRes.json(); // raw tx fields
        if (approveTx && approveTx.to) {
          typeStatusMessage("Approving USDT spend…");

          const sent = await signer.sendTransaction(approveTx);
          await provider.waitForTransaction(sent.hash, 1, 60_000);
          addMsg("assistant", "✅ USDT approved.");
        }
      }
    } catch (e) {
      // many backends skip approve when allowance is enough—treat non-2xx as “skip”
      console.debug("Approve step skipped or failed softly:", e);
    }

    // 3) BUILD + SEND buyPoliFromUsdt tx
    const buyRes = await fetch(ENDPOINTS.buyPoli, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        travellerAddress,
        usdtAmount: usdtAmount.toString(),
      }),
    });
    if (!buyRes.ok) throw new Error("Failed to prepare POLI purchase");
    const buyTx = await buyRes.json();

    typeStatusMessage("💸 Swapping USDT for POLI…");
    const tx = await signer.sendTransaction(buyTx);
    await provider.waitForTransaction(tx.hash, 1, 60_000);

    // 4) Success UI + refresh
    addMsg(
      "assistant",
      `✅ Purchased ${poli.toFixed(2)} POLI with ${usdt} USDT.`
    );
    typeStatusMessage("✅ POLI successfully received!");
    await displayOnchainBalance();

    endAction();
  } catch (err) {
    // common MetaMask reject code
    if (err?.code === 4001) {
      typeStatusMessage("Transaction rejected in MetaMask.");
      addMsg(
        "assistant",
        "❌ You rejected the transaction. Type CANCEL to abort or try again."
      );
      return; // keep action active on step 2
    }
    console.error("buyPoli failed:", err);
    typeStatusMessage("Purchase failed. Please try again.");
    addMsg("assistant", "❌ Purchase failed. You can type CANCEL to abort.");
    // keep action active so they can retry “YES” if you prefer, or call endAction()
  }
}

function endAction() {
  action = { mode: null, step: 0, payload: {}, prevPlaceholder: "" };
  resetPromptHint();
}

export function setupPrompt() {
  const btnSend = document.getElementById("btnSend");
  const prompt = els.prompt(); // textarea

  if (!_burnHooksBound) {
    _burnHooksBound = true;
    // Stop burning when leaving / re-open if you come back and an Ember is active
    window.addEventListener("beforeunload", stopEmberBurnLoop);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopEmberBurnLoop();
      } else if (currentSpeaker !== "polistar") {
        startEmberBurnLoop();
      }
    });
  }
  onEmberSelected((id, raw) => {
    console.log("[select] ember chosen:", id, raw?.voice);

    //setActiveEmberUI(id, raw);

    // 1) set voice BEFORE speaking
    setEmberVoice(raw?.voice);

    // 2) build greeting (or use raw.greeting)
    const name = raw?.name || id;
    const tagline = raw?.persona?.tagline || "";
    const greeting =
      raw?.greeting && raw.greeting.trim()
        ? raw.greeting.trim()
        : `Hi, I’m ${name}.${tagline ? " " + tagline : ""}`;

    // 3) now speak
    speakWithEmber(greeting);
  });

  // ---- Helpers --------------------------------------------------------------

  function showSwapPanel() {
    setSheet(true);
  }

  async function initiateMetaMaskLogin() {
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      alert(
        "MetaMask not detected. Please install it from https://metamask.io."
      );
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (!accounts || accounts.length === 0)
        throw new Error("No MetaMask accounts found.");

      const address = accounts[0];
      const message = `Sign in to Polyworld as ${address}`;
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      startStatusBlinking("Initiating Metamask connection...");

      await axios.post(ENDPOINTS.authenticateMetamask, {
        address,
        message,
        signature,
      });

      if (
        address !== window.currentWalletAddress ||
        window.polyUser?.generated
      ) {
        const user = { address, privateKey: "", generated: false };
        localStorage.setItem("polyUser", JSON.stringify(user));
        window.polyUser = user;
        await mergeSessions(address, address);
      }

      window.currentWalletAddress = address;
      window.currentTravellerId = address;

      stopStatusBlinking("Metamask is authenticated!");
      showUserAddress();
      await displayPolistarBalance(true);
      await displayOnchainBalance();
    } catch (err) {
      console.error("❌ MetaMask login failed:", err);
      alert("MetaMask connection failed. Please try again.");
    }
  }

  function startEmberBurnLoop() {
    if (emberBurnInterval) return; // already running
    emberBurnInterval = setInterval(async () => {
      if (currentSpeaker === "polistar") return; // only burn while in Ember
      const userId = window.currentTravellerId || window.currentWalletAddress;
      if (!userId) {
        console.warn("🛑 No Traveller ID. Skipping burn.");
        return;
      }

      try {
        console.log("🔥 Burning 1 POLISTAR for Ember session…");
        await burnPolistarToken(
          userId,
          1,
          `Auto-burn during ${currentSpeaker} session`
        );
        speakWithEmber(
          "1 POLISTAR has been spent to continue our conversation."
        );
        // refresh balances in the UI
        await displayPolistarBalance(false);
        await displayOnchainBalance();
      } catch (err) {
        console.error("❌ Burn error:", err);
        // (optional) surface a soft status message:
        // typeStatusMessage("Couldn’t burn POLISTAR. Check connection and try again.");
      }
    }, 30_000);
  }

  function stopEmberBurnLoop() {
    if (!emberBurnInterval) return;
    clearInterval(emberBurnInterval);
    emberBurnInterval = null;
    console.log("🛑 Ember session ended. Burn loop stopped.");
  }

  function speakWithCurrent(text) {
    if (currentSpeaker === "polistar") speakWithPolistar(text);
    else speakWithEmber(text);
  }

  async function chatHandlerCall(message) {
    const travellerAddress = window.currentWalletAddress;
    const sessionId = travellerAddress || `guest-${crypto.randomUUID()}`;

    // 🔹 If an Ember is active, send its raw data (with persona).
    // Otherwise send null so backend can treat it as Polistar.
    const emberObj = getActiveEmber();
    const activeEmber = emberObj?._raw || emberObj || null;
    const payload = {
      message,
      sessionId,
      userAddress: travellerAddress,
      ember: activeEmber, // 🔹 explicit null if no Ember
    };
    console.log("Chat Handler:", payload);
    const res = await fetch(ENDPOINTS.chatHandler, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    return (data && data.reply) || "Hmm… I didn’t quite catch that.";
  }

  // Central command handler used by text, tiles, and toolbar tray
  function runLocalCommand(cmd) {
    const chatArea = els.chatArea();
    const box = document.getElementById("cameraBox");
    switch (cmd) {
      case "hidecamera":
        if (box) {
          box.style.visibility = "hidden";
          box.style.opacity = 0;
          speakWithPolistar("Camera is now hidden.");
        }
        return true;

      case "showcamera":
        if (box) {
          box.style.visibility = "visible";
          box.style.opacity = 1;
          speakWithPolistar("Camera is now visible.");
        }
        return true;
      case "mobilelogin":
        displayDeviceLogin();
      case "clearaddress":
        clearUserAddress();
        displayOnchainBalance();
        displayPolistarBalance();
        return true;

      case "hidechat":
        chatArea.classList.add("invisible");
        return true;
      case "showchat":
        chatArea.classList.remove("invisible");
        return true;
      case "buypoli":
        startBuyPoliFlow();
        return true;
      case "swappolistar":
        startSwapPolistarFlow();
        return true;
      case "transferpolistar":
        startTransferPolistarFlow();
        return true;
      case "showembers":
        showEmberPanel();
        speakWithPolistar("Here are the Embers available to guide you.");
        return true;

      case "connectmetamask":
      case "metamask":
        initiateMetaMaskLogin();
        return true;
      case "showmyembers":
        const uid = (
          window.POLY_UID || window.currentWalletAddress
        ).toLowerCase();
        showMyEmberPanel(uid);
      case "polistarback":
      case "stop":
        currentSpeaker = "polistar";
        currentEmber = null;
        stopEmberBurnLoop();
        restorePolistarUI(); // ← removes the mini
        speakWithPolistar("Polistar has returned. I’ll guide you again.");
        return true;
      case "pause":
        stopEmberBurnLoop();
        speakWithEmber("We paused our conversation.");
        return true;

      default:
        return false;
    }
  }

  async function displayDeviceLogin() {
    const userId = window.currentWalletAddress;
    const res = await fetch("/api/device/createLoginToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const { deviceUrl } = await res.json();
    addMsg(
      "qr",
      deviceUrl.replace(
        "https://app.polyworld.life",
        "https://polyworld-2f581.web.app"
      )
    );
  }

  async function process(text) {
    const t = (text || "").trim();
    if (!t) return;

    // === conversational actions take precedence ===
    if (action.mode) {
      // global cancel
      if (t.toLowerCase() === "cancel") {
        typeStatusMessage("Cancelled.");
        endAction();
        return;
      }

      // handle Buy POLI flow
      if (action.mode === "buypoli") {
        if (action.step === 1) {
          const usdt = parseAmount(t);
          if (!isFinite(usdt) || usdt <= 0) {
            typeStatusMessage(
              "Please enter a valid USDT amount (e.g., 10) or type CANCEL."
            );
            setPromptHint("Enter USDT amount (e.g., 10)");
            return;
          }
          await confirmBuyPoli(usdt);
          return;
        }
        if (action.step === 2) {
          const a = t.toLowerCase();
          if (a === "yes" || a === "y") {
            await executeBuyPoli();
          } else {
            typeStatusMessage("Cancelled.");
            endAction();
          }
          return;
        }
      } else if (action.mode === "swappolistar") {
        if (action.step === 1) {
          const poliAmount = parseAmount(t);
          if (!isFinite(poliAmount) || poliAmount <= 0) {
            typeStatusMessage(
              "Please enter a valid POLI amount (e.g., 10) or type CANCEL."
            );
            setPromptHint("Enter POLI amount (e.g., 10)");
            return;
          }
          await confirmSwapPolistar(poliAmount);
          return;
        }
        if (action.step === 2) {
          const a = t.toLowerCase();
          if (a === "yes" || a === "y") {
            await executeSwapPolistar();
          } else {
            typeStatusMessage("Cancelled.");
            endAction();
          }
          return;
        }
      } else if (action.mode === "transferpolistar") {
        // echo user input
        addMsg("user", t);

        if (t.toLowerCase() === "cancel") {
          typeStatusMessage("Cancelled.");
          endAction();
          return;
        }

        if (action.step === 1) {
          await confirmTransferRecipient(t);
          return;
        }
        if (action.step === 2) {
          await confirmTransferAmount(t);
          return;
        }
        if (action.step === 3) {
          const a = t.toLowerCase();
          if (a === "yes" || a === "y") {
            await executeTransferPolistar();
          } else {
            typeStatusMessage("Cancelled.");
            endAction();
          }
          return;
        }
      }

      // (future actions go here)

      return;
    }

    if (emberTraining.active) {
      // echo back Traveller input
      addMsg("user", t);

      if (t.toLowerCase() === "cancel") {
        typeStatusMessage("Cancelled Ember training.");
        emberTraining = { active: false, step: 0, data: {} };
        resetPromptHint();
        return;
      }

      if (emberTraining.step === 1) {
        try {
          const res = await fetch(
            `${ENDPOINTS.getFlameById}?id=${encodeURIComponent(
              window.currentWalletAddress
            )}`
          );
          if (res.ok) {
            const flame = await res.json();
            if (flame?.firstName && flame?.lastName) {
              // ✅ Flame already exists → skip asking name
              emberTraining.data.firstName = flame.firstName;
              emberTraining.data.lastName = flame.lastName;

              emberTraining.step = 2;
              typeStatusMessage("✨ Raising your Ember — Focus");
              addMsg(
                "assistant",
                "Great. Now type your Ember’s Focus (e.g. Travel, Finance, Personal)."
              );
              setPromptHint("Focus (e.g. Travel, Finance, Personal)");
              return;
            }
          }
        } catch (e) {
          console.error("Flame lookup failed:", e);
          // fallback → continue asking name
        }

        // If Flame not found or missing name → ask user for name
        emberTraining.data.name = t;
        emberTraining.step = 2;
        typeStatusMessage("✨ Raising your Ember — Focus");
        addMsg(
          "assistant",
          "Please type your Ember’s Focus (e.g. Travel, Finance, Personal)."
        );
        setPromptHint("Focus (e.g. Travel, Finance, Personal)");
        return;
      }

      if (emberTraining.step === 2) {
        emberTraining.data.focus = t;
        emberTraining.step = "avatar";
        startStatusBlinking(
          "🔥 Forging your Ember’s soul! creating conversational agent…"
        );

        let firstName = "";
        let lastName = "";

        // Case 1: Flame already loaded in memory
        if (emberTraining.data.firstName && emberTraining.data.lastName) {
          firstName = emberTraining.data.firstName;
          lastName = emberTraining.data.lastName;
        }
        // Case 2: Traveller just entered "First Last" in step 1
        else if (emberTraining.data.name) {
          const { firstName: f, lastName: l } = splitFullName(
            emberTraining.data.name
          );
          firstName = f;
          lastName = l;
        }

        console.log("createEmberAgent", {
          firstName,
          lastName,
          focus: emberTraining.data.focus,
          createdBy: window.currentWalletAddress,
        });
        try {
          const res = await fetch(ENDPOINTS.createEmberAgent, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName,
              lastName,
              focus: emberTraining.data.focus,
              createdBy: window.currentWalletAddress,
            }),
          });
          const data = await res.json().catch(() => ({}));

          // Backend returns { ok, id, agentId, ... }
          if (!res.ok || !data?.id) {
            stopStatusBlinking();
            addMsg(
              "assistant",
              "❌ Couldn’t create the agent. Please try again."
            );
            typeStatusMessage("Agent creation failed");
            emberTraining.step = 2; // keep them on the same step
            return;
          }

          // 🔹 store the new id (backend returns id and/or emberId)
          emberTraining.data.id = data.id || data.emberId;

          // 🔹 move to Avatar (step 3) locally too
          emberTraining.step = 3;

          stopStatusBlinking();
          typeStatusMessage("📷 Next: capture your Ember’s avatar");
          addMsg(
            "assistant",
            "Now let’s capture your Ember’s avatar. Please look at your camera (right panel) and click the ➕ in the circle on the left."
          );

          // Mount the capture circle and bind the click handler
          replaceWithTrainingCircle();
          showAvatarCaptureStep(emberTraining.data.id);

          resetPromptHint();
        } catch (e) {
          console.error("createEmberAgent failed:", e);
          stopStatusBlinking();
          addMsg(
            "assistant",
            "❌ Couldn’t create the agent. Please try again."
          );
          typeStatusMessage("Agent creation failed");
          emberTraining.step = 2;
        }
        return;
      }

      if (emberTraining.step === 4 || emberTraining.step === "voice") {
        const choice = String(t).trim().toLowerCase();

        if (choice !== "male" && choice !== "female") {
          addMsg("assistant", "❌ Please type MALE or FEMALE.");
          typeStatusMessage("Type MALE or FEMALE");
          setPromptHint("Type MALE or FEMALE");
          return;
        }

        // Persist voice on backend
        try {
          const voice = choice.toUpperCase(); // "MALE" | "FEMALE"
          await fetch(ENDPOINTS.updateEmberVoice, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              emberId: emberTraining.data.id,
              voice,
            }),
          });

          addMsg("assistant", `✅ Voice set to ${voice}.`);
          typeStatusMessage("Voice saved");

          // 🔥 Check if Flame identity already exists
          if (emberTraining.data.flame?.identityComplete) {
            // Skip identity step → go straight to Wallet
            emberTraining.step = 6;
            addMsg(
              "assistant",
              "✅ Your Flame identity is already saved. Do you want to use your current wallet or enter another?"
            );
            setPromptHint("Type CURRENT or enter a new 0x address");
          } else {
            // Otherwise → prompt for identity details
            emberTraining.step = 5;
            addMsg(
              "assistant",
              "Now let’s complete your Ember’s identity details. Please enter: DOB, Email, Mobile"
            );
            setPromptHint("1995-10-20, sam@gmail.com, +61 400 000 000");
          }
        } catch (e) {
          console.error("updateEmberVoice failed:", e);
          addMsg("assistant", "❌ Couldn’t save voice. Please try again.");
          typeStatusMessage("Save failed — try again");
        }
        return;
      }

      // === Ember Training Flow ===
      if (emberTraining.step === 3 || emberTraining.step === "avatar") {
        const choice = t.toLowerCase();
        console.log(choice);
        if (choice === "retake") {
          addMsg(
            "♻️ Retaking avatar. Please click the ➕ in the circle on the left again."
          );
          emberTraining.step = "avatar"; // 🔹 reset step
          replaceWithTrainingCircle(); // 🔹 restore circle
          showAvatarCaptureStep(emberTraining.data.id);
          return;
        }
        if (choice === "save") {
          typeStatusMessage("⏳ Uploading avatar…");
          const { emberId, dataUrl } = window.currentAvatarDraft || {};

          if (emberId && dataUrl) {
            const res = await fetch(ENDPOINTS.uploadAvatar, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emberId, image: dataUrl }),
            });
            if (res.ok) {
              typeStatusMessage("✅ Uploaded successfully");
              addMsg("system", "✅ Avatar saved. Default background applied.");
              // ➜ Advance to Voice step and guide the user
              emberTraining.step = 4;
              addMsg(
                "assistant",
                "Next, choose your Ember’s voice. Please type MALE or FEMALE."
              );
              setPromptHint("Type MALE or FEMALE");
            } else {
              typeStatusMessage("❌ Upload failed. Please try again.");
              addMsg("system", "❌ Upload failed. Please try again.");
              emberTraining.step = "avatar"; // allow retry
              console.log(res);
            }
          }
          return;
        }
      }

      // STEP 5: Identity details (DOB, email, mobile)
      if (emberTraining.step === 5) {
        try {
          // 🔥 Check Flame identity first
          const res = await fetch(
            `${ENDPOINTS.getFlameById}?id=${encodeURIComponent(
              window.currentWalletAddress
            )}`
          );
          if (res.ok) {
            const flame = await res.json();
            if (flame?.dob && flame?.email && flame?.mobile) {
              // ✅ Flame already has identity saved → skip this step
              emberTraining.data.dob = flame.dob;
              emberTraining.data.email = flame.email;
              emberTraining.data.mobile = flame.mobile;

              addMsg("assistant", "✅ Flame identity already exists.");
              typeStatusMessage("Skipping Flame identity step");

              // Advance directly to Step 6 (Wallet)
              emberTraining.step = 6;
              addMsg(
                "assistant",
                "Do you want to use your current wallet or enter another?"
              );
              setPromptHint("Type CURRENT or enter a new 0x address");
              return;
            }
          }
        } catch (e) {
          console.error("Flame identity check failed:", e);
        }

        // === Normal flow if Flame identity missing ===
        const parts = t.split(",");
        if (parts.length < 3) {
          addMsg(
            "assistant",
            "❌ Please provide DOB, Email, Mobile separated by commas."
          );
          typeStatusMessage("Enter DOB, Email, Mobile");
          setPromptHint("1995-10-20, sam@gmail.com, +61 400 000 000");
          return;
        }

        const [dob, email, mobile] = parts.map((p) => p.trim());
        emberTraining.data.dob = dob;
        emberTraining.data.email = email;
        emberTraining.data.mobile = mobile;

        //addMsg("assistant", "Saving your Flame identity details");
        startStatusBlinking("Saving your Flame identity details...");
        typeStatusMessage("⏳ Saving Flame identity...");

        const res = await fetch(ENDPOINTS.updateEmberIdentity, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emberId: emberTraining.data.id,
            dob,
            email,
            mobile,
          }),
        });
        stopStatusBlinking();
        if (res.ok) {
          addMsg(
            "assistant",
            "✅ Flame identity saved. Do you want to use your current wallet or enter another?"
          );
          typeStatusMessage("Confirm payout wallet address");
          setPromptHint("Type CURRENT or enter a new 0x address");
          emberTraining.step = 6;
        } else {
          addMsg("assistant", "❌ Failed to save identity. Try again.");
        }

        return;
      }

      // STEP 6: Wallet
      if (emberTraining.step === 6) {
        let payoutAddress = null;

        if (t.toLowerCase() === "current") {
          payoutAddress = window.currentWalletAddress;
        } else {
          payoutAddress = t.trim();
          if (!/^0x[a-fA-F0-9]{40}$/.test(payoutAddress)) {
            addMsg(
              "assistant",
              "❌ Invalid wallet address. Please enter a valid 0x address or type CURRENT."
            );
            return;
          }
        }

        emberTraining.data.wallet = payoutAddress;

        addMsg("assistant", "Saving wallet");
        typeStatusMessage("⏳ Saving wallet...");
        console.log("emberTraining: ", emberTraining.data);
        const res = await fetch(ENDPOINTS.updateEmberWallet, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emberId: emberTraining.data.id,
            payoutAddress,
          }),
        });

        if (res.ok) {
          addMsg(
            "assistant",
            "✅ Wallet saved. Now let’s define your Ember’s persona (tagline, long bio, tone, short description)."
          );
          typeStatusMessage("Enter persona details");
          setPromptHint("Tagline | LongBio | Tone | Description");
          emberTraining.step = 7;
        } else {
          addMsg("assistant", "❌ Failed to save wallet. Try again.");
        }
        return;
      }

      // STEP 7: Persona
      if (emberTraining.step === 7) {
        // Expect input in format: tagline | longBio | tone | description
        const parts = t.split("|");
        if (parts.length < 4) {
          addMsg(
            "assistant",
            "❌ Please provide: Tagline | LongBio | Tone | Description"
          );
          setPromptHint("Tagline | LongBio | Tone | Description");
          return;
        }

        const [tagline, longBio, tone, description] = parts.map((p) =>
          p.trim()
        );
        emberTraining.data.persona = { tagline, longBio, tone, description };

        addMsg("assistant", "Saving persona details");
        typeStatusMessage("⏳ Saving persona...");
        setPromptHint(" ");
        const res = await fetch(ENDPOINTS.updateEmberPersona, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emberId: emberTraining.data.id,
            tagline,
            longBio,
            tone,
            description,
          }),
        });

        if (res.ok) {
          addMsg(
            "assistant",
            "✅ Persona saved. Please upload a .txt file with a detailed description."
          );
          const attachWrapper = document.getElementById("attachWrapper");
          if (attachWrapper) attachWrapper.style.display = "inline-block";

          typeStatusMessage("Upload long description file");
          setPromptHint(" ");
          emberTraining.step = 8;
        } else {
          addMsg("assistant", "❌ Failed to save persona. Try again.");
        }
        return;
      }

      // STEP 8: Long Description file (frontend must trigger handleFileUpload)
      if (emberTraining.step === 8) {
        const attachWrapper = document.getElementById("attachWrapper");
        if (attachWrapper) attachWrapper.style.display = "inline-block";

        // Clear the textarea placeholder (so no "Type your message…")
        //const ta = document.getElementById("prompt");
        //if (ta) ta.placeholder = "";
        typeStatusMessage("Upload long description file");

        addMsg(
          "assistant",
          "📄 Please attach a .txt file with your Ember’s detailed description."
        );
        setPromptHint(" ");
        return;
      }

      // STEP 9: Mint NFT
      if (emberTraining.step === 9) {
        if (t.toLowerCase() !== "mint") {
          addMsg(
            "assistant",
            "✨ Type MINT to confirm creating your Ember NFT (50 POLI required)."
          );
          typeStatusMessage("Type MINT to continue");
          return;
        }

        addMsg("assistant", "Minting NFT… This may take a few moments.");
        startStatusBlinking("⏳ Minting NFT...");
        setPromptHint("Please wait...");
        //typeStatusMessage("⏳ Minting...");

        const res = await fetch(ENDPOINTS.mintEmberNFT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flameId: window.currentWalletAddress, // Flame = trainer wallet
            emberId: emberTraining.data.id,
            wallet: window.currentWalletAddress, // NFT ownership wallet
          }),
        });
        stopStatusBlinking();
        if (res.ok) {
          addMsg(
            "assistant",
            "✅ NFT minted successfully! Your Ember is now complete."
          );
          typeStatusMessage("Training complete!");
          emberTraining.step = 10;
          addMsg(
            "assistant",
            "✅ NFT minted. Final step: type FINALIZE to complete training (100 POLI required)."
          );
          typeStatusMessage("Ready to finalize Ember");
          setPromptHint("Type FINALIZE");
        } else {
          addMsg("assistant", "❌ Minting failed. Please try again.");
        }
        return;
      }
    }
    // STEP 10: Finalize Ember
    if (emberTraining.step === 10) {
      if (t.toLowerCase() !== "finalize") {
        addMsg(
          "assistant",
          "✨ Type FINALIZE to complete training and make your Ember public (100 POLI required)."
        );
        typeStatusMessage("Type FINALIZE to continue");
        return;
      }

      addMsg("assistant", "Finalizing your Ember!");
      typeStatusMessage("⏳ Finalizing…");
      setPromptHint("Please wait...");

      const res = await fetch(ENDPOINTS.finalizeEmberTraining, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flameId: window.currentWalletAddress,
          emberId: emberTraining.data.id,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        addMsg("assistant", "✅ Your Ember is now finalized and public!");
        typeStatusMessage("Training complete 🎉");
        emberTraining.step = "done";
      } else {
        addMsg(
          "assistant",
          `❌ Finalization failed: ${json?.error || "Please try again."}`
        );
        typeStatusMessage("Finalization failed.");
      }
      return;
    }
    // Commands typed directly
    if (runLocalCommand(t.toLowerCase())) {
      // prompt is cleared by caller
      return;
    }

    // Traveller message
    addMsg("user", t);

    // Thinking bubble
    const thinking = document.createElement("div");
    thinking.className =
      "self-center italic text-white/70 px-4 py-2 animate-pulse";
    thinking.textContent =
      currentSpeaker.replace("polistar", "poly") + " is thinking...";
    els.chatArea().appendChild(thinking);
    els.chatArea().scrollTop = els.chatArea().scrollHeight;

    // Simulated delay + backend call
    setTimeout(async () => {
      els.chatArea().removeChild(thinking);
      const reply = await chatHandlerCall(t);
      // Optional: interpret reply as a command
      // if (runLocalCommand(reply.toLowerCase())) return;
      speakWithCurrent(reply);
      addMsg("assistant", reply);
    }, 1500);

    // First-time bootstraps
    if (!firstResponseSent) {
      firstResponseSent = true;
      loadExistingUser();
      flipToBack(true);
      showUserAddress();
      displayPolistarBalance(true);
      displayOnchainBalance();
    }
  }

  async function handleFileUpload(file, emberId) {
    const content = await file.text(); // read as string

    addMsg("assistant", "Uploading file with the long description");
    typeStatusMessage("⏳ Uploading file...");

    const res = await fetch(ENDPOINTS.uploadEmberDescription, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emberId, fileContent: content }),
    });

    if (res.ok) {
      addMsg("assistant", "✅ File uploaded. Next step: Mint your Ember NFT!");
      typeStatusMessage("Ready to mint NFT");
      setPromptHint("confirm MINT");
      emberTraining.step = 9;
    } else {
      addMsg("assistant", "❌ Upload failed. Please retry.");
    }
  }

  function handleSend() {
    process(prompt.value);
    prompt.value = "";

    // shrink textarea back to one line
    if (typeof prompt.__pw_autogrow_reset__ === "function") {
      prompt.__pw_autogrow_reset__();
    } else if (typeof prompt.__pw_autogrow__ === "function") {
      prompt.__pw_autogrow__();
    } else {
      prompt.style.height = "";
    }
  }

  // Send button
  btnSend?.addEventListener("click", handleSend);

  document
    .getElementById("emberFileUpload")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleFileUpload(file, emberTraining.data.id);

        // hide after upload
        document.getElementById("attachWrapper").style.display = "none";
      }
    });

  // Enter sends, Shift+Enter = new line
  prompt?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      if (e.shiftKey) return; // allow newline
      e.preventDefault();
      handleSend();
    }
  });

  // ---- Events from other modules -------------------------------------------
  // Toolbar tray dispatches commands here
  window.addEventListener("pw:run-cmd", (e) => {
    const raw = (e.detail?.cmd || "").toLowerCase();
    const cmd = raw === "buypolistar" ? "swappolistar" : raw; // alias
    runLocalCommand(cmd);
  });

  window.addEventListener("pw:resume-training-step", (e) => {
    const { step, ember, flame } = e.detail;
    emberTraining.active = true;
    emberTraining.data = { id: ember.id, flame };

    // 🔹 Add progress counter
    const progressText = stepLabels[step]
      ? `Step ${step} of 9 — ${stepLabels[step]}`
      : "Training complete";

    switch (step) {
      case 1:
        addMsg("assistant", "Resume training: Please type the your Name:");
        typeStatusMessage(progressText);
        setPromptHint("First + Last name");
        break;

      case 2:
        addMsg("assistant", "Resume training: What is this Ember’s Focus?");
        typeStatusMessage(progressText);
        setPromptHint("e.g. Travel, Finance, Personal");
        break;

      case 3:
        addMsg(
          "assistant",
          "Resume training: Let’s capture your Ember’s Avatar."
        );
        typeStatusMessage(progressText);

        // Make sure the circle exists and the handler is wired with the right id
        replaceWithTrainingCircle();
        showAvatarCaptureStep(emberTraining.data.id || ember.id);
        break;

      case 4:
        addMsg(
          "assistant",
          "Next step: Please type MALE or FEMALE for your Ember’s voice."
        );
        typeStatusMessage(progressText);
        setPromptHint("Type MALE or FEMALE");
        break;

      case 5:
        if (emberTraining.data.flame?.identityComplete) {
          emberTraining.step = 6;
          addMsg("assistant", "✅ Flame identity already exists.");
          typeStatusMessage("Skipping Flame identity step");
          addMsg(
            "assistant",
            "Do you want to use your current wallet or enter another?"
          );
          setPromptHint("Type CURRENT or enter a new 0x address");
          break;
        }

        addMsg(
          "assistant",
          "Now let’s complete your Ember’s identity details. Please enter: DOB, Email, Mobile"
        );
        typeStatusMessage(progressText);
        setPromptHint("1995-10-20, sam@gmail.com, +61 400 000 000");
        break;
      case 6:
        addMsg(
          "assistant",
          "Identity saved. Do you want to use your current wallet or enter another?"
        );
        typeStatusMessage(progressText);
        setPromptHint("Type CURRENT or enter a new 0x address");
        break;

      case 7:
        addMsg(
          "assistant",
          "Now let’s define your Ember’s persona (tagline, long bio, tone)."
        );
        typeStatusMessage(progressText);
        setPromptHint("Tagline | LongBio | Tone | Description");
        break;

      case 8:
        addMsg(
          "assistant",
          "Please upload a .txt file with your Ember’s detailed description."
        );
        typeStatusMessage(progressText);
        document.getElementById("attachWrapper").style.display = "inline-block";
        setPromptHint(" ");
        break;

      case 9:
        addMsg(
          "assistant",
          "Type MINT to create your Ember NFT (50 POLI required)."
        );
        typeStatusMessage(progressText);
        setPromptHint("Type MINT");
        break;

      default:
        addMsg("assistant", "✅ Training already complete!");
        typeStatusMessage("Training complete");
        break;
    }
  });

  window.addEventListener("pw:system-msg", (e) => {
    if (e.detail?.html) {
      addSystemMessage(e.detail.html);
    }
  });

  window.addEventListener("pw:set-prompt-hint", (e) => {
    setPromptHint(e.detail?.text || "");
  });

  window.addEventListener("pw:status", (e) => {
    if (e.detail?.message) {
      typeStatusMessage(e.detail.message);
    }
  });

  window.addEventListener("pw:resume-training", async (e) => {
    const { step, ember, flame } = e.detail;
    emberTraining.active = true;
    emberTraining.data = { id: ember.id, flame };

    try {
      // 🔥 Look up the Flame (identity lives there now)
      const res = await fetch(
        `${ENDPOINTS.getFlameById}?id=${encodeURIComponent(ember.createdBy)}`
      );
      if (res.ok) {
        const flame = await res.json();
        emberTraining.data.flame = flame; // 🔥 cache Flame identity

        if (!flame?.firstName || !flame?.lastName) {
          emberTraining.step = 1;
          typeStatusMessage("✨ Continue training — Name");
          addMsg("Resume training: Please type your Name:");
          setPromptHint("First + Last name");
          return;
        }

        if (!flame?.identityComplete) {
          emberTraining.step = 5;
          typeStatusMessage("✨ Continue training — Identity");
          addMsg("Resume training: Please enter DOB, Email, Mobile:");
          setPromptHint("1995-10-20, sam@gmail.com, +61 400 000 000");
          return;
        }
      }
    } catch (err) {
      console.error("resume-training flame lookup failed:", err);
      // fallback: assume identity missing
      emberTraining.step = 1;
      typeStatusMessage("✨ Continue training — Name");
      addMsg("Resume training: Please type your Name:");
      setPromptHint("First + Last name");
      return;
    }

    // 🔹 If no focus yet
    if (!ember.focus) {
      emberTraining.step = 2;
      typeStatusMessage("✨ Continue training — Focus");
      addMsg("Resume training: What is this Ember’s Focus?");
      setPromptHint("e.g. Travel, Finance, Personal");
      return;
    }

    // 🔹 Default: resume at avatar step
    emberTraining.step = "avatar";
    typeStatusMessage("📷 Next step — capture your Ember’s avatar");
    addMsg(
      "assistant",
      "Now let’s capture your Ember’s Avatar and Background."
    );
    window.dispatchEvent(new CustomEvent("pw:show-avatar-step"));
  });

  // Toolbar/elsewhere can trigger MetaMask connect
  window.addEventListener("pw:connect-metamask", initiateMetaMaskLogin);
  window.addEventListener("pw:run-cmd", (e) => {
    const { cmd } = e.detail || {};
    if (cmd === "showembers") {
      loadEmbers();
    } else if (cmd === "myembers") {
      const uid =
        window.POLY_UID || localStorage.getItem("poly_uid") || "TEST_UID";
      loadMyEmbers(uid);
    }
  });
}

// ---- Timed rewards ----------------------------------------------------------
export function startPolistarTimers() {
  // 10s signup gift
  setTimeout(async () => {
    try {
      const travellerId =
        window.currentTravellerId ||
        window.travellerId ||
        window.currentWalletAddress;
      const address = window.currentWalletAddress || null;
      if (!travellerId || !address) {
        console.warn("[rewards] missing ids for 10s gift", {
          travellerId,
          address,
        });
        return;
      }
      const ok = await mintPolistarReward(travellerId, address, 5);
      if (ok) {
        typeStatusMessage("🎁 +5 POLYPOINTS received!");
        speakWithPolistar("You’ve received 5 polypoints for signing in.");
        const hud = document.getElementById("poliAmount");
        if (hud) hud.textContent = 5;
      }
    } catch (e) {
      console.error("[rewards] 10s gift failed:", e);
    }
  }, 10000);

  // 1-minute gift
  setTimeout(async () => {
    try {
      window.milestoneRewarded ||= { "1min": false, "3min": false };
      if (window.milestoneRewarded["1min"]) return;

      const travellerId =
        window.currentTravellerId ||
        window.travellerId ||
        window.currentWalletAddress;
      const address = window.currentWalletAddress || null;
      if (!travellerId || !address) return;

      const ok = await mintPolistarReward(travellerId, address, 10);
      if (ok) {
        typeStatusMessage("⏱️ +10 POLYPOINTS for your attention");
        speakWithPolistar(
          "You’ve received 10 polypoints for spending a moment with me."
        );
        window.milestoneRewarded["1min"] = true;

        const polistar = await getPolistarBalance(address);
        const el = document.getElementById("balPolistar");
        if (el) el.textContent = parseInt(polistar.balance);
        const hud = document.getElementById("poliAmount");
        if (hud) hud.textContent = parseInt(polistar.balance);
      }
    } catch (e) {
      console.error("[rewards] 1min gift failed:", e);
    }
  }, 60000);

  // 3-minute gift
  setTimeout(async () => {
    try {
      if (window.milestoneRewarded?.["3min"]) return;

      const travellerId =
        window.currentTravellerId || window.travellerId || null;
      const address = window.currentWalletAddress || null;
      if (!travellerId || !address) return;

      const ok = await mintPolistarReward(travellerId, address, 10);
      if (ok) {
        typeStatusMessage("⏳ +10 more POLYPOINTS for your presence");
        speakWithPolistar(
          "Another 10 polypoints, gifted for your continued presence."
        );
        window.milestoneRewarded["3min"] = true;

        const polistar = await getPolistarBalance(address);
        const el = document.getElementById("balPolistar");
        if (el) el.textContent = parseInt(polistar.balance);
        const hud = document.getElementById("poliAmount");
        if (hud) hud.textContent = parseInt(polistar.balance);
      }
    } catch (e) {
      console.error("[rewards] 3min gift failed:", e);
    }
  }, 180000);
}

// Expose so balances.js can kick it off on first-time balance==0
window.startPolistarTimers = startPolistarTimers;
