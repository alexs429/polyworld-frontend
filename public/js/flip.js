export function initFlip() {
  const flipInner = document.getElementById("flipInner");
  if (!flipInner) return;

  const poliHud      = document.getElementById("poliHud");
  const backFace     = document.getElementById("backFace");
  const balancePanel = document.querySelector("#backFace .balance-panel");
  const balAddrEl    = document.getElementById("balAddr");

  const flipTo = (open) => flipInner.classList.toggle("flipped", !!open);

  // Open on chip click
  poliHud?.addEventListener("click", () => flipTo(true));

  // Close when clicking the back (except the address)
  backFace?.addEventListener("click", (e) => {
    if (e.target.closest(".addr")) return;
    flipTo(false);
  });
  balancePanel?.addEventListener("click", (e) => {
    if (e.target.closest(".addr")) return;
    flipTo(false);
  });

  // Copy full address without flipping
  balAddrEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    const t = balAddrEl.dataset.full || balAddrEl.textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
  });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") flipTo(false);
  });
}
