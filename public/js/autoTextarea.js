// /js/autoTextarea.js
export function bindAutoGrow(selector = "#prompt", maxVh = 40) {
  const ta = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!ta) return;

  const minH = parseFloat(getComputedStyle(ta).minHeight) || 0;
  const maxPx = () => Math.floor(window.innerHeight * (maxVh / 100));

  const resize = () => {
    ta.style.height = "auto"; // allow shrink
    const target = Math.min(Math.max(ta.scrollHeight, minH), maxPx());
    ta.style.height = target + "px";
  };

  ta.addEventListener("input", resize);
  window.addEventListener("resize", resize);
  requestAnimationFrame(resize);

  // make available to other modules
  ta.__pw_autogrow__ = resize;
  ta.__pw_autogrow_reset__ = () => {
    ta.style.height = ""; // drop inline height
    resize();             // snap back to base (one-line) height
  };
}
