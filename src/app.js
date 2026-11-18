import './style.css';
import { DrawMachine, TIME_STEP } from './physics.js';
import { createMachineScene } from './scene.js';
import { MachineSound } from './sound.js';
import { backgroundTheme } from './theme.js';
import { studioDisplay } from './studio-display.js';
import {
  BALL_COUNT, BALL_NUMBERS, DRAW_COUNT, MAIN_COUNT, PRIZE_DIVISIONS,
  autoPick, ballColor, formatNumber, matchEntry, resultOrder, validNumbers,
} from './rules.js';

const element = id => document.getElementById(id);
const storageKey = 'mark-six-lab:v1';
const historyLimit = 8;
const clockFormat = new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const viewHost = element('machine-view');
const studioDialog = element('studio-dialog');
const pickDialog = element('pick-dialog');
const rulesDialog = element('rules-dialog');
const resultBalls = element('result-balls');
const selectionBalls = element('selection-balls');
const historyList = element('history-list');
const drawButton = element('draw');
const quickButton = element('quick');

function loadSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey)) ?? {};
  } catch {
    return {};
  }
}

const settings = loadSettings();
const musicToggle = element('music-follow');
musicToggle.checked = (settings.backgroundMusic ?? settings.followMusic) !== false;
backgroundTheme(element('theme-player'), musicToggle, element('music-hint'));
const view = createMachineScene(viewHost);
let selection = validNumbers(settings.selection, MAIN_COUNT) ? settings.selection : [];
let history = Array.isArray(settings.history)
  ? settings.history.filter(row => row && Number.isFinite(row.time)
    && Math.abs(row.time) <= 8.64e15 && validNumbers(row.numbers, DRAW_COUNT)).slice(0, historyLimit)
  : [];
let draft = [];
let effects;
let soundEnabled = settings.soundEnabled !== false;

function persist() {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      selection, history, soundEnabled, backgroundMusic: musicToggle.checked,
    }));
  } catch {
    // Storage may be unavailable. The current session keeps its results in memory.
  }
}

let machine = new DrawMachine();
let fast = false;
let accumulator = 0;
let lastFrame = performance.now();
let drawUntil = lastFrame + 3000;
let lastRender = 0;
let stateShown = '';

function numberBall(number, options = {}) {
  const ball = document.createElement('span');
  styleBall(ball, number, options);
  return ball;
}

function styleBall(ball, number, { extra = false, placeholder = '·' } = {}) {
  ball.className = ['ball', number ? ballColor(number) : 'empty', extra ? 'extra' : ''].join(' ');
  ball.textContent = number ? formatNumber(number) : placeholder;
  ball.removeAttribute('aria-label');
  ball.removeAttribute('aria-hidden');
  if (extra) ball.setAttribute('aria-label', number ? `特別號碼 ${formatNumber(number)}` : '特別號碼待抽');
  else if (!number) ball.setAttribute('aria-hidden', 'true');
}

function renderResults() {
  const numbers = resultOrder(machine.drawn);
  const balls = Array.from({ length: DRAW_COUNT }, (_, index) => numberBall(numbers[index], {
    extra: index === MAIN_COUNT,
    placeholder: index === MAIN_COUNT ? '特' : String(index + 1),
  }));
  resultBalls.replaceChildren(...balls);
  element('result-count').textContent = `${machine.drawn.length} / ${DRAW_COUNT}`;
  const latest = machine.drawn.at(-1);
  element('current-ball').hidden = latest === undefined;
  if (latest !== undefined) {
    const extra = machine.drawn.length === DRAW_COUNT;
    styleBall(element('current-number'), latest, { extra });
    element('current-caption').textContent = extra ? '特別號碼' : `第 ${machine.drawn.length} 粒攪出號碼`;
  }
  renderMatch();
}

function renderMatch() {
  const match = matchEntry(selection, machine.drawn);
  const note = element('match-note');
  note.dataset.matched = String(Boolean(match?.prize));
  if (match) {
    const extra = match.extra ? ' · 中特別號碼' : '';
    note.textContent = `${match.prize ?? '未中獎'} · 中 ${match.main} 個攪出號碼${extra}`;
  } else if (selection.length) {
    note.textContent = '已揀 6 個號碼，等候開獎。';
  } else {
    note.textContent = '揀 6 個號碼，開獎後即時對獎。';
  }
}

function renderSelection() {
  selectionBalls.replaceChildren(...Array.from({ length: MAIN_COUNT }, (_, index) => numberBall(selection[index])));
  element('open-picks').firstChild.textContent = selection.length ? '編輯選號 ' : '選擇號碼 ';
  renderMatch();
}

