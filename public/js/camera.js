export function initCamera() {
  const video = document.getElementById("userCamera");
  const fb = document.getElementById("camFallback");
  if (!video) return;

  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    if (fb) fb.hidden = false;
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(stream => {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const p = video.play();
      if (p && p.then) p.catch(() => {});
      if (fb) fb.remove();
    })
    .catch(() => { if (fb) fb.hidden = false; });
}
