import { db, gsToHttp } from "./firebase-init.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Change if your Function URL differs:
const START_SESSION_URL =
  "https://us-central1-polyworld-2f581.cloudfunctions.net/startEmberSession";

// Quick UID source for now (replace with real auth later)
const getUid = () =>
  window.POLY_UID || localStorage.getItem("poly_uid") || "TEST_UID";

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function emptyCardTemplate() {
  return el(`
    <div class="ember-card ember-empty">
      <div class="meta">
        <h3>+ Create New Ember</h3>
        <p class="tagline">Begin raising your own Ember</p>
      </div>
    </div>
  `);
}

function renderCardSkeleton() {
  return el(`
    <div class="ember-card skeleton">
      <div class="avatar"></div>
      <div class="meta">
        <div class="line w-60"></div>
        <div class="line w-90"></div>
        <div class="line w-40"></div>
      </div>
    </div>
  `);
}

function cardTemplate(ember) {
  const price = ember?.pricing?.polistarPerSession ?? 0;
  const sessionSeconds = ember?.pricing?.sessionSeconds ?? 30;

  return el(`
    <div class="ember-card">
      <img class="avatar" alt="${ember.name} avatar" />
      <div class="meta">
        <h3>${ember.name ?? ""}</h3>
        <p class="tagline">${ember?.persona?.tagline ?? ""}</p>
        <p class="desc">${ember?.persona?.longBio ?? ""}</p>

        <div class="info">
          <div><b>Agent ID:</b> <code>${
            ember?.dialogflow?.agentId ?? "-"
          }</code></div>
          <div><b>Voice:</b> ${
            ember?.voice?.synthesizeSpeechConfig?.voice?.name ?? "-"
          } · ${ember?.voice?.audioEncoding ?? ""}</div>
          ${
            ember?.greeting
              ? `<div><b>Greeting:</b> ${ember.greeting}</div>`
              : ""
          }
          <div><b>Price:</b> ${price} POLISTAR · <b>Duration:</b> ${sessionSeconds}s</div>
        </div>

        <div class="actions">
          <button class="start" data-ember="${ember.id}">Start session</button>
        </div>
      </div>
    </div>
  `);
}

export async function loadMyEmbers(userId) {
  console.log("loadMyEmbers", "here");
  const wrap = document.getElementById("embersGrid");
  if (!wrap) return;
  console.log("loadMyEmbers1", "here");
  // skeletons
  for (let i = 0; i < 2; i++) wrap.appendChild(renderCardSkeleton());

  // fetch embers created by this user
  const snap = await getDocs(
    query(
      collection(db, "embers"),
      where("createdBy", "==", userId),
      orderBy("name")
    )
  );
  const embers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  wrap.innerHTML = ""; // clear skeletons

  for (const e of embers) {
    const card = cardTemplate(e);

    // resolve images
    const avatarEl = card.querySelector("img.avatar");
    const avatarGs = e?.media?.avatarUrl;
    const bgGs = e?.room?.backgroundUrl;
    if (e?.room?.accent) card.style.setProperty("--accent", e.room.accent);

    try {
      if (avatarGs) avatarEl.src = await gsToHttp(avatarGs);
      if (bgGs)
        card.style.setProperty("--bg", `url('${await gsToHttp(bgGs)}')`);
    } catch (err) {
      console.warn("Image resolve failed", err);
    }

    // wire start button
    const price = e?.pricing?.polistarPerSession ?? 0;
    card
      .querySelector("button.start")
      ?.addEventListener("click", () => startSession(e.id, price));

    wrap.appendChild(card);
  }

  // always append one empty card
  const emptyCard = emptyCardTemplate();
  emptyCard.addEventListener("click", () => {
    alert("Start Ember creation flow here");
    // later: open modal / redirect to creation page
  });
  wrap.appendChild(emptyCard);
}

async function startSession(emberId, cost) {
  const uid = getUid();
  try {
    const res = await fetch(START_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, emberId, cost }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    alert(`Session started with ${emberId}. Session ID: ${data.sessionId}`);
  } catch (e) {
    console.error(e);
    alert("Failed to start session. Check console.");
  }
}

export async function loadEmbers() {
  const wrap = document.getElementById("embersGrid");
  if (!wrap) return;

  // skeletons
  for (let i = 0; i < 3; i++) wrap.appendChild(renderCardSkeleton());

  // fetch all embers (you can add .where("status","==","active") if you like)
  const snap = await getDocs(query(collection(db, "embers"), orderBy("name")));
  const embers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  wrap.innerHTML = ""; // clear skeletons

  for (const e of embers) {
    const card = cardTemplate(e);

    // resolve images
    const avatarEl = card.querySelector("img.avatar");
    const avatarGs = e?.media?.avatarUrl;
    const bgGs = e?.room?.backgroundUrl;
    if (e?.room?.accent) card.style.setProperty("--accent", e.room.accent);

    try {
      if (avatarGs) avatarEl.src = await gsToHttp(avatarGs);
      if (bgGs)
        card.style.setProperty("--bg", `url('${await gsToHttp(bgGs)}')`);
    } catch (err) {
      console.warn("Image resolve failed", err);
    }

    // wire start button
    const price = e?.pricing?.polistarPerSession ?? 0;
    card
      .querySelector("button.start")
      ?.addEventListener("click", () => startSession(e.id, price));

    wrap.appendChild(card);
  }
}

window.addEventListener("DOMContentLoaded", loadEmbers);