function renderHistory() {
  element('history-empty').hidden = history.length > 0;
  element('history-count').textContent = history.length ? `最近 ${history.length} 輪` : '';
  const rows = history.map(record => {
    const row = document.createElement('li');
    row.className = 'history-row';
    const time = document.createElement('time');
    time.dateTime = new Date(record.time).toISOString();
    time.textContent = clockFormat.format(record.time);
    const balls = document.createElement('div');
    balls.className = 'history-balls';
    resultOrder(record.numbers).forEach((number, index) => {
      balls.append(numberBall(number, { extra: index === MAIN_COUNT }));
    });
    row.append(time, balls);
    return row;
  });
  historyList.replaceChildren(...rows);
}

const displayStates = {
  idle: ['已上珠', '49 粒號碼球已放入機頂珠架。'],
  loading: ['開閘落珠', '號碼球由機頂珠架跌入球腔。'],
  running: ['攪珠中', '攪珠進行中，號碼按出珠次序顯示。'],
  lift: ['中央升球', '升降桿將底部集球口嘅號碼球送上機頂。'],
  rail: ['號碼球入軌', '號碼球沿弧形軌道滾入展示位置。'],
  fast: ['快抽中', '快抽中，稍後顯示全部 7 個號碼。'],
  complete: ['開獎完成', '六個攪出號碼已由細排到大。'],
};

function renderState() {
  const running = machine.state === 'running';
  let mode = machine.state;
  if (running) {
    if (machine.inFeed > 0) mode = 'loading';
    else if (fast) mode = 'fast';
    else if (machine.release) mode = machine.release.phase;
  }
  const controlsState = fast ? mode + '-fast' : mode;
  if (controlsState === stateShown) return;
  stateShown = controlsState;

  const state = element('machine-state');
  state.dataset.state = mode === 'fast' ? 'running' : mode;
  const [label, note] = displayStates[mode];
  state.lastElementChild.textContent = label;
  element('result-note').textContent = note;
  element('draw-label').textContent = running ? '攪珠進行中' : machine.state === 'idle' ? '開始攪珠' : '再攪一輪';
  element('quick-label').textContent = running && !fast ? '加速完成' : '快抽';
  drawButton.disabled = running;
  quickButton.disabled = running && fast;
}

function closeRound() {
  history = [{ time: Date.now(), numbers: [...machine.drawn] }, ...history].slice(0, historyLimit);
  persist();
  renderHistory();
  const main = resultOrder(machine.drawn).slice(0, MAIN_COUNT).map(formatNumber).join('、');
  element('announcement').textContent = `開獎完成。攪出號碼 ${main}。特別號碼 ${formatNumber(machine.drawn[MAIN_COUNT])}。`;
}

function resetMachine() {
  machine = new DrawMachine();
  effects?.silence(machine);
  accumulator = 0;
  fast = false;
  drawUntil = performance.now() + 3000;
  element('remaining').textContent = String(BALL_COUNT);
  element('announcement').textContent = '';
  renderResults();
  renderState();
}

function startDraw(accelerate) {
  if (soundEnabled) enableEffects();
  if (machine.state === 'running') {
    if (accelerate) fast = true;
  } else {
    if (machine.state !== 'idle') resetMachine();
    fast = accelerate || reducedMotion.matches;
    machine.start();
  }
  renderState();
}

function frame(now) {
  const active = machine.state === 'running';
  const showDrop = machine.inFeed > 0 && !reducedMotion.matches;
  const speed = active && fast && !showDrop ? 22 : 1;
  const elapsed = Math.max(0, (now - lastFrame) / 1000);
  accumulator = Math.min(2.75, accumulator + Math.min(showDrop ? 0.34 : 1, elapsed) * speed);
  lastFrame = now;
  const cutoff = performance.now() + Math.min(32, Math.max(10, elapsed * 180));
  let changed = false;
  let released;
  let peak = 0;
  while (accumulator >= TIME_STEP) {
    released = machine.advance();
    peak = Math.max(peak, machine.impact);
    accumulator -= TIME_STEP;
    if (released !== undefined) {
      changed = true;
    }
    if (active && machine.state !== 'running') {
      drawUntil = now + 3000;
      accumulator = 0;
      break;
    }
    if (speed > 1 && performance.now() > cutoff) break;
  }
  if (active && soundEnabled && effects?.context.state === 'running') effects.update(machine, peak, speed > 1);

  if (active) {
    const remaining = String(machine.balls.length);
    if (element('remaining').textContent !== remaining) element('remaining').textContent = remaining;
    if (changed) {
      renderResults();
      if (machine.state === 'complete') {
        closeRound();
      } else if (!fast) {
        element('announcement').textContent = `第 ${machine.drawn.length} 粒，${formatNumber(machine.drawn.at(-1))} 號。`;
      }
    }
    renderState();
  }

  if (active || studioDialog.matches(':modal') || now < drawUntil || now - lastRender > 180) {
    view.render(machine);
    lastRender = now;
  }
  window.requestAnimationFrame(frame);
}

