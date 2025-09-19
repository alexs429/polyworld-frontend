// embers.js (dynamic)
// Requires you to load firebase-init.js BEFORE this file:
// <script type="module" src="/js/firebase-init.js"></script>
// <script type="module" src="/js/embers.js"></script>
import { ENDPOINTS, DEV } from "./config.js";
import { speakWithPolistar } from "./speech.js";
import { els, addMsg } from "./ui.js";
import { startEmberTraining } from "./chat.js";
import { db, gsToHttp } from "./firebase-init.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// ---- Defaults (your existing assets) ----
const DEFAULT_HOST_IMG = "/images/bots/poly.png";
const DEFAULT_ROOM = "/images/rooms/Main Entry.png";

// Internal cache of live embers (keeps your old shape: id, name, desc, img, room)
let EMBERS = [];
let _loaded = false;
let _onSelect = null;
let _activeRaw = null;
export function getActiveEmber() {
  return _activeRaw;
}

// Public: allow other modules to listen for selection
export function onEmberSelected(fn) {
  _onSelect = fn;
}

// Public (optional): expose the current list
export function getEmbers() {
  return [...EMBERS];
}

// ---- Helpers ----
function setRoomBackground(url) {
  document.documentElement.style.setProperty("--bg-img", `url("${url}")`);
}

function setPromptHint(prompt) {
  window.dispatchEvent(
    new CustomEvent("pw:set-prompt-hint", {
      detail: { text: prompt },
    })
  );
}

