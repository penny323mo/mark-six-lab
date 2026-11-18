// The motor has a continuous hum. Short envelopes take their timing from actual contacts.
export class MachineSound {
  constructor(context) {
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = 0.65;
    const limiter = context.createDynamicsCompressor();
    this.output.connect(limiter).connect(context.destination);
    this.hum = context.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.output);
    this.motor = context.createOscillator();
    this.motor.type = 'triangle';
    this.motor.frequency.value = 45;
    this.motor.connect(this.hum);
    this.motor.start();
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = 2 * Math.random() - 1;
    this.lastImpact = -1;
    this.phase = '';
    this.count = 0;
    this.lastPower = -1;
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
    source.start(when);
    source.stop(when + duration + 0.005);
    source.onended = () => { source.disconnect(); band.disconnect(); volume.disconnect(); };
  }

  update(machine, peak, accelerated) {
    const now = this.context.currentTime;
    const running = machine.state === 'running';
    const power = running ? machine.power : 0;
    if (power !== this.lastPower) {
      this.hum.gain.setTargetAtTime(power * 0.075, now, 0.055);
      this.motor.frequency.setTargetAtTime(42 + 38 * power, now, 0.075);
      this.lastPower = power;
    }
    const phase = machine.release?.phase ?? (machine.inFeed && running ? 'gate' : machine.state);
    if (phase !== this.phase) {
      if (phase === 'gate') {
        this.burst(860, 0.46, 0.13);
        this.burst(1950, 0.28, 0.045, 0.09);
      } else if (phase === 'lift' && !accelerated) {
        this.burst(920, 0.14, 0.31, 0, 4.5);
      } else if (phase === 'rail' && !accelerated) {
        this.burst(1480, 0.17, 0.23, 0, 1.4);
      }
      this.phase = phase;
    }
    if (machine.drawn.length > this.count && (!accelerated || !running)) {
      this.burst(720, 0.65, 0.075);
      this.burst(2300, 0.3, 0.055, 0.037);
    }
    this.count = machine.drawn.length;
    if (running && peak > 1.7 && now - this.lastImpact > (accelerated ? 0.15 : 0.070)) {
      const strength = Math.min(1, peak / 12);
      this.burst(370 + Math.random() * 430, strength * 0.68, 0.039 + strength * 0.032, 0, 1.1);
      this.lastImpact = now;
    }
  }
}
