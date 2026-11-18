import { BALL_COUNT } from './rules.js';

// Each short, damped contact adds to the rolling sound of the whole bowl.
function makeRattle(context) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * 2.3), rate);
  const samples = buffer.getChannelData(0);
  const tail = Math.ceil(rate * 0.035);
  for (let start = 0; start < samples.length - tail;) {
    const frequency = 340 + Math.random() ** 1.4 * 940;
    const overtone = 1650 + 1450 * Math.random();
    const amplitude = 0.18 + Math.random() * 0.54;
    const decay = 0.004 + Math.random() * 0.005;
    for (let i = 0; i < tail; i++) {
      const t = i / rate;
      const envelope = Math.min(1, t * 1600) * Math.exp(-t / decay);
      samples[start + i] += amplitude * envelope * (Math.sin(2 * Math.PI * frequency * t)
        + 0.40 * Math.exp(-t * 125) * Math.sin(2 * Math.PI * overtone * t));
    }
    start += Math.ceil(rate * (0.006 + 0.029 * Math.random()));
  }
  return buffer;
}

function movingContacts(balls) {
  let energy = 0;
  for (const ball of balls) {
    if (ball.feedLane !== null) continue;
    const speedSquared = ball.vx ** 2 + ball.vy ** 2 + ball.vz ** 2;
    energy += Math.min(16, speedSquared) * Math.min(2.5, ball.impact);
  }
  return Math.min(1.35, Math.sqrt(energy / BALL_COUNT));
}

export class MachineSound {
  constructor(context) {
    this.context = context;
    const limiter = context.createDynamicsCompressor();
    this.output = limiter;
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.10;
    const level = context.createGain();
    level.gain.value = 0.70;
    limiter.connect(level).connect(context.destination);

    this.hum = context.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.output);
    this.motor = context.createOscillator();
    const harmonics = new Float32Array([0, 1, 0.24, 0.26, 0.11, 0.07]);
    this.motor.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length), harmonics));
    this.motor.frequency.value = 45;
    this.motor.connect(this.hum);
    this.motor.start();

    this.roll = context.createGain();
    this.roll.gain.value = 0;
    this.roll.connect(this.output);
    this.rollingBalls = context.createBufferSource();
    this.rollingBalls.buffer = makeRattle(context);
    this.rollingBalls.loop = true;
    this.rollingBalls.connect(this.roll);
    this.rollingBalls.start();

    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.6), context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = 2 * Math.random() - 1;
    this.bursts = new Set();
    this.lastImpact = -1;
    this.phase = '';
    this.count = 0;
    this.inFeed = BALL_COUNT;
  }

  silence(machine) {
    const now = this.context.currentTime;
    for (const gain of [this.hum.gain, this.roll.gain]) {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
    }
    for (const source of this.bursts) source.stop(now);
    this.phase = '';
    this.count = machine.drawn.length;
    this.inFeed = machine.inFeed;
    this.lastImpact = -1;
  }

  burst(frequency, gain, duration, delay = 0, width = 1.8) {
    const ctx = this.context;
    const when = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = frequency;
    band.Q.value = width;
    const volume = ctx.createGain();
    volume.gain.setValueAtTime(0.0001, when);
    volume.gain.exponentialRampToValueAtTime(gain, when + 0.003);
    volume.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(band).connect(volume).connect(this.output);
    this.bursts.add(source);
    source.onended = () => {
      this.bursts.delete(source);
      source.disconnect(); band.disconnect(); volume.disconnect();
    };
    source.start(when, Math.random() * (this.noise.duration - duration - 0.01));
    source.stop(when + duration + 0.005);
  }

  update(machine, peak, accelerated) {
    const now = this.context.currentTime;
    const running = machine.state === 'running';
    const power = running ? machine.power : 0;
    const phase = machine.release?.phase ?? (machine.inFeed && running ? 'gate' : machine.state);
    const extracting = phase === 'lift' || phase === 'rail';
    const contact = running ? movingContacts(machine.balls) : 0;
    this.roll.gain.setTargetAtTime(contact * (extracting ? 0.23 : 0.54), now, 0.05);
    this.rollingBalls.playbackRate.setTargetAtTime(0.86 + 0.23 * contact, now, 0.10);
    this.hum.gain.setTargetAtTime(power * (extracting ? 0.045 : 0.080), now, 0.07);
    this.motor.frequency.setTargetAtTime(42 + 38 * power, now, 0.075);

    if (phase !== this.phase) {
      if (phase === 'gate') {
        this.burst(840, 0.95, 0.12);
        this.burst(1900, 0.46, 0.055, 0.065);
      } else if (phase === 'lift' && !accelerated) {
        this.burst(890, 0.32, 0.22, 0, 3.4);
      } else if (phase === 'rail' && !accelerated) {
        this.burst(1330, 0.47, 0.19, 0, 1.35);
      }
      this.phase = phase;
    }
    const dropped = this.inFeed - machine.inFeed;
    if (running && dropped > 0) {
      this.burst(1050 + Math.random() * 750, Math.min(0.78, 0.23 + dropped * 0.07), 0.068);
    }
    this.inFeed = machine.inFeed;
    if (machine.drawn.length > this.count && (!accelerated || !running)) {
      this.burst(830, 1.02, 0.080);
      this.burst(2040, 0.48, 0.048, 0.030);
    }
    this.count = machine.drawn.length;
    if (running && peak > 1.4 && now - this.lastImpact > (accelerated ? 0.15 : 0.060)) {
      const strength = Math.min(1, peak / 8);
      this.burst(640 + Math.random() * 700, strength * (extracting ? 0.52 : 0.86),
        0.037 + strength * 0.034, 0, 1.1);
      this.lastImpact = now;
    }
  }
}
