// Paste YOUR real web config from Firebase console:
const firebaseConfig = {
  apiKey: "…",
  authDomain: "polyworld-2f581.firebaseapp.com",
  projectId: "polyworld-2f581",
  storageBucket: "polyworld-2f581.firebasestorage.app" // or *.firebasestorage.app if that's what your console shows
};

// ---- Init (modular SDK) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helpers: gs://bucket/path → path, then → https
export const gsToPath = (gs) => gs?.replace(/^gs:\/\/[^/]+\//, "");
export const gsToHttp = async (gsUrl) => {
  if (!gsUrl?.startsWith("gs://")) return null;
  const path = gsToPath(gsUrl);
  return getDownloadURL(ref(storage, path));
};