export async function getUserEmbers(userId) {
  try {
    const res = await fetch(`/api/embers?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch embers");
    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error("getUserEmbers error", err);
    return [];
  }
}

async function fetchLiveEmbers() {
  const snap = await getDocs(
    query(collection(db, "embers"), where("status", "==", "active"))
  );
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Map Firestore docs → UI-friendly objects (keep your old keys)
  const mapped = await Promise.all(
    rows.map(async (e) => {
      let imgHttp = null,
        roomHttp = null;

      if (e?.media?.avatarUrl?.startsWith("gs://")) {
        try {
          imgHttp = await gsToHttp(e.media.avatarUrl);
        } catch {}
      }
      if (e?.room?.backgroundUrl?.startsWith("gs://")) {
        try {
          roomHttp = await gsToHttp(e.room.backgroundUrl);
        } catch {}
      }
      console.log("🔥 RAW EMBER", e.id, e);
      return {
        id: e.id,
        name: e.name || e.id,
        desc: e?.persona?.tagline || e?.persona?.longBio || "",
        img: imgHttp || "/images/bots/ember-generic.png", // fallback if storage URL missing
        room: roomHttp || DEFAULT_ROOM,
        // keep the raw doc in case other modules need details (voice, agentId, etc.)
        _raw: e,
      };
    })
  );

  return mapped;
}

async function ensureLoaded() {
  if (_loaded && EMBERS.length) return;
  EMBERS = await fetchLiveEmbers();
  _loaded = true;
}

/** Show the ember picker as a compact card inside the chat area */
export async function showEmberPanel() {
  await ensureLoaded();

  const area = els.chatArea?.() || document.getElementById("chatArea");
  if (!area) return;

  const old = document.getElementById("emberListCard");
  if (old) old.remove();

  const card = document.createElement("div");
  card.id = "emberListCard";
  card.className = "ember-card";

  card.innerHTML = `
      <div class="ember-card-head">Choose an Ember</div>
      <div class="ember-list">
        ${EMBERS.map(
          (e) => `
          <div class="ember-flip-card">
            <div class="ember-flip-inner" data-id="${e.id}">
              <div class="ember-face ember-front">
                <img class="ember-avatar ember-avatar-clickable" src="${
                  e.img
                }" alt="${e.name}">
                <div class="ember-name">${e.name}</div>
                <div class="ember-desc">${e.desc}</div>
              </div>
              <div class="ember-face ember-back">
                ${
                  e._raw?.nft?.hasOwnProperty("tokenId") &&
                  !!e._raw?.nft?.contract
                    ? `
                    <div class="title">✅ True Ember</div>
                    <div class="field" nowrap>Focus: ${e.name}</div>
                    <div class="field">DOB: 20 Oct 1995</div>
                    <div class="field">Trained by: You</div>
                    <div class="field">ID Hash: ${
                      e._raw?.identity?.identityHash || "—"
                    }</div>
                    <div class="qr"><canvas class="qrCanvas" data-url="https://sepolia.etherscan.io/token/${
                      e._raw.nft.contract
                    }?a=${e._raw.nft.tokenId}"></canvas></div>
                    <div class="proof-link"><a href="https://sepolia.etherscan.io/token/${
                      e._raw.nft.contract
                    }?a=${
                        e._raw.nft.tokenId
                      }" target="_blank">🔍 View on chain</a></div>
                    `
                    : `
                    <div class="title">🕯️ Unminted Ember</div>
                    <div class="field">This Ember has not yet been minted as an identity token.</div>
                    <div class="field">You can still interact with them, but chain reference is not available.</div>
                    `
                }
              </div>
            </div>
          </div>
        `
        ).join("")}
      </div>
  `;

  area.appendChild(card);
  area.scrollTop = area.scrollHeight;

  card.addEventListener("click", (ev) => {
    const avatar = ev.target.closest(".ember-avatar-clickable");
    const flipCard = ev.target.closest(".ember-flip-inner");

    // If user clicked the avatar — select the Ember
    if (avatar && flipCard) {
      const id = flipCard.dataset.id;
      setActiveEmberUI(id);
      card.remove();
      if (typeof _onSelect === "function") {
        const ember = EMBERS.find((x) => x.id === id) || null;
        _activeRaw = ember?._raw || null;
        console.log("Active Raw:",_activeRaw);
        _onSelect(id, _activeRaw);
      }
      return;
    }

    // If user clicked the card but not the avatar — just flip it
    if (flipCard) {
      flipCard.classList.toggle("flipped");
    }
  });

  // Draw QR codes
  card.querySelectorAll(".qrCanvas").forEach((canvas) => {
    const url = canvas.dataset.url;
    const qr = qrcode(0, "L");
    qr.addData(url);
    qr.make();

    const ctx = canvas.getContext("2d");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const tileW = size / qr.getModuleCount();
    const tileH = size / qr.getModuleCount();
    for (let r = 0; r < qr.getModuleCount(); r++) {
      for (let c = 0; c < qr.getModuleCount(); c++) {
        ctx.fillStyle = qr.isDark(r, c) ? "#000" : "#fff";
        const w = Math.ceil((c + 1) * tileW) - Math.floor(c * tileW);
        const h = Math.ceil((r + 1) * tileH) - Math.floor(r * tileH);
        ctx.fillRect(Math.round(c * tileW), Math.round(r * tileH), w, h);
      }
    }
  });
}

export async function showMyEmberPanel(uid) {
  const area = els.chatArea?.() || document.getElementById("chatArea");
  if (!area) return;

  // remove any old panel
  const old = document.getElementById("emberListCard");
  if (old) old.remove();

  const card = document.createElement("div");
  card.id = "emberListCard";
  card.className = "ember-card";

  // fetch this user's embers
  const snap = await getDocs(
    query(collection(db, "embers"), where("createdBy", "==", uid))
  );
  const embers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // split into trained + training
  const trained = embers.filter((e) => e.status !== "training");
  const training = embers.find((e) => e.status === "training");

  let html = "";

  // trained embers
  for (const e of trained) {
    let avatarUrl = "/assets/ember-placeholder.png";
    try {
      if (e?.media?.avatarUrl) {
        avatarUrl = await gsToHttp(e.media.avatarUrl);
      }
    } catch (err) {
      console.warn("Avatar fetch failed", err);
    }

    html += `
      <div class="ember-flip-card">
        <div class="ember-flip-inner" data-id="${e.id}">
          <div class="ember-face ember-front">
            <img class="ember-avatar ember-avatar-clickable" src="${avatarUrl}" alt="${
      e.name
    }">
            <div class="ember-name">${e.name}</div>
            <div class="ember-desc">${e?.persona?.tagline ?? ""}</div>
            ${
              e.status !== "active"
                ? `<button class="ember-finalize-btn" data-id="${e.id}">Finalize (100 POLISTAR)</button>`
                : ""
            }
            ${
              e.status === "active" && !e.nft
                ? `<button class="ember-mint-btn" data-id="${e.id}">Mint NFT (50 POLISTAR)</button>`
                : ""
            }
          </div>
          <div class="ember-face ember-back">
            <div class="title">🕯️ Your Ember</div>
            <div class="field">Description: ${e?.persona?.longBio ?? "—"}</div>
          </div>
        </div>
      </div>
    `;
  }

  // training or new
  if (training) {
    let avatarUrl = null;
    try {
      if (training?.media?.avatarUrl) {
        avatarUrl = await gsToHttp(training.media.avatarUrl);
      }
    } catch (err) {
      console.warn("⚠️ Could not load training avatar", err);
    }

    const avatarHtml = avatarUrl
      ? `<img class="ember-avatar ember-avatar-clickable" src="${avatarUrl}" alt="${
          training.name || "Training Ember"
        }">`
      : `<div class="ember-avatar ember-avatar-clickable ember-training-circle">⚡</div>`;

    html += `
      <div class="ember-flip-card ember-training">
        <div class="ember-flip-inner" data-id="${
          training.id
        }" data-training="true">
          <div class="ember-face ember-front">
            ${avatarHtml}
            <div class="ember-name">${training.name || "Training Ember"}</div>
            <div class="ember-desc">Continue training your Ember</div>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="ember-flip-card ember-empty">
        <div class="ember-flip-inner" data-id="new">
          <div class="ember-face ember-front">
            <div class="ember-avatar ember-avatar-clickable">＋</div>
            <div class="ember-name">Create New Ember</div>
            <div class="ember-desc">Start raising your Ember</div>
          </div>
        </div>
      </div>
    `;
  }

  // assign innerHTML first
  card.innerHTML = `
    <div class="ember-card-head">My Embers</div>
    <div class="ember-list">${html}</div>
  `;

  // ✅ Attach button listeners here
  card.querySelectorAll(".ember-finalize-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const emberId = btn.dataset.id;

      addMsg("assistant", "⏳ Finalizing your Ember… please wait.");
      typeStatusMessage("Finalizing…");

      btn.disabled = true;
      btn.textContent = "Finalizing…";

      try {
        const res = await fetch(ENDPOINTS.finalizeEmberTraining, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flameId: window.currentWalletAddress,
            emberId,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          addMsg(
            "assistant",
            "✅ Your Ember has been finalized and is now public!"
          );
          typeStatusMessage("Training complete 🎉");

          btn.textContent = "✅ Finalized!";
          showMyEmberPanel(uid); // refresh panel

          if (json.newDraft) {
            window.dispatchEvent(
              new CustomEvent("pw:new-ember-draft", {
                detail: { emberId: json.newDraft },
              })
            );
            addMsg("assistant", "✨ A new empty Ember slot is now available.");
          }
        } else {
          btn.disabled = false;
          btn.textContent = "Finalize (retry)";
          addMsg(
            "assistant",
            `❌ Finalization failed: ${json?.error || "Please try again."}`
          );
          typeStatusMessage("Finalization failed.");
        }
      } catch (err) {
        console.error("Finalize failed", err);
        btn.disabled = false;
        btn.textContent = "Finalize (retry)";
        addMsg("assistant", "❌ Finalization error. Please retry.");
        typeStatusMessage("Finalization error.");
      }
    });
  });

  card.querySelectorAll(".ember-mint-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const emberId = btn.dataset.id;

      addMsg("assistant", "⏳ Minting your Ember NFT… please wait.");
      typeStatusMessage("Minting NFT…");

      btn.disabled = true;
      btn.textContent = "Minting…";

      try {
        const res = await fetch(ENDPOINTS.mintEmberNFT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flameId: window.currentWalletAddress,
            emberId,
            wallet: window.currentWalletAddress,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          addMsg(
            "assistant",
            `✅ Ember NFT minted successfully! Token ID: ${json.nft?.tokenId}`
          );
          typeStatusMessage("NFT minted 🎉");

          btn.textContent = "✅ Minted!";
          showMyEmberPanel(uid); // refresh panel
        } else {
          btn.disabled = false;
          btn.textContent = "Mint NFT (retry)";
          addMsg(
            "assistant",
            `❌ Minting failed: ${json?.error || "Please try again."}`
          );
          typeStatusMessage("Mint failed.");
        }
      } catch (err) {
        console.error("Mint failed", err);
        btn.disabled = false;
        btn.textContent = "Mint NFT (retry)";
        addMsg("assistant", "❌ Minting error. Please retry.");
        typeStatusMessage("Minting error.");
      }
    });
  });

  // finally append the card
  area.appendChild(card);
  area.scrollTop = area.scrollHeight;

  // click handler for avatar/draft selection
  card.addEventListener("click", (ev) => {
    const avatar = ev.target.closest(".ember-avatar-clickable");
    const flipCard = ev.target.closest(".ember-flip-inner");
    if (!avatar || !flipCard) return;

    const id = flipCard.dataset.id;
    const isNew = id === "new";
    const isTraining = flipCard.dataset.training === "true";

    if (isNew) {
      card.remove();
      startEmberTraining();
      enterEmberTrainingMode();
      return;
    }
    if (isTraining) {
      const ember = embers.find((x) => x.id === id);
      card.remove();
      resumeEmberTraining(ember);
      return;
    }

    setActiveEmberUI(id);
    card.remove();
    if (typeof _onSelect === "function") {
      const ember = embers.find((x) => x.id === id);
      _onSelect(id, ember);
    }
  });

  // Listen for new draft slot creation (triggered after finalize)
  window.addEventListener("pw:new-ember-draft", (e) => {
    const { emberId } = e.detail || {};
    if (!emberId) return;

    const area = els.chatArea?.() || document.getElementById("chatArea");
    if (!area) return;

    const draftCard = document.createElement("div");
    draftCard.className = "ember-flip-card ember-empty";
    draftCard.innerHTML = `
      <div class="ember-flip-inner" data-id="${emberId}">
        <div class="ember-face ember-front">
          <div class="ember-avatar ember-avatar-clickable">＋</div>
          <div class="ember-name">New Ember</div>
          <div class="ember-desc">Start raising this Ember</div>
        </div>
      </div>
    `;

    const list = area.querySelector("#emberListCard .ember-list");
    if (list) {
      list.appendChild(draftCard);
    }
  });
}

