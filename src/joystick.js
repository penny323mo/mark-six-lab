// Touch identifiers stay with the finger even when it leaves the pad or WebKit loses pointer capture.
export function bindWalkStick(stick, setStick) {
  const doc = stick.ownerDocument;
  const win = doc.defaultView;
  const nativeTouches = 'ontouchstart' in win;
  let finger = null;
  let pointer = null;

  function release() {
    const id = pointer;
    finger = pointer = null;
    setStick(0, 0);
    stick.style.setProperty('--thumb-x', '0px');
    stick.style.setProperty('--thumb-y', '0px');
    if (id !== null && stick.hasPointerCapture?.(id)) {
      try { stick.releasePointerCapture(id); } catch { /* The browser already ended this pointer. */ }
    }
  }

  function steer(x, y) {
    const box = stick.getBoundingClientRect();
    const radius = Math.min(box.width, box.height) * 0.33;
    if (!radius) { release(); return; }
    const dx = x - box.left - box.width / 2;
    const dy = y - box.top - box.height / 2;
    const scale = 1 / Math.max(radius, Math.hypot(dx, dy));
    setStick(dx * scale, -dy * scale);
    stick.style.setProperty('--thumb-x', dx * scale * radius + 'px');
    stick.style.setProperty('--thumb-y', dy * scale * radius + 'px');
  }

  function touch(event) {
    if (pointer !== null) return;
    const onPad = point => stick.contains(point.target);
    let current;
    if (finger !== null) {
      current = Array.from(event.touches).find(point => point.identifier === finger && onPad(point));
      if (!current) release();
    }
    if (!current && (event.type === 'touchstart' || event.type === 'touchmove')) {
      current = Array.from(event.changedTouches).find(onPad);
      if (current) finger = current.identifier;
    }
    if (current && Array.from(event.changedTouches).some(point => point.identifier === finger)) {
      steer(current.clientX, current.clientY);
    }
  }
  if (nativeTouches) {
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      win.addEventListener(type, touch, { capture: true, passive: true });
    }
  }

  stick.addEventListener('pointerdown', event => {
    if (nativeTouches && event.pointerType === 'touch') return;
    if (event.button !== 0 || finger !== null) return;
    if (pointer !== null) {
      if (!event.isPrimary) return;
      release();
    }
    pointer = event.pointerId;
    try { stick.setPointerCapture(pointer); } catch { /* Window listeners can still track this press. */ }
    steer(event.clientX, event.clientY);
  });
  win.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    if (event.pointerType === 'mouse' && !event.buttons) release();
    else steer(event.clientX, event.clientY);
  }, true);
  function endPointer(event) {
    if (event.pointerId === pointer) release();
  }
  for (const type of ['pointerup', 'pointercancel']) win.addEventListener(type, endPointer, true);
  stick.addEventListener('lostpointercapture', endPointer);
  stick.addEventListener('contextmenu', event => event.preventDefault());
  win.addEventListener('blur', release);
  win.addEventListener('pagehide', release);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) release(); });
  return release;
}
