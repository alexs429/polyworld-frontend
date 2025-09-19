import { getPolistarBalance } from "./balances.js";

export async function initToolbar() {
  const q = (id) => document.getElementById(id);

  q("tbMetaMask")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("pw:connect-metamask"));
  });

  q("tbBuyPoli")?.addEventListener("click", () => dispatchRun("buypoli"));
  q("tbBuyPolistar")?.addEventListener("click", () =>
    dispatchRun("buypolistar")
  );
  q("tbTransferPolistar")?.addEventListener("click", () =>
    dispatchRun("transferpolistar")
  );
  q("tbEmbers")?.addEventListener("click", () => dispatchRun("showembers"));

  // --- NEW: add "My Embers" if balance > 100 ---
  const uid = localStorage.getItem("poly_uid");
  if (uid) {
    const balObj = await getPolistarBalance(uid);
    const balance = balObj.balance; // number
    console.log("POLISTAR balance for", uid, "=", balance);
    if (balance > 100) {
      let btn = document.getElementById("tbMyEmbers");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "tbMyEmbers";
        btn.textContent = "My Embers";
        btn.addEventListener("click", () => dispatchRun("showmyembers"));
        document.getElementById("toolbar").appendChild(btn);
      }
    }
  }
}
