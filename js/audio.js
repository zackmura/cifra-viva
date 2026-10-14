// O "ouvido" do site.
//  - cromagrama: quanto de cada uma das 12 notas (C, C# ... B) está soando (para acordes)
//  - altura (YIN): qual nota única está soando (para tablatura e afinador)

const FFT_SIZE = 16384; // ~3 Hz por faixa a 48 kHz: dá para separar semitons nos graves

/**
 * Transforma um espectro (em dB) no cromagrama. Usa só os picos e desconta os
 * harmônicos: uma corda também soa 2x, 3x, 4x... a sua frequência, e o 3º e o 5º
 * harmônicos caem em notas que não são do acorde (ex.: o Mi gera um Si).
 */
export function chromaFromSpectrum(f, binHz, out) {
  const lo = Math.ceil(75 / binHz); // ~ D2 (a corda mais grave é E2 = 82 Hz)
  const hi = Math.min(f.length - 2, Math.floor(1500 / binHz));
  let maxDb = -Infinity;
  for (let k = lo; k <= hi; k++) if (f[k] > maxDb) maxDb = f[k];
  const floor = maxDb - 45;

  const peaks = [];
  for (let k = lo; k <= hi; k++) {
    const v = f[k];
    if (v > floor && v >= f[k - 1] && v > f[k + 1]) {
      const den = f[k - 1] - 2 * v + f[k + 1];
      const delta = den ? (0.5 * (f[k - 1] - f[k + 1])) / den : 0; // interpolação parabólica
      peaks.push({ hz: (k + delta) * binHz, a: v - floor });
    }
  }

  out.fill(0);
  for (const p of peaks) {
    let w = 1;
    for (const q of peaks) {
      if (q.hz >= p.hz * 0.9) break;
      const h = Math.round(p.hz / q.hz);
      if (h >= 2 && h <= 6 && Math.abs(p.hz / q.hz - h) < 0.025 * h && q.a >= p.a - 12) { w = 0.25; break; }
    }
    const midi = 69 + 12 * Math.log2(p.hz / 440);
    const r = Math.round(midi);
    out[((r % 12) + 12) % 12] += w * Math.cos(((midi - r) * Math.PI) / 2) ** 2 * p.a;
  }
  let max = 0;
  for (let i = 0; i < 12; i++) if (out[i] > max) max = out[i];
  if (max > 0) for (let i = 0; i < 12; i++) out[i] /= max;
  return out;
}

/**
 * Detecta a altura de uma nota única (algoritmo YIN).
 * Retorna { hz, midi, clarity } ou null. clarity perto de 1 = nota limpa.
 */
const yinBuf = new Float32Array(2048);
export function detectPitch(buf, sampleRate) {
  const half = yinBuf.length;
  const N = Math.min(buf.length, half * 2);
  const start = buf.length - N;
  const d = yinBuf;
  const tauMin = Math.floor(sampleRate / 1400);
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / 65));
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < N / 2; i++) {
      const x = buf[start + i] - buf[start + i + tau];
      sum += x * x;
    }
    running += sum;
    d[tau] = running ? (sum * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < 0.15) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const a = d[tau - 1];
  const b = d[tau];
  const c = tau + 1 <= tauMax ? d[tau + 1] : b;
  const den = a - 2 * b + c;
  const better = den ? tau + (0.5 * (a - c)) / den : tau;
  const hz = sampleRate / better;
  return { hz, midi: 69 + 12 * Math.log2(hz / 440), clarity: 1 - b };
}

export class ChromaListener {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.chroma = new Float32Array(12);
    this.raw = new Float32Array(12);
    this.running = false;
  }

  /** Sem argumento usa o microfone; `sourceFactory(ctx)` liga outra fonte (violão virtual, testes). */
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
    an.fftSize = FFT_SIZE;
    an.smoothingTimeConstant = 0;
    an.minDecibels = -120;
    an.maxDecibels = 0;
    source.connect(an);
    this.analyser = an;
    this.binHz = this.ctx.sampleRate / an.fftSize;
    this.freq = new Float32Array(an.frequencyBinCount);
    this.time = new Float32Array(an.fftSize);
    this.running = true;
    this.timer = setInterval(() => this.tick(), 50);
  }

  tick() {
    const an = this.analyser;
    an.getFloatTimeDomainData(this.time);
    const t = this.time;
    let sum = 0;
    for (let i = t.length - 2048; i < t.length; i++) sum += t[i] * t[i];
    const rms = Math.sqrt(sum / 2048);

    an.getFloatFrequencyData(this.freq);
    chromaFromSpectrum(this.freq, this.binHz, this.raw);
    for (let i = 0; i < 12; i++) this.chroma[i] = 0.55 * this.chroma[i] + 0.45 * this.raw[i];

    const pitch = rms > 0.002 ? detectPitch(t, this.ctx.sampleRate) : null;
    this.onFrame({ chroma: this.chroma, rms, pitch, time: performance.now() });
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

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1);

// ---------- análise de um arquivo de áudio inteiro (importar música) ----------

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const ai = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j + len / 2] = re[i + j] - ar;
        im[i + j + len / 2] = im[i + j] - ai;
        re[i + j] += ar;
        im[i + j] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * Calcula o cromagrama de um áudio inteiro, de `hop` em `hop` segundos.
 * Retorna [{ t, chroma, rms }]. `onProgress(0..1)` para a barra de progresso.
 */
export async function analyzeAudioBuffer(audioBuffer, hop = 0.2, onProgress) {
  const sr = audioBuffer.sampleRate;
  const len = audioBuffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += ch[i] / audioBuffer.numberOfChannels;
  }
  const n = sr > 32000 ? FFT_SIZE : FFT_SIZE / 2;
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const db = new Float32Array(n / 2);
  const frames = [];
  const step = Math.floor(hop * sr);
  for (let pos = 0, k = 0; pos + n <= len; pos += step, k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = mono[pos + i];
      re[i] = v * win[i];
      im[i] = 0;
      sum += v * v;
    }
    fftInPlace(re, im);
    for (let i = 0; i < n / 2; i++) db[i] = 10 * Math.log10((re[i] * re[i] + im[i] * im[i]) / (n * n) + 1e-14);
    frames.push({ t: (pos + n / 2) / sr, rms: Math.sqrt(sum / n), chroma: chromaFromSpectrum(db, sr / n, new Float32Array(12)) });
    if (k % 25 === 0) {
      onProgress?.(pos / len);
      await new Promise((r) => setTimeout(r)); // deixa a tela respirar
    }
  }
  onProgress?.(1);
  return frames;
}
