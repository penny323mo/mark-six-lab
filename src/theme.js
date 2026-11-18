const track = '0KFnCHVyyzOQvWoJbjXi1n';
const playerTitle = '播放《Inkpot》 · Shocking Blue 原唱版';

export function drawTheme(container, follow) {
  let player;
  let ready = false;
  let round = false;
  let following = false;
  let pendingStart = false;
  let playing = false;
  let played = false;
  let rewind = false;

  function start() {
    if (!ready || !round || !follow.checked || document.hidden || following) return;
    following = true;
    if (playing) { player.seek(0); return; }
    pendingStart = true;
    rewind = played;
    player.resume();
  }

  function stop() {
    if (following && playing) player.pause();
    following = false;
    rewind = false;
  }

  function playbackStarted() {
    playing = played = true;
    if (!pendingStart) return;
    pendingStart = false;
    if (!following) player.pause();
    else if (rewind) player.seek(0);
    rewind = false;
  }

  // The native player remains usable when the optional playback-control API is unavailable.
  function nativePlayer() {
    if (container.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = 'https://open.spotify.com/embed/track/' + track + '?theme=0';
    frame.title = playerTitle;
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    container.replaceChildren(frame);
  }

  const fallback = window.setTimeout(nativePlayer, 4000);
  window.onSpotifyIframeApiReady = api => {
    clearTimeout(fallback);
    const mount = container.firstElementChild;
    api.createController(mount, {
      uri: 'spotify:track:' + track,
      width: '100%', height: 80, theme: 'dark', preferVideo: false,
    }, controller => {
      player = controller;
      container.querySelector('iframe')?.setAttribute('title', playerTitle);
      player.addListener('playback_started', playbackStarted);
      player.addListener('playback_update', event => {
        if (event.data?.isPaused) playing = false;
        else if (event.data?.position > 0) playbackStarted();
      });
      player.addListener('ready', () => {
        ready = true;
        start();
      });
    });
  };
  const script = document.createElement('script');
  script.src = 'https://open.spotify.com/embed/iframe-api/v1';
  script.async = true;
  script.onerror = nativePlayer;
  document.head.append(script);
  follow.addEventListener('change', () => follow.checked ? start() : stop());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return {
    begin() { round = true; start(); },
    end() { round = false; stop(); },
  };
}
