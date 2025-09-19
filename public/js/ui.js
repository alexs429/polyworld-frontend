export const els = {
  chatArea: () => document.getElementById("chatArea"),
  prompt: () => document.getElementById("prompt"),
  send: () => document.getElementById("btnSend"),
  funcSheet: () => document.getElementById("funcSheet"),
  composer: () => document.getElementById("composerWrap"),
  dim: () => document.getElementById("dim"),
  flipInner: () => document.getElementById("flipInner"),
};

let __statusTimer = null;

export function typeStatusMessage(text, cb) {
  const status = document.getElementById("statusLine");
  if (!status) return;

  // Add glow effect
  status.classList.add("active");
  setTimeout(() => status.classList.remove("active"), 2000);

  if (__statusTimer) clearInterval(__statusTimer);
  status.textContent = "";

  let i = 0;
  const speed = 40;
  __statusTimer = setInterval(() => {
    if (i < text.length) {
      status.textContent += text[i++];
    } else {
      clearInterval(__statusTimer);
      __statusTimer = null;
      cb && cb();
    }
  }, speed);
}

export function startStatusBlinking(text = "Processing…") {
  const status = document.getElementById("statusLine");
  if (!status) return;

  status.textContent = text;
  status.classList.add("blinking");
}

export function stopStatusBlinking(text = "Done.") {
  const status = document.getElementById("statusLine");
  if (!status) return;

  status.classList.remove("blinking");
  status.textContent = text;

  // Optional glow on completion
  status.classList.add("active");
  setTimeout(() => status.classList.remove("active"), 2000);
}


export function addMsg(role, text) {
  const row = document.createElement("div");
  row.className = "msg " + role;

  // Special handling for QR
  if (role === "qr") {
    const bubble = document.createElement("div");
    bubble.className = "bubble-txt";

    const qr = qrcode(0, 'L');
    qr.addData(text);
    qr.make();

    const qrWrapper = document.createElement("div");
    qrWrapper.style.background = "#fff";
    qrWrapper.style.padding = "12px";
    qrWrapper.style.borderRadius = "16px";
    qrWrapper.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
    qrWrapper.style.display = "flex";
    qrWrapper.style.alignItems = "center";
    qrWrapper.style.justifyContent = "center";
    qrWrapper.style.width = "144px";
    qrWrapper.style.height = "144px";
    qrWrapper.style.margin = "0 auto";
    qrWrapper.style.overflow = "visible";
    qrWrapper.style.clipPath = "none";
    qrWrapper.style.maskImage = "none";
    qrWrapper.style.webkitMaskImage = "none";

    const temp = document.createElement("div");
    temp.innerHTML = qr.createImgTag(6, 0);
    const img = temp.firstChild;

    img.style.borderRadius = "0";
    img.style.width = "120px";
    img.style.height = "120px";
    img.style.display = "block";
    img.style.clipPath = "none";
    img.style.maskImage = "none";
    img.style.webkitMaskImage = "none";

    qrWrapper.appendChild(img);

    const label = document.createElement("div");
    label.style.fontWeight = "bold";
    label.style.marginBottom = "6px";
    label.style.textAlign = "center";
    label.textContent = "📲 Connect Another Device";

    const urlText = document.createElement("div");
    urlText.style.marginTop = "10px";
    urlText.style.fontSize = "12px";
    urlText.style.wordBreak = "break-word";
    urlText.style.textAlign = "center";
    urlText.style.userSelect = "all";
    urlText.onclick = () => {
      navigator.clipboard.writeText(text);
      alert("URL copied!");
    };
    urlText.textContent = text;

    const dismiss = document.createElement("div");
    dismiss.innerHTML = `<button style="margin-top: 6px; font-size: 12px;">❌ Dismiss</button>`;
    dismiss.style.textAlign = "center";
    dismiss.querySelector("button").onclick = () => row.remove();

    bubble.appendChild(label);
    bubble.appendChild(qrWrapper);
    bubble.appendChild(urlText);
    bubble.appendChild(dismiss);

    row.appendChild(bubble);
  } else {
    const bubble = document.createElement("div");
    bubble.className = "bubble-txt";
    bubble.textContent = text;
    row.appendChild(bubble);
    if (role === "user") row.style.justifyContent = "flex-end";
  }

  els.chatArea().appendChild(row);
  els.chatArea().scrollTop = els.chatArea().scrollHeight;
}


export function setSheet(open) {
  els.funcSheet().classList.toggle("open", open);
  els.dim().classList.toggle("open", open);
  els.composer().classList.toggle("shift", open);
  els.chatArea().classList.toggle("sheet-open", open);
  document.getElementById("btnPlus")
    ?.setAttribute("aria-expanded", String(open));
}

export function flipToBack(open) {
  els.flipInner()?.classList.toggle("flipped", !!open);
}

export function addSystemMessage(html) {
  const chat = els.chatArea();
  const div = document.createElement("div");
  div.className = "chat-msg system";
  div.innerHTML = `<div class="msg-text">${html}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