const pickButtons = BALL_NUMBERS.map(number => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = formatNumber(number);
  button.className = `ball ${ballColor(number)}`;
  button.addEventListener('click', () => {
    const index = draft.indexOf(number);
    if (index >= 0) draft.splice(index, 1);
    else if (draft.length < MAIN_COUNT) draft.push(number);
    renderDraft();
  });
  return button;
});
element('number-grid').append(...pickButtons);

function renderDraft() {
  pickButtons.forEach((button, index) => {
    const selected = draft.includes(BALL_NUMBERS[index]);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !selected && draft.length === MAIN_COUNT;
  });
  element('pick-count').textContent = `${draft.length} / ${MAIN_COUNT}`;
  element('clear-pick').disabled = draft.length === 0;
  element('save-pick').disabled = draft.length !== 0 && draft.length !== MAIN_COUNT;
}

element('open-picks').addEventListener('click', () => {
  draft = [...selection];
  pickDialog.returnValue = '';
  renderDraft();
  pickDialog.showModal();
});
element('auto-pick').addEventListener('click', () => {
  draft = autoPick();
  renderDraft();
});
element('clear-pick').addEventListener('click', () => {
  draft = [];
  renderDraft();
});
pickDialog.addEventListener('close', () => {
  if (pickDialog.returnValue !== 'save' || (draft.length && !validNumbers(draft, MAIN_COUNT))) return;
  selection = [...draft].sort((left, right) => left - right);
  persist();
  renderSelection();
});

for (const division of PRIZE_DIVISIONS) {
  const row = document.createElement('tr');
  for (const value of [division.name, String(division.main), division.extra ? '✓' : '—']) {
    row.insertCell().textContent = value;
  }
  element('prizes').append(row);
}
element('open-rules').addEventListener('click', () => rulesDialog.showModal());

const soundButton = element('sound');
const Audio = window.AudioContext ?? window.webkitAudioContext;
function soundLabel() {
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  element('sound-label').textContent = soundEnabled ? '音效開' : '音效關';
}
function enableEffects() {
  if (!Audio) return;
  try {
    effects ??= new MachineSound(new Audio());
    if (effects.context.state !== 'running') effects.context.resume().catch(() => {});
  } catch {
    soundEnabled = false;
    soundLabel();
  }
}
soundLabel();
if (!Audio) soundButton.hidden = true;
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  effects?.silence(machine);
  if (soundEnabled) enableEffects();
  else effects?.context.suspend().catch(() => {});
  soundLabel();
  persist();
});
musicToggle.addEventListener('change', persist);
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
  accumulator = 0;
  if (!effects || !soundEnabled) return;
  effects.silence(machine);
  if (document.hidden) effects.context.suspend().catch(() => {});
  else effects.context.resume().catch(() => {});
});

const viewButtons = [...document.querySelectorAll('[data-view]')];
let lastPreset = 'front';
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    lastPreset = button.dataset.view;
    view.setView(lastPreset);
    drawUntil = performance.now() + 650;
    for (const choice of viewButtons) choice.setAttribute('aria-pressed', String(choice === button));
  });
}

const exploreButton = element('explore');
const display = studioDisplay(element('studio-panel'), () => leaveStudio());
const navTools = element('navigation-tools');
const stick = element('walk-stick');
const consoleButton = element('studio-console');
const help = element('explore-help');
const navButtons = [...navTools.querySelectorAll('[data-navigation]')];
let navMode = 'walk';
let stickPointer = null;
let leavingStudio = false;
let helpTimer;

