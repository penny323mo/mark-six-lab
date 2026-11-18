// Keep the shooting floor fixed even on browsers without element fullscreen.
export function studioDisplay(panel, onNativeExit) {
  const root = document.documentElement;
  let saved = null;
  let native = false;
  let visit = 0;
  const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement;
  const gestureOptions = {capture:true, passive:false};

  function fitViewport() {
    const viewport = window.visualViewport;
    root.style.setProperty('--studio-width', (viewport?.width ?? window.innerWidth) + 'px');
    root.style.setProperty('--studio-height', (viewport?.height ?? window.innerHeight) + 'px');
    root.style.setProperty('--studio-left', (viewport?.offsetLeft ?? 0) + 'px');
    root.style.setProperty('--studio-top', (viewport?.offsetTop ?? 0) + 'px');
  }
  function blockScroll(event) {
    if (event.cancelable) event.preventDefault();
  }
  function blockPageKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key)) {
      event.preventDefault();
    } else if (event.code === 'Space' && !event.target.closest?.('button,a,input')) {
      event.preventDefault();
    }
  }
  function lock() {
    if (saved) return;
    visit++;
    saved = {x:window.scrollX, y:window.scrollY};
    root.style.setProperty('--page-left', -saved.x + 'px');
    root.style.setProperty('--page-top', -saved.y + 'px');
    root.classList.add('in-studio');
    fitViewport();
    window.addEventListener('wheel', blockScroll, gestureOptions);
    window.addEventListener('touchmove', blockScroll, gestureOptions);
    window.addEventListener('keydown', blockPageKey, true);
    window.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
  }
  function exitNative() {
    if (fullscreenElement() !== panel) return;
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    if (exit) Promise.resolve(exit.call(document)).catch(() => {});
  }
  function enterNative() {
    const request = panel.requestFullscreen ?? panel.webkitRequestFullscreen;
    if (!request || fullscreenElement()) return;
    try {
      // A dialog itself cannot request fullscreen. Its section can.
      Promise.resolve(request.call(panel, {navigationUI:'hide'})).catch(() => {});
    } catch { /* The fixed visual viewport is already active. */ }
  }
  function changed() {
    if (fullscreenElement() === panel) {
      if (!saved) { exitNative(); return; }
      native = true;
      fitViewport();
    } else if (native) {
      native = false;
      if (saved) onNativeExit();
    }
  }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);

  function unlock() {
    if (!saved) return;
    const restore = saved;
    const finished = visit;
    saved = null;
    native = false;
    exitNative();
    window.removeEventListener('wheel', blockScroll, true);
    window.removeEventListener('touchmove', blockScroll, true);
    window.removeEventListener('keydown', blockPageKey, true);
    window.removeEventListener('resize', fitViewport);
    window.visualViewport?.removeEventListener('resize', fitViewport);
    window.visualViewport?.removeEventListener('scroll', fitViewport);
    root.classList.remove('in-studio');
    for (const key of ['--page-left','--page-top','--studio-width','--studio-height','--studio-top','--studio-left']) root.style.removeProperty(key);
    const returnToPage = () => { if (visit === finished && !saved) window.scrollTo(restore.x, restore.y); };
    returnToPage();
    requestAnimationFrame(returnToPage);
  }
  return {lock, enterNative, unlock};
}
