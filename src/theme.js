const track = '0KFnCHVyyzOQvWoJbjXi1n';
const trackUri = 'spotify:track:' + track;
const playerTitle = '播放《Inkpot》 · Shocking Blue 原唱版';

export function backgroundTheme(container, toggle, hint) {
  let player;
  let ready = false;
  let needsStart = true;
  let requested = false;
  let playing = false;
  let cancelPending = false;
  let replaySent = false;
  let lastPosition = 0;

  function start() {
    if (!ready || !toggle.checked || !needsStart || document.hidden) return;
    requested = true;
    player.resume();
  }

  function update({ data }) {
    if (!data || (data.playingURI && data.playingURI !== trackUri)) return;
    const { position, duration, isPaused, isBuffering } = data;
    if (!(duration > 0) || !Number.isFinite(position)) return;

    // Spotify previews can report the final position twice, still marked as playing.
    // Other players reset to zero on completion after their last progress update.
    const ended = position >= duration ||
      (isPaused && position === 0 && playing && lastPosition >= duration - 1250);
    if (toggle.checked && ended) {
      if (!replaySent) {
        replaySent = true;
        playing = false;
        requested = needsStart = true;
        player.play();
      }
      return;
    }
    if (isPaused && playing && document.hidden) needsStart = true;
    playing = !isPaused;
    lastPosition = position;
    if (playing && cancelPending) {
      cancelPending = false;
      player.pause();
      return;
    }
    if (isBuffering) return;
    if (playing && position > 0) {
      requested = needsStart = replaySent = false;
      hint.hidden = true;
    } else if (isPaused && needsStart && toggle.checked && !document.hidden) {
      hint.hidden = false;
    }
  }

  toggle.addEventListener('change', () => {
    hint.hidden = !(toggle.checked && !ready && container.querySelector('iframe'));
    needsStart = toggle.checked;
    cancelPending = !toggle.checked && requested;
    requested = replaySent = false;
    if (toggle.checked) start();
    else if (playing) player.pause();
  });
  // A trusted page gesture can release audible autoplay on a first visit.
  function activate(event) {
    if (event.repeat || event.target.closest?.('label')?.contains(toggle)) return;
    start();
  }
  document.addEventListener('click', activate, true);
  document.addEventListener('keydown', activate, true);
  document.addEventListener('visibilitychange', start);
  window.addEventListener('pageshow', start);

  function nativePlayer() {
    if (container.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = 'https://open.spotify.com/embed/track/' + track + '?theme=0';
    frame.title = playerTitle;
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    container.replaceChildren(frame);
    hint.hidden = !toggle.checked;
  }

  const fallback = window.setTimeout(nativePlayer, 4000);
  window.onSpotifyIframeApiReady = api => {
    clearTimeout(fallback);
    api.createController(container.firstElementChild, {
      uri: trackUri, width: '100%', height: 80, theme: 'dark', preferVideo: false,
    }, controller => {
      player = controller;
      const frame = container.querySelector('iframe');
      frame?.setAttribute('title', playerTitle);
      frame?.setAttribute('loading', 'eager');
      player.addListener('playback_update', update);
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
}