export function showAvatarCaptureStep(emberId) {
  // Flip traveller camera back if hidden
  window.dispatchEvent(
    new CustomEvent("pw:run-cmd", { detail: { cmd: "showcamera" } })
  );

  addMsg(
    "assistant",
    "📷 Please look at your camera (right panel) and click on the ➕ in the circle on the left to capture your Ember’s avatar."
  );

  const circle = document.querySelector(".ember-training-circle");
  if (!circle) {
    console.warn("Training circle not found");
    return;
  }

  circle.style.cursor = "pointer";
  circle.title = "Click to capture avatar";

  circle.onclick = () => {
    const video = document.getElementById("userCamera");
    if (!video) {
      console.warn("Camera stream not found (#userCamera missing)");
      return;
    }

    // Grab frame
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --- Apply lightweight cartoon filter ---
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      // Boost contrast
      pixels[i] = Math.min(255, pixels[i] * 1.2);
      pixels[i + 1] = Math.min(255, pixels[i + 1] * 1.2);
      pixels[i + 2] = Math.min(255, pixels[i + 2] * 1.2);

      // Quantize color levels (cartoonish look)
      pixels[i] = Math.floor(pixels[i] / 40) * 40;
      pixels[i + 1] = Math.floor(pixels[i + 1] / 40) * 40;
      pixels[i + 2] = Math.floor(pixels[i + 2] / 40) * 40;
    }
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL("image/png");

    // Replace circle with preview
    const avatar = document.createElement("img");
    avatar.id = "activeAvatarImg";
    avatar.className = "ember-avatar-full";
    avatar.src = dataUrl;

    // 🔹 force full circle style
    avatar.style.width = "100%";
    avatar.style.height = "100%";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";

    const wrapper =
      circle.closest(".ember-avatar-training") || circle.parentNode;
    if (wrapper) {
      wrapper.replaceWith(avatar);
    }

    // Ask user what to do next
    addMsg(
      "assistant",
      "✅ Avatar captured. Please type RETAKE to try again, or SAVE to confirm."
    );
    window.dispatchEvent(
      new CustomEvent("pw:status", {
        detail: { message: "Type RETAKE or SAVE" },
      })
    );
    setPromptHint("Retake or Save");

    // Store temp dataUrl in global training state
    window.currentAvatarDraft = { emberId, dataUrl };
  };
}