function showNavigationHelp() {
  clearTimeout(helpTimer);
  help.classList.remove('quiet');
  helpTimer = setTimeout(() => help.classList.add('quiet'), 5500);
}
function releaseStick() {
  stickPointer = null;
  view.setStick(0, 0);
  stick.style.setProperty('--thumb-x', '0px');
  stick.style.setProperty('--thumb-y', '0px');
}
function trackStick(event) {
  if (event.pointerId !== stickPointer) return;
  const box = stick.getBoundingClientRect();
  const radius = box.width * 0.33;
  let dx = event.clientX - box.left - box.width / 2;
  let dy = event.clientY - box.top - box.height / 2;
  const cap = Math.min(1, radius / (Math.hypot(dx, dy) || 1));
  dx *= cap; dy *= cap;
  view.setStick(dx / radius, -dy / radius);
  stick.style.setProperty('--thumb-x', dx + 'px');
  stick.style.setProperty('--thumb-y', dy + 'px');
}
stick.addEventListener('pointerdown', event => {
  if (stickPointer !== null) return;
  stickPointer = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  trackStick(event);
});
stick.addEventListener('pointermove', trackStick);
for (const type of ['pointerup','pointercancel','lostpointercapture']) {
  stick.addEventListener(type, event => { if (event.pointerId === stickPointer) releaseStick(); });
}
window.addEventListener('blur', releaseStick);

function navigationMode(mode) {
  releaseStick();
  navMode = mode;
  view.setNavigationMode(mode);
  studioDialog.dataset.navMode = mode;
  for (const button of navButtons) button.setAttribute('aria-pressed', String(button.dataset.navigation === mode));
  const walking = mode === 'walk';
  stick.hidden = !studioDialog.matches(':modal') || !walking;
  help.querySelector('.pointer-help').textContent = walking ? '拖曳望四周 · WASD 行走 · Shift 快行 · Q／E 升降' : '拖曳環繞 · 滾輪拉近指住嘅位置 · 右鍵平移';
  help.querySelector('.touch-help').textContent = walking ? '左邊搖桿行走 · 右邊拖曳望四周 · 雙指拉近' : '單指環繞 · 雙指平移或縮放';
  showNavigationHelp();
}
for (const button of navButtons) button.addEventListener('click', () => navigationMode(button.dataset.navigation));
element('studio-home').addEventListener('click', () => {
  releaseStick();
  viewButtons.find(button => button.dataset.view === 'front').click();
  showNavigationHelp();
});
function setConsole(open) {
  studioDialog.dataset.console = open ? 'open' : 'closed';
  consoleButton.setAttribute('aria-expanded', String(open));
}
consoleButton.addEventListener('click', () => setConsole(studioDialog.dataset.console !== 'open'));
viewHost.addEventListener('studio-navigate', () => {
  for (const button of viewButtons) button.setAttribute('aria-pressed', 'false');
  clearTimeout(helpTimer);
  helpTimer = setTimeout(() => help.classList.add('quiet'), 1800);
});

function enterStudio() {
  if (studioDialog.matches(':modal')) return;
  display.lock();
  studioDialog.close();
  studioDialog.removeAttribute('role');
  studioDialog.setAttribute('aria-describedby', 'explore-help');
  studioDialog.showModal();
  display.enterNative();
  view.setExplore(true);
  navigationMode(navMode);
  setConsole(false);
  navTools.hidden = false;
  exploreButton.textContent = '離開現場';
  exploreButton.setAttribute('aria-expanded', 'true');
  help.hidden = false;
  exploreButton.focus({ preventScroll: true });
}
viewHost.addEventListener('click', enterStudio);
exploreButton.addEventListener('click', () => studioDialog.matches(':modal') ? leaveStudio() : enterStudio());
async function leaveStudio() {
  if (leavingStudio || !studioDialog.matches(':modal')) return;
  leavingStudio = true;
  await display.exitNative();
  releaseStick();
  clearTimeout(helpTimer);
  navTools.hidden = true;
  stick.hidden = true;
  studioDialog.close();
  studioDialog.setAttribute('role', 'region');
  studioDialog.removeAttribute('aria-describedby');
  studioDialog.show();
  view.setExplore(false);
  view.setView(lastPreset);
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === lastPreset));
  exploreButton.textContent = '入現場';
  exploreButton.setAttribute('aria-expanded', 'false');
  help.hidden = true;
  drawUntil = performance.now() + 750;
  exploreButton.focus({ preventScroll: true });
  display.unlock();
  leavingStudio = false;
}
studioDialog.addEventListener('cancel', event => {
  event.preventDefault();
  leaveStudio();
});

drawButton.addEventListener('click', () => startDraw(false));
quickButton.addEventListener('click', () => startDraw(true));
element('reset').addEventListener('click', resetMachine);

renderResults();
renderSelection();
renderHistory();
renderState();
view.render(machine);
window.requestAnimationFrame(frame);
