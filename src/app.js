import './style.css';
import { DrawMachine, TIME_STEP } from './physics.js';
import { createMachineScene } from './scene.js';
import {
  BALL_COUNT, BALL_NUMBERS, DRAW_COUNT, MAIN_COUNT, PRIZE_DIVISIONS,
  autoPick, ballColor, formatNumber, matchEntry, validNumbers,
} from './rules.js';

const element = id => document.getElementById(id);
const storageKey = 'mark-six-lab:v1';
const historyLimit = 8;
const clockFormat = new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const view = createMachineScene(element('machine-view'));
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
let selection = validNumbers(settings.selection, MAIN_COUNT) ? settings.selection : [];
let history = Array.isArray(settings.history)
  ? settings.history.filter(row => row && Number.isFinite(row.time)
    && Math.abs(row.time) <= 8.64e15 && validNumbers(row.numbers, DRAW_COUNT)).slice(0, historyLimit)
  : [];
let draft = [];
let audio = null;
let soundEnabled = false;

function persist() {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ selection, history }));
  } catch {
    // Storage may be unavailable. The current session keeps its results in memory.
  }
}

function newMachine() {
  const entropy = crypto.getRandomValues(new Uint32Array(1))[0];
  return new DrawMachine(undefined, entropy / 0x100000000 * Math.PI * 2);
}

let machine = newMachine();
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
  const balls = Array.from({ length: DRAW_COUNT }, (_, index) => numberBall(machine.drawn[index], {
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
    record.numbers.forEach((number, index) => balls.append(numberBall(number, { extra: index === MAIN_COUNT })));
    row.append(time, balls);
    return row;
  });
  historyList.replaceChildren(...rows);
}

const displayStates = {
  idle: ['待機', '撳「開始攪珠」逐粒開獎。'],
  running: ['攪珠中', '攪珠進行中，號碼按出珠次序顯示。'],
  release: ['出珠中', '出珠中，準備揭曉下一個號碼。'],
  fast: ['快抽中', '快抽中，稍後顯示全部 7 個號碼。'],
  complete: ['開獎完成', '開獎完成。頭 6 粒係攪出號碼，第 7 粒係特別號碼。'],
  stalled: ['出珠逾時', '出珠逾時，可以重新攪珠。'],
};

function renderState() {
  const running = machine.state === 'running';
  const mode = running && fast ? 'fast' : running && machine.release ? 'release' : machine.state;
  if (mode === stateShown) return;
  stateShown = mode;

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

function playSound(complete) {
  if (!audio || !soundEnabled || audio.state !== 'running') return;
  const start = audio.currentTime;
  const frequencies = complete ? [523.25, 659.25, 783.99] : [493.88];
  frequencies.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const when = start + index * 0.075;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.13, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.23);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(when);
    oscillator.stop(when + 0.24);
  });
}

function closeRound() {
  history = [{ time: Date.now(), numbers: [...machine.drawn] }, ...history].slice(0, historyLimit);
  persist();
  renderHistory();
  const main = machine.drawn.slice(0, MAIN_COUNT).map(formatNumber).join('、');
  element('announcement').textContent = `開獎完成。攪出號碼 ${main}。特別號碼 ${formatNumber(machine.drawn[MAIN_COUNT])}。`;
}

function resetMachine() {
  machine = newMachine();
  accumulator = 0;
  fast = false;
  drawUntil = performance.now() + 3000;
  element('remaining').textContent = String(BALL_COUNT);
  element('announcement').textContent = '';
  renderResults();
  renderState();
}

function startDraw(accelerate) {
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
  const speed = active && fast ? 22 : 1;
  accumulator = Math.min(1.5, accumulator + Math.min(0.25, (now - lastFrame) / 1000) * speed);
  lastFrame = now;
  const cutoff = performance.now() + 10;
  let changed = false;
  let released;
  while (accumulator >= TIME_STEP) {
    released = machine.advance();
    accumulator -= TIME_STEP;
    if (released !== undefined) {
      changed = true;
      if (!fast) playSound(machine.state === 'complete');
    }
    if (active && machine.state !== 'running') {
      drawUntil = now + 3000;
      accumulator = 0;
      break;
    }
    if (speed > 1 && performance.now() > cutoff) break;
  }

  if (active) {
    const remaining = String(machine.balls.length);
    if (element('remaining').textContent !== remaining) element('remaining').textContent = remaining;
    if (changed) {
      renderResults();
      if (machine.state === 'complete') {
        closeRound();
        if (fast) playSound(true);
      } else if (!fast) {
        element('announcement').textContent = `第 ${machine.drawn.length} 粒，${formatNumber(machine.drawn.at(-1))} 號。`;
      }
    }
    renderState();
  }

  if (active || now < drawUntil || now - lastRender > 180) {
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
if (!Audio) soundButton.hidden = true;
else soundButton.addEventListener('click', async () => {
  if (soundEnabled) {
    soundEnabled = false;
  } else {
    try {
      audio ??= new Audio();
      await audio.resume();
      soundEnabled = true;
    } catch {
      soundEnabled = false;
    }
  }
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  element('sound-label').textContent = soundEnabled ? '音效開' : '音效關';
});

const viewButtons = [...document.querySelectorAll('[data-view]')];
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    view.setView(button.dataset.view);
    drawUntil = performance.now() + 650;
    for (const choice of viewButtons) choice.setAttribute('aria-pressed', String(choice === button));
  });
}

drawButton.addEventListener('click', () => startDraw(false));
quickButton.addEventListener('click', () => startDraw(true));
element('reset').addEventListener('click', resetMachine);

renderResults();
renderSelection();
renderHistory();
renderState();
view.render(machine);
window.requestAnimationFrame(frame);
