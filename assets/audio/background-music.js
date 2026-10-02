// Carefree — Kevin MacLeod (CC BY 4.0). See credits.html.
// Independent streaming music; the original game AudioContext and SFX are untouched.
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
  // Level reduction is baked into the small MP3, including on iOS.
  const key = 'dahrooj-music-enabled';
  let enabled = true, activated = false, pending = false, failed = false, pageActive = true;
  try { enabled = localStorage.getItem(key) !== '0'; } catch (_) {}
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btn-music';
  button.style.touchAction = 'manipulation';
  button.setAttribute('aria-label', 'موسيقى الخلفية');
  // Keep the hit target and SVG nodes stable throughout touch/click dispatch.
  button.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/><path data-music-slash d="M3 3l18 18"/></svg>';
  const slash = button.querySelector('[data-music-slash]');
  function updateButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.dataset.state = failed ? 'error' : !music.paused ? 'playing' : enabled ? 'ready' : 'muted';
    button.title = failed ? 'إعادة محاولة الموسيقى؛ المؤثرات مستمرة' : !music.paused ? 'كتم الموسيقى فقط' : 'تشغيل الموسيقى';
    button.style.opacity = enabled ? '1' : '.5';
    slash.style.display = enabled ? 'none' : '';
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
        updateButton();
      }).catch(() => { pending = false; updateButton(); });
    } catch (_) { pending = false; updateButton(); }
  }
  button.addEventListener('click', event => {
    event.stopPropagation();
    // A first tap on the note starts playback, rather than silently disabling it.
    enabled = music.paused || !enabled;
    try { localStorage.setItem(key, enabled ? '1' : '0'); } catch (_) {}
    if (!enabled) music.pause();
    else {
      if (failed) { failed = false; pending = false; music.removeAttribute('src'); music.load(); }
      play(true);
    }
    updateButton();
  });
  document.querySelector('.side')?.appendChild(button);
  const panel = document.getElementById('chpanel');
  if (panel) panel.style.top = 'calc(144px + env(safe-area-inset-top,0px))';

  function gesture(event) {
    if (event.isTrusted && !event.target?.closest?.('#btn-music')) play(true);
  }
  for (const event of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    document.addEventListener(event, gesture, {passive:true});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause(); else play();
  });
  window.addEventListener('pagehide', () => { pageActive = false; music.pause(); });
  window.addEventListener('pageshow', () => { pageActive = true; play(); });
  music.addEventListener('error', () => { failed = true; pending = false; updateButton(); });
  for (const event of ['playing', 'pause']) music.addEventListener(event, updateButton);
  updateButton();
})();
