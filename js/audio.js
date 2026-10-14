// Escuta o microfone e transforma o som em um "cromagrama": quanto de cada uma
// das 12 notas (C, C#, D ... B) está soando agora, independente da oitava.

export class ChromaListener {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.chroma = new Float32Array(12);
    this.running = false;
  }

  /** Sem argumento usa o microfone; `sourceFactory(ctx)` permite ligar outra fonte (testes). */
  async start(sourceFactory) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    let source;
    if (sourceFactory) {
      source = sourceFactory(this.ctx);
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      source = this.ctx.createMediaStreamSource(this.stream);
    }

    const an = this.ctx.createAnalyser();
    an.fftSize = 16384; // ~3 Hz por faixa a 48 kHz: dá para separar semitons nos graves
    an.smoothingTimeConstant = 0;
    an.minDecibels = -120;
    an.maxDecibels = 0;
    source.connect(an);
    this.analyser = an;

    const n = an.frequencyBinCount;
    const binHz = this.ctx.sampleRate / an.fftSize;
    this.lo = Math.ceil(75 / binHz); // ~ D2 (a corda mais grave é E2 = 82 Hz)
    this.hi = Math.min(n - 2, Math.floor(1500 / binHz));
    this.binHz = binHz;
    this.freq = new Float32Array(n);
    this.time = new Float32Array(an.fftSize);
    this.raw = new Float32Array(12);
    this.running = true;
    this.timer = setInterval(() => this.tick(), 50);
  }

  tick() {
    const an = this.analyser;
    an.getFloatTimeDomainData(this.time);
    let sum = 0;
    const t = this.time;
    for (let i = t.length - 2048; i < t.length; i++) sum += t[i] * t[i];
    const rms = Math.sqrt(sum / 2048);

    an.getFloatFrequencyData(this.freq);
    const f = this.freq;
    let maxDb = -Infinity;
    for (let k = this.lo; k <= this.hi; k++) if (f[k] > maxDb) maxDb = f[k];
    const floor = maxDb - 45;

    // picos do espectro, com a frequência refinada por interpolação parabólica
    const peaks = [];
    for (let k = this.lo; k <= this.hi; k++) {
      const v = f[k];
      if (v > floor && v >= f[k - 1] && v > f[k + 1]) {
        const den = f[k - 1] - 2 * v + f[k + 1];
        const delta = den ? (0.5 * (f[k - 1] - f[k + 1])) / den : 0;
        peaks.push({ hz: (k + delta) * this.binHz, a: v - floor });
      }
    }

    // Uma corda também soa 2x, 3x, 4x... a sua frequência (harmônicos). O 3º e o 5º
    // harmônicos caem em notas que não são do acorde (ex.: o Mi gera um Si), então
    // um pico que é harmônico de um pico mais grave e forte vale bem menos.
    const raw = this.raw;
    raw.fill(0);
    for (const p of peaks) {
      let w = 1;
      for (const q of peaks) {
        if (q.hz >= p.hz * 0.9) break;
        const h = Math.round(p.hz / q.hz);
        if (h >= 2 && h <= 6 && Math.abs(p.hz / q.hz - h) < 0.025 * h && q.a >= p.a - 12) { w = 0.25; break; }
      }
      const midi = 69 + 12 * Math.log2(p.hz / 440);
      const r = Math.round(midi);
      raw[((r % 12) + 12) % 12] += w * Math.cos(((midi - r) * Math.PI) / 2) ** 2 * p.a;
    }
    let max = 0;
    for (let i = 0; i < 12; i++) if (raw[i] > max) max = raw[i];
    if (max > 0) for (let i = 0; i < 12; i++) raw[i] /= max;
    for (let i = 0; i < 12; i++) this.chroma[i] = 0.55 * this.chroma[i] + 0.45 * raw[i];

    this.onFrame({ chroma: this.chroma, rms, time: performance.now() });
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.ctx?.close();
    this.chroma.fill(0);
  }
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