export function replaceWithTrainingCircle() {
  const avatar = document.getElementById("activeAvatarImg");
  if (!avatar) {
    console.warn(
      "❌ No activeAvatarImg found, cannot replace with training circle"
    );
    return;
  }

  // Build training wrapper
  const trainingWrapper = document.createElement("div");
  trainingWrapper.id = "emberAvatarTraining";
  trainingWrapper.className = "ember-avatar-training";

  const circle = document.createElement("div");
  circle.className = "ember-training-circle";
  circle.textContent = "＋"; // plus sign
  trainingWrapper.appendChild(circle);

  // ✅ Ensure parent exists and replace
  const parent = avatar.parentNode;
  if (parent) {
    parent.replaceChild(trainingWrapper, avatar);
    console.log("✅ Replaced Polistar avatar with training circle");
  } else {
    console.warn("❌ Avatar has no parent, cannot replace");
  }
}

export async function resumeEmberTraining(ember) {
  // 🔹 Stop immediately if training is already complete
  if (ember?.trainingProgress?.complete) {
    console.log("✅ Ember already fully trained:", ember?.id);
    window.dispatchEvent(
      new CustomEvent("pw:status", {
        detail: { message: "✨ Training complete" },
      })
    );
    addMsg(
      "assistant",
      `✅ Your Ember "${ember?.name || "Ember"}" is fully trained!`
    );
    return;
  }

  // 🔥 Fetch Flame identity (needed for step 1 + step 5 decisions)
  let flame = null;
  if (ember?.createdBy) {
    try {
      const res = await fetch(
        `${ENDPOINTS.getFlameById}?id=${encodeURIComponent(ember.createdBy)}`
      );
      if (res.ok) flame = await res.json();
    } catch (err) {
      console.error("resumeEmberTraining: Flame lookup failed", err);
    }
  }
  // If avatar already exists and step >= 3, render it
  if (ember?.media?.avatarUrl && (ember.trainingProgress?.step || 0) >= 3) {
    const avatarUrl = await gsToHttp(ember.media.avatarUrl);
    const roomUrl = ember.room?.backgroundUrl
      ? await gsToHttp(ember.room.backgroundUrl)
      : DEFAULT_ROOM;

    setActiveEmberUI(ember.id, {
      id: ember.id,
      name: ember.name || "Training Ember",
      img: avatarUrl,
      room: roomUrl,
      _raw: ember,
    });

    _activeRaw = ember;
  } else {
    // No avatar yet → show training circle
    replaceWithTrainingCircle();
  }

  // Tell chat.js to pick up from the correct step
  const step = ember?.trainingProgress?.step || 1;
  window.dispatchEvent(
    new CustomEvent("pw:resume-training-step", {
      detail: { step, ember, flame }, // 🔥 pass Flame along too
    })
  );
}

