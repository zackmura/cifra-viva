// Violão sintetizado (algoritmo Karplus-Strong: um ruído curto que "vibra" como corda).

export class VirtualGuitar {
  constructor(ctx) {
    this.ctx = ctx;
    this.output = ctx.createGain(); // vai para o detector de acordes
    this.output.gain.value = 0.6;
    this.speaker = ctx.createGain(); // vai para a caixa de som
    this.speaker.gain.value = 0.9;
    this.output.connect(this.speaker).connect(ctx.destination);
    this.cache = new Map();
    this.voices = [];
  }

  buffer(midi) {
    if (this.cache.has(midi)) return this.cache.get(midi);
    const sr = this.ctx.sampleRate;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const len = Math.floor(sr * 3);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = sr / freq;
    const N = Math.floor(period);
    const frac = period - N; // atraso fracionário: mantém a afinação certa nas notas agudas
    const decay = 0.996 - Math.max(0, midi - 52) * 0.00015;
    let lp = 0;
    for (let i = 0; i <= N; i++) { lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5; d[i] = lp; }
    for (let i = N + 1; i < len; i++) {
      const a = d[i - N] * (1 - frac) + d[i - N - 1] * frac;
      const b = d[i - N - 1] * (1 - frac) + (d[i - N - 2] ?? 0) * frac;
      d[i] = decay * 0.5 * (a + b);
    }
    this.cache.set(midi, buf);
    return buf;
  }

  /** Toca as notas como uma batida para baixo (da corda mais grave para a mais aguda). */
  strum(notes) {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(0, now, 0.04); // abafa o acorde anterior
      v.src.stop(now + 0.3);
    }
    this.voices = notes.map((midi, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer(midi);
      const gain = this.ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain).connect(this.output);
      src.start(now + 0.02 + i * 0.022);
      return { src, gain };
    });
  }
}
