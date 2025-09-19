// auth.js (CDN ESM, no bundler)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,   // optional, see window.signInWithCustomJwt
  signOut,                 // optional
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5F5SxqsUvSJvR2zHZ_Pjj6iHDfOJy4Wo",
  authDomain: "polyworld-2f581.firebaseapp.com",
  projectId: "polyworld-2f581",
};

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();

// Promise that resolves ONCE a user is available
let resolveReady;
const authReady = new Promise((res) => (resolveReady = res));

// Keep globals other modules depend on
function exposeUser(u) {
  window.currentUserUid = u?.uid || null;

  // ✅ wait for readiness inside helpers to avoid race conditions
  window.getIdToken = async (forceRefresh = false) => {
    const user = auth.currentUser || (await authReady);
    return user.getIdToken(forceRefresh);
  };
  window.getUid = async () => {
    const user = auth.currentUser || (await authReady);
    return user.uid;
  };

  if (u) {
    if (resolveReady) { resolveReady(u); resolveReady = null; }
    window.dispatchEvent(new CustomEvent("firebase-signed-in", { detail: { uid: u.uid } }));
  }
}

// Auth state listener
onAuthStateChanged(auth, (u) => exposeUser(u));

// If a user is already cached on reload, expose immediately (optional safety)
if (auth.currentUser) exposeUser(auth.currentUser);

// Kick off anonymous sign-in if no user yet
if (!auth.currentUser) {
  signInAnonymously(auth).catch((e) => console.error("Anonymous sign-in failed:", e));
}

// OPTIONAL custom-token helper stays as-is...
window.signInWithCustomJwt = async (jwt) => {
  try {
    if (auth.currentUser) await signOut(auth);
    const cred = await signInWithCustomToken(auth, jwt);
    exposeUser(cred.user);
    return cred.user;
  } catch (e) {
    console.error("Custom token sign-in failed:", e);
    throw e;
  }
};

window.authReady = authReady;