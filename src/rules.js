export const BALL_COUNT = 49;
export const MAIN_COUNT = 6;
export const DRAW_COUNT = MAIN_COUNT + 1;
export const BALL_NUMBERS = Object.freeze(Array.from({ length: BALL_COUNT }, (_, index) => index + 1));

export const PRIZE_DIVISIONS = Object.freeze([
  { name: '頭獎', main: 6, extra: false },
  { name: '二獎', main: 5, extra: true },
  { name: '三獎', main: 5, extra: false },
  { name: '四獎', main: 4, extra: true },
  { name: '五獎', main: 4, extra: false },
  { name: '六獎', main: 3, extra: true },
  { name: '七獎', main: 3, extra: false },
]);

const RED = new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
const BLUE = new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);

export function ballColor(number) {
  if (RED.has(number)) return 'red';
  if (BLUE.has(number)) return 'blue';
  return 'green';
}

export function formatNumber(number) {
  return String(number).padStart(2, '0');
}

export function validNumbers(numbers, count) {
  return Array.isArray(numbers)
    && numbers.length === count
    && new Set(numbers).size === count
    && numbers.every(number => Number.isInteger(number) && number >= 1 && number <= BALL_COUNT);
}

export function matchEntry(entry, draw) {
  if (!validNumbers(entry, MAIN_COUNT) || !validNumbers(draw, DRAW_COUNT)) return null;
  const main = draw.slice(0, MAIN_COUNT).filter(number => entry.includes(number)).length;
  const extra = entry.includes(draw[MAIN_COUNT]);
  const prize = PRIZE_DIVISIONS.find(division => division.main === main && division.extra === extra);
  return { main, extra, prize: prize?.name ?? null };
}

const randomWord = new Uint32Array(1);

function randomBelow(limit) {
  const cutoff = 0x100000000 - (0x100000000 % limit);
  do {
    crypto.getRandomValues(randomWord);
  } while (randomWord[0] >= cutoff);
  return randomWord[0] % limit;
}

export function shuffledNumbers() {
  const numbers = [...BALL_NUMBERS];
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swap = randomBelow(index + 1);
    [numbers[index], numbers[swap]] = [numbers[swap], numbers[index]];
  }
  return numbers;
}

export function autoPick() {
  return shuffledNumbers().slice(0, MAIN_COUNT).sort((left, right) => left - right);
}
