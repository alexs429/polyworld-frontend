// public/js/storage.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "…",
  authDomain: "polyworld-2f581.firebaseapp.com",
  projectId: "polyworld-2f581",
  storageBucket: "polyworld-2f581.appspot.com"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export const gsToPath = (gs) => gs.replace(/^gs:\/\/[^/]+\//, "");
export const gsToHttp = (gsUrl) => getDownloadURL(ref(storage, gsToPath(gsUrl)));