export function enterEmberTrainingMode() {
  replaceWithTrainingCircle();

  // 🔹 send status to chat.js
  window.dispatchEvent(
    new CustomEvent("pw:status", {
      detail: { message: "✨ Raising your Ember — Your Name" },
    })
  );

  //speakWithPolistar("Let’s begin raising your Ember. Please tell me your name.");

  // Add chat message asking for name
  //addMsg("assistant", "Let's raise a new Ember. Please type your Name:");
  //setPromptHint("First + Last name");
}

export async function setActiveEmberUI(emberId, emberObj = null) {
  const ember = emberObj || EMBERS.find((e) => e.id === emberId);

  if (!ember) return;

  const hasNFT =
    ember?._raw?.nft?.hasOwnProperty("tokenId") && !!ember?._raw?.nft?.contract;

  const tokenUrl = hasNFT
    ? `https://sepolia.etherscan.io/token/${ember._raw.nft.contract}?a=${ember._raw.nft.tokenId}`
    : null;

  const avatar = document.getElementById("activeAvatarImg");
  if (!avatar) return;

  // Remove previous flip wrapper if it exists
  const existing = document.getElementById("emberAvatarFlipWrapper");
  if (existing) existing.remove();

  // --- Create flip wrapper ---
  const wrapper = document.createElement("div");
  wrapper.id = "emberAvatarFlipWrapper";
  wrapper.className = "ember-avatar-flip-wrapper";

  const flip = document.createElement("div");
  flip.className = "ember-avatar-inner";

  // --- FRONT face (avatar image) ---
  const front = document.createElement("div");
  front.className = "ember-flip-face ember-flip-front";

  const avatarClone = avatar.cloneNode(true);
  avatarClone.id = "activeAvatarImg";
  if (ember.img) {
    avatarClone.src = ember.img;
  } else if (ember._raw?.media?.avatarUrl) {
    // Convert if needed
    avatarClone.src = ember._raw.media.avatarUrl.startsWith("gs://")
      ? await gsToHttp(ember._raw.media.avatarUrl)
      : ember._raw.media.avatarUrl;
  } else {
    avatarClone.src = "/images/bots/ember-generic.png";
  }
  avatarClone.className = "ember-avatar-full";
  front.appendChild(avatarClone);
  flip.appendChild(front);

  // --- BACK face (NFT info or Unminted) ---
  const back = document.createElement("div");
  back.className = "ember-flip-face ember-flip-back";

  if (hasNFT) {
    const title = document.createElement("div");
    title.className = "title-row";
    title.innerHTML = `<span class="tick-icon">✅</span><span class="label-text">True Ember</span>`;
    back.appendChild(title);

    const canvas = document.createElement("canvas");
    canvas.className = "nft-qr";
    canvas.width = 80;
    canvas.height = 80;
    back.appendChild(canvas);

    const link = document.createElement("a");
    link.href = tokenUrl;
    link.target = "_blank";
    link.className = "nft-link";
    link.textContent = "🔗 View on chain";
    back.appendChild(link);

    // Draw QR
    const qr = qrcode(0, "L");
    qr.addData(tokenUrl);
    qr.make();
    const ctx = canvas.getContext("2d");
    const size = 80;
    const tileW = size / qr.getModuleCount();
    const tileH = size / qr.getModuleCount();
    for (let r = 0; r < qr.getModuleCount(); r++) {
      for (let c = 0; c < qr.getModuleCount(); c++) {
        ctx.fillStyle = qr.isDark(r, c) ? "#000" : "#fff";
        const w = Math.ceil((c + 1) * tileW) - Math.floor(c * tileW);
        const h = Math.ceil((r + 1) * tileH) - Math.floor(r * tileH);
        ctx.fillRect(Math.round(c * tileW), Math.round(r * tileH), w, h);
      }
    }
  } else {
    const titleRow = document.createElement("div");
    titleRow.className = "title-row";
    titleRow.innerHTML = `<span class="tick-icon">🕯️</span><span class="label-text">Unminted Ember</span>`;
    back.appendChild(titleRow);

    const msg = document.createElement("div");
    msg.className = "field";
    msg.textContent = "This identity has not been minted yet.";
    back.appendChild(msg);
  }

  flip.appendChild(back);
  wrapper.appendChild(flip);
  avatar.parentNode.replaceChild(wrapper, avatar);

  // --- Flip toggle on click ---
  flip.addEventListener("click", () => {
    flip.classList.toggle("flipped");
    const speaker = document.getElementById("voiceToggle");
    if (speaker) {
      speaker.style.display = flip.classList.contains("flipped") ? "none" : "";
    }
  });

  if (!window._avatarStepBound) {
    window._avatarStepBound = true;
    window.addEventListener("pw:show-avatar-step", () => {
      showAvatarCaptureStep();
    });
  }

  // --- Room background swap ---
  setRoomBackground(ember?.room || DEFAULT_ROOM);

  // --- Mini Polistar button ---
  let mini = document.getElementById("hostMini");
  if (!mini) {
    mini = document.createElement("button");
    mini.id = "hostMini";
    mini.className = "mini-host";
    mini.setAttribute("aria-label", "Return to Polistar");
    mini.innerHTML = `<img src="${DEFAULT_HOST_IMG}" alt="">`;
    document.body.appendChild(mini);
    mini.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("pw:run-cmd", { detail: { cmd: "polistarback" } })
      );
    });
  } else {
    const img = mini.querySelector("img");
    if (img) img.src = DEFAULT_HOST_IMG;
  }
}

export function restorePolistarUI() {
  const flipWrapper = document.getElementById("emberAvatarFlipWrapper");
  const parent = flipWrapper?.parentNode;

  if (flipWrapper && parent) {
    // Replace the wrapper with a clean avatar image
    const img = document.createElement("img");
    img.id = "activeAvatarImg";
    img.src = DEFAULT_HOST_IMG;
    img.alt = "Polistar";
    img.className = "ember-avatar-full";
    img.style.transform = "none";
    img.style.filter = "none";
    img.style.opacity = "1";

    parent.replaceChild(img, flipWrapper);
  } else {
    // fallback in case wrapper not found
    const hostImg = document.getElementById("activeAvatarImg");
    if (hostImg) hostImg.src = DEFAULT_HOST_IMG;
  }

  setRoomBackground(DEFAULT_ROOM);

  const mini = document.getElementById("hostMini");
  if (mini) mini.remove();

  // Show speaker toggle again
  const speaker = document.getElementById("voiceToggle");
  if (speaker) speaker.style.display = "";
}
