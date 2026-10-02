// Carefree — Kevin MacLeod (CC BY 4.0). See credits.html.
// Separate streaming music: never changes the game's AudioContext, gains or SFX.
(() => {
  'use strict';
  if (document.getElementById('dahrooj-bgm')) return;
  const base = new URL('.', document.currentScript.src);
  const music = document.createElement('audio');
  music.id = 'dahrooj-bgm';
  music.preload = 'none';
  music.loop = true;
  music.hidden = true;
  music.setAttribute('playsinline', '');
  document.body.appendChild(music);
  // The MP3 itself is attenuated to 0.12 amplitude (-18.42 dB), so iOS does
  // not need to support HTMLMediaElement.volume. No second AudioContext.
  const key = 'dahrooj-music-enabled';
  let enabled = true, activated = false, pending = false, failed = false, pageActive = true;
  try { enabled = localStorage.getItem(key) !== '0'; } catch (_) {}
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btn-music';
  button.setAttribute('aria-label', 'موسيقى الخلفية');
  const note = '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>';
  function updateButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.title = failed ? 'تعذر تحميل الموسيقى؛ مؤثرات اللعبة مستمرة' : enabled ? 'كتم الموسيقى فقط' : 'تشغيل الموسيقى';
    button.style.opacity = enabled ? '1' : '.5';
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + note + (enabled ? '' : '<path d="M3 3l18 18"/>') + '</svg>';
  }
  function play(fromGesture = false) {
    if (fromGesture) activated = true;
    if (!activated || !enabled || !pageActive || document.hidden || failed || pending || !music.paused) return;
    if (!music.hasAttribute('src')) music.src = new URL('carefree-quiet.mp3', base).href;
    pending = true;
    try {
      Promise.resolve(music.play()).then(() => {
        pending = false;
        if (!enabled || !pageActive || document.hidden) music.pause();
      }).catch(() => { pending = false; }); // Autoplay denial / abort never affects gameplay.
    } catch (_) { pending = false; }
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? '1' : '0'); } catch (_) {}
    if (!enabled) music.pause();
    else {
      if (failed) { failed = false; music.removeAttribute('src'); music.load(); }
      play(true);
    }
    updateButton();
  });
  document.querySelector('.side')?.appendChild(button);
  const panel = document.getElementById('chpanel');
  if (panel) panel.style.top = 'calc(144px + env(safe-area-inset-top,0px))';
  const credit = document.createElement('a');
  credit.id = 'music-credit';
  credit.href = new URL('credits.html', base).href;
  credit.textContent = 'Carefree · Kevin MacLeod';
  credit.title = 'حقوق الموسيقى — CC BY 4.0';
  credit.style.cssText = 'pointer-events:auto;color:inherit;font-size:10px;line-height:1;letter-spacing:.02em;text-transform:none;text-decoration:none;';
  document.querySelector('.credit')?.appendChild(credit);
  function gesture(event) {
    if (event.isTrusted && !event.target?.closest?.('#btn-music,#music-credit')) play(true);
  }
  // Touchend/pointerup also cover browsers that reject playback on pointerdown.
  for (const event of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    document.addEventListener(event, gesture, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause(); else play();
  });
  window.addEventListener('pagehide', () => { pageActive = false; music.pause(); });
  window.addEventListener('pageshow', () => { pageActive = true; play(); });
  music.addEventListener('error', () => { failed = true; pending = false; updateButton(); });
  updateButton();
})();
