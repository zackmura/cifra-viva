// ARQUIVO GERADO por build.js — edite os arquivos em js/ e rode "node build.js".
(() => {
'use strict';
// ===== js/chords.js =====
// Teoria de acordes: reconhecer nomes, transpor e montar o "perfil de notas" de cada acorde.

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

const CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;
// Sufixos aceitos: m, 7, 7M, maj7, dim, °, aug, +, sus4, 4, 9, add9, (b5), (9), etc.
const QUALITY_RE = /^(?:maj|min|dim|aug|sus|add|m|M|º|°|ø|\+|-|\d|\(|\)|#|b|,)*$/;

function isChord(token) {
  const m = CHORD_RE.exec(token);
  return !!m && QUALITY_RE.test(m[2]);
}

function parseChord(name) {
  const m = CHORD_RE.exec(name);
  if (!m || !QUALITY_RE.test(m[2])) return null;
  const root = NOTE_INDEX[m[1]];
  const quality = m[2];
  const bass = m[3] ? NOTE_INDEX[m[3]] : null;
  return { name, rootName: m[1], root, quality, bassName: m[3] || null, bass, ...intervals(quality) };
}

function intervals(q) {
  let third = 4;
  let fifth = 7;
  const ext = [];
  if (/^(m(?!aj)|min|-)/.test(q)) third = 3;
  if (/dim|°|º/.test(q)) {
    third = 3;
    fifth = 6;
    if (/7/.test(q)) ext.push(9);
  } else if (/ø|b5/.test(q)) {
    fifth = 6;
  }
  if (/aug|\+|#5/.test(q)) fifth = 8;
  if (/sus2/.test(q)) third = 2;
  else if (/sus|(^|[^1\d])4/.test(q)) third = 5; // E4 = Esus4 na notação brasileira
  if (/7M|maj7|M7|maj/.test(q)) ext.push(11);
  else if (/7/.test(q) && !/dim|°|º/.test(q)) ext.push(10);
  if (/(^|[^1b#\d])6/.test(q)) ext.push(9);
  if (/9/.test(q)) ext.push(/b9/.test(q) ? 1 : 2);
  return { third, fifth, ext };
}

function pitchClasses(chord) {
  const pcs = [chord.root, (chord.root + chord.third) % 12, (chord.root + chord.fifth) % 12];
  for (const e of chord.ext) pcs.push((chord.root + e) % 12);
  return pcs;
}

/** Vetor de 12 posições (C..B) com o peso esperado de cada nota quando o acorde soa. */
function chordTemplate(chord) {
  const t = new Float32Array(12);
  t[chord.root] += 1;
  t[(chord.root + chord.third) % 12] += 0.85;
  t[(chord.root + chord.fifth) % 12] += 0.8;
  for (const e of chord.ext) t[(chord.root + e) % 12] += 0.45;
  if (chord.bass !== null) t[chord.bass] += 0.6;
  return t;
}

function transposeNote(note, semis, preferFlat) {
  const idx = (NOTE_INDEX[note] + semis + 1200) % 12;
  return (preferFlat ? NOTES_FLAT : NOTES_SHARP)[idx];
}

function transposeChord(name, semis) {
  if (!semis) return name;
  const c = parseChord(name);
  if (!c) return name;
  const preferFlat = c.rootName.includes('b');
  const root = transposeNote(c.rootName, semis, preferFlat);
  const bass = c.bassName ? '/' + transposeNote(c.bassName, semis, preferFlat) : '';
  return root + c.quality + bass;
}

/** Acordes maiores e menores das 12 notas, para mostrar "o que estou ouvindo". */
const COMMON_CHORDS = NOTES_SHARP.flatMap((n) => [n, n + 'm']).map((name) => {
  const c = parseChord(name);
  return { name, tpl: chordTemplate(c) };
});

// ===== js/sheet.js =====
// Lê a cifra em texto. Aceita dois formatos (podem até se misturar):
//  1) acordes numa linha acima da letra (como nos sites de cifra)
//  2) acordes entre colchetes dentro da letra: "[G]Saio cedo pela [D]estrada"


const SECTION_RE = /^(intro|introdução|introducao|verso|estrofe|refrão|refrao|pré-refrão|pre-refrão|pre-refrao|ponte|solo|final|outro|coda|interlúdio|interludio|parte\s*\d+|primeira parte|segunda parte|terceira parte)\s*:?$/i;
const NOISE_TOKEN = /^(\|+|x\d+|\(x\d+\)|-+|\.+|%|\(|\))$/i;

function isChordLine(line) {
  const toks = line.trim().split(/\s+/);
  let chords = 0;
  for (const t of toks) {
    if (isChord(t)) chords++;
    else if (!NOISE_TOKEN.test(t)) return false;
  }
  return chords > 0;
}

function chordsWithColumns(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) if (isChord(m[0])) out.push({ name: m[0], col: m.index });
  return out;
}

function mergeChordsIntoLyric(chords, lyric) {
  const need = chords[chords.length - 1].col + 1;
  if (lyric.length < need) lyric = lyric.padEnd(need, ' ');
  const segs = [];
  if (chords[0].col > 0) segs.push({ chord: null, text: lyric.slice(0, chords[0].col) });
  chords.forEach((c, j) => {
    const end = j + 1 < chords.length ? chords[j + 1].col : lyric.length;
    segs.push({ chord: c.name, text: lyric.slice(c.col, end) || ' ' });
  });
  return segs;
}

function parseBracketLine(line) {
  const segs = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let pending = null;
  let m;
  while ((m = re.exec(line))) {
    if (!isChord(m[1])) continue;
    const text = line.slice(last, m.index);
    if (text || pending) segs.push({ chord: pending, text: text || ' ' });
    pending = m[1];
    last = m.index + m[0].length;
  }
  const rest = line.slice(last);
  if (rest || pending) segs.push({ chord: pending, text: rest || ' ' });
  return segs;
}

function sectionName(line) {
  const t = line.trim();
  const b = /^\[([^\]]+)\]$/.exec(t);
  if (b && !isChord(b[1])) return b[1];
  if (SECTION_RE.test(t)) return t.replace(/:$/, '');
  return null;
}

// ---------- tablatura ----------
// Linha de tablatura: "e|---0---3---|", "B|-1-----|", "|--2--" ... (com pelo menos 3 traços)
const TAB_LINE = /^\s*([eBGDAEbgda])?\s*[|:]?[-\d|:hpbrsx~/\\().*=]+\s*$/;
const isTabLine = (l) => TAB_LINE.test(l) && (l.match(/-/g) || []).length >= 3;

/** Lê 6 linhas de tablatura (1ª corda em cima). Retorna as notas por coluna. */
function parseTab(lines) {
  const body = lines.map((l) => {
    const m = /^\s*([eBGDAEbgda])?\s*([|:]?)/.exec(l);
    return { label: (m[1] || '').trim(), text: l.slice(m[0].length).trimEnd() };
  });
  const columns = new Map(); // coluna -> [{s, fret}]
  body.forEach((line, k) => {
    const s = 5 - k; // 1ª linha = 1ª corda (mi agudo) = índice 5
    const re = /\d+/g;
    let m;
    while ((m = re.exec(line.text))) {
      const fret = parseInt(m[0], 10);
      if (fret > 24) continue;
      if (!columns.has(m.index)) columns.set(m.index, []);
      columns.get(m.index).push({ s, fret, len: m[0].length });
    }
  });
  const notes = [...columns.entries()].sort((a, b) => a[0] - b[0]).map(([col, list]) => ({ col, list }));
  return { lines: body, notes };
}

/**
 * Retorna linhas do tipo:
 *  {type:'section', text} | {type:'lyric', segments:[{chord, text}]} | {type:'chords', chords:[]} | {type:'blank'}
 *  | {type:'tab', lines:[{label, text}], notes:[{col, list:[{s, fret, len}]}]}
 */
function parseSheet(text) {
  const lines = text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim()) {
      if (rows.length && rows[rows.length - 1].type !== 'blank') rows.push({ type: 'blank' });
      continue;
    }

    // bloco de tablatura: 6 linhas seguidas
    if (isTabLine(line) && i + 5 < lines.length && lines.slice(i, i + 6).every(isTabLine)) {
      rows.push({ type: 'tab', ...parseTab(lines.slice(i, i + 6)) });
      i += 5;
      continue;
    }

    const section = sectionName(line);
    if (section) {
      rows.push({ type: 'section', text: section });
      continue;
    }

    // "[Intro] G D Em C" -> seção + linha de acordes
    const label = /^\s*\[([^\]]+)\]\s*/.exec(line);
    if (label && !isChord(label[1])) {
      rows.push({ type: 'section', text: label[1] });
      line = ' '.repeat(label[0].length) + line.slice(label[0].length);
    }

    const hasBracketChord = [...line.matchAll(/\[([^\]]+)\]/g)].some((m) => isChord(m[1]));
    if (hasBracketChord) {
      rows.push({ type: 'lyric', segments: parseBracketLine(line.trimEnd()) });
    } else if (isChordLine(line)) {
      const chords = chordsWithColumns(line);
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !sectionName(next) && !/\[[^\]]+\]/.test(next)) {
        rows.push({ type: 'lyric', segments: mergeChordsIntoLyric(chords, next.trimEnd()) });
        i++;
      } else {
        rows.push({ type: 'chords', chords: chords.map((c) => c.name) });
      }
    } else {
      rows.push({ type: 'lyric', segments: [{ chord: null, text: line.trimEnd() }] });
    }
  }
  while (rows.length && rows[rows.length - 1].type === 'blank') rows.pop();
  return rows;
}

// ===== js/audio.js =====
// O "ouvido" do site.
//  - cromagrama: quanto de cada uma das 12 notas (C, C# ... B) está soando (para acordes)
//  - altura (YIN): qual nota única está soando (para tablatura e afinador)

const FFT_SIZE = 16384; // ~3 Hz por faixa a 48 kHz: dá para separar semitons nos graves

/**
 * Transforma um espectro (em dB) no cromagrama. Usa só os picos e desconta os
 * harmônicos: uma corda também soa 2x, 3x, 4x... a sua frequência, e o 3º e o 5º
 * harmônicos caem em notas que não são do acorde (ex.: o Mi gera um Si).
 */
function chromaFromSpectrum(f, binHz, out) {
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
function detectPitch(buf, sampleRate) {
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

class ChromaListener {
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

function cosine(a, b) {
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1);

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
async function analyzeAudioBuffer(audioBuffer, hop = 0.2, onProgress) {
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

// ===== js/follower.js =====
// Acompanha a música como um jogo (estilo Guitar Hero):
//  - "alvo" é o acorde (ou a nota da tablatura) que você precisa tocar agora;
//  - acertou o alvo  -> 'hit'   (a música anda)
//  - repetiu o acorde que já está tocando (ritmo) -> 'strum' (nada anda)
//  - tocou outra coisa -> 'miss' (nada anda)
// Acordes iguais seguidos na cifra (C ... C) contam como um só: você só continua batendo.
// Notas de tablatura nunca se juntam: cada nota precisa de uma palhetada nova.


class Follower {
  constructor(events, onEvent) {
    this.events = events; // [{kind:'chord', name, tpl} | {kind:'note', name, midi}]
    this.onEvent = onEvent;
    this.pos = 0; // o que está tocando (ou o primeiro, antes de começar)
    this.started = false;
    this.evidence = 0;
    this.env = 0; // envelope de volume, para perceber cada batida
    this.lastOnset = 0;
    this.onset = null;
    this.armed = false; // nota: só uma nota por palhetada
    const seen = new Set();
    this.rivals = [...COMMON_CHORDS, ...events.filter((e) => e.kind === 'chord')]
      .filter((c) => !seen.has(c.name) && seen.add(c.name));
    this.setSensitivity(5);
  }

  /** 1 (cauteloso) a 10 (muito sensível). */
  setSensitivity(s) {
    this.margin = 0.13 - s * 0.011;
    this.needFrames = Math.round(9 - s * 0.6);
    this.minSim = 0.62 - s * 0.012;
    this.minClarity = 0.86 - s * 0.012;
  }

  similar(a, b) {
    return a.kind === 'chord' && b.kind === 'chord' && cosine(a.tpl, b.tpl) > 0.9; // C e C7M, G e G/B
  }

  /** Próximo evento depois de i, pulando acordes repetidos (C ... C). -1 no fim. */
  nextIndex(i = this.pos) {
    const ev = this.events;
    let j = i + 1;
    while (j < ev.length && this.similar(ev[j], ev[i])) j++;
    return j < ev.length ? j : -1;
  }

  target() {
    return this.started ? this.nextIndex() : this.pos;
  }

  setPosition(i) {
    this.pos = Math.max(0, Math.min(this.events.length - 1, i));
    this.started = false;
    this.evidence = 0;
    this.onset = null;
    this.onEvent({ type: 'move', pos: this.pos });
  }

  bestRival(chroma) {
    let best = null;
    let s = 0;
    for (const r of this.rivals) {
      const v = cosine(chroma, r.tpl);
      if (v > s) { s = v; best = r; }
    }
    return { chord: best, s };
  }

  hit(ti) {
    if (this.started) this.pos = ti;
    this.started = true;
    this.evidence = 0;
    this.armed = false;
    if (this.onset) this.onset.decided = true;
    this.onEvent({ type: 'hit', pos: this.pos });
  }

  update(chroma, rms, now, noise, pitch) {
    // cada batida/palhetada é um salto de volume
    if (rms > noise * 1.5 && rms > this.env * 1.5 && now - this.lastOnset > 120) {
      this.lastOnset = now;
      this.onset = { frames: 0, decided: false };
      this.armed = true;
      this.onEvent({ type: 'onset', time: now });
    }
    this.env = Math.max(rms, this.env * 0.85);
    if (rms <= noise) { this.evidence = 0; return; }

    const ev = this.events;
    const ti = this.target();
    const tgt = ti >= 0 ? ev[ti] : null;
    const cur = this.started ? ev[this.pos] : null;

    if (tgt && tgt.kind === 'note') {
      this.updateNote(tgt, ti, cur, pitch);
      return;
    }

    const sT = tgt ? cosine(chroma, tgt.tpl) : 0;
    const sC = cur && cur.kind === 'chord' ? cosine(chroma, cur.tpl) : 0;
    const best = this.bestRival(chroma);

    // acertou: parece mais com o alvo do que com o acorde atual e com qualquer outro
    const hitting = tgt && sT > this.minSim && sT > sC + this.margin && sT >= best.s - 0.04;
    this.evidence = hitting ? this.evidence + 1 : Math.max(0, this.evidence - 1);
    if (this.evidence >= this.needFrames) { this.hit(ti); return; }

    if (this.onset && !this.onset.decided && ++this.onset.frames >= this.needFrames + 3) {
      this.onset.decided = true;
      if (cur && cur.kind === 'chord' && sC > this.minSim && sC >= best.s - 0.05) {
        this.onEvent({ type: 'strum', pos: this.pos });
      } else if (best.chord && best.s > this.minSim && !(tgt && cosine(best.chord.tpl, tgt.tpl) > 0.9)) {
        this.onEvent({ type: 'miss', heard: best.chord.name, expected: tgt?.name || null });
      }
    }
  }

  updateNote(tgt, ti, cur, pitch) {
    const clear = pitch && pitch.clarity > this.minClarity;
    // aceita a nota certa (e a mesma nota uma oitava acima/abaixo, comum no microfone)
    const diff = clear ? pitch.midi - tgt.midi : 99;
    const right = clear && (Math.abs(diff) < 0.5 || Math.abs(Math.abs(diff) - 12) < 0.5);
    this.evidence = right ? this.evidence + 1 : 0;
    if (right && this.armed && this.evidence >= Math.max(2, Math.round(this.needFrames / 2))) {
      this.hit(ti);
      return;
    }
    if (this.onset && !this.onset.decided && ++this.onset.frames >= this.needFrames) {
      this.onset.decided = true;
      if (!clear) return;
      const same = cur && cur.kind === 'note' && Math.abs(pitch.midi - cur.midi) < 0.5;
      if (same) this.onEvent({ type: 'strum', pos: this.pos });
      else if (!right) this.onEvent({ type: 'miss', heard: noteName(pitch.midi), expected: tgt.name });
    }
  }
}

// ===== js/songs.js =====
// Catálogo inicial do Cifra Viva.
//  - Originais: letras escritas para o site.
//  - Folclore / domínio público: letras tradicionais, sem autor protegido.
//  - Populares: só acordes e estrutura (a letra tem direito autoral); use "Colar letra"
//    para completar com a sua cópia pessoal. Acordes de referência — confira o tom.
//
// Campos: genre, level (1 fácil · 2 médio · 3 difícil), key, bpm, strum (8 colcheias:
// D = para baixo, U = para cima, - = pausa), capo, chordsOnly.

/** Monta uma tablatura a partir de notas "corda+casa": "e0 B3 G2+B1 | ..." */
function tab(seq) {
  const names = ['e', 'B', 'G', 'D', 'A', 'E'];
  const lines = names.map((n) => n + '|-');
  for (const tok of seq.trim().split(/\s+/)) {
    if (tok === '|') { for (let i = 0; i < 6; i++) lines[i] += '|-'; continue; }
    const notes = Object.fromEntries(tok.split('+').map((p) => [p[0], p.slice(1)]));
    const w = Math.max(...Object.values(notes).map((f) => f.length));
    for (let i = 0; i < 6; i++) lines[i] += (notes[names[i]] ?? '').padEnd(w, '-') + '-';
  }
  return lines.map((l) => l + '|').join('\n');
}

const GENRES = [
  { id: 'rock', name: 'Rock', icon: '🎸' },
  { id: 'pop', name: 'Pop', icon: '🎤' },
  { id: 'mpb', name: 'MPB', icon: '🌴' },
  { id: 'sertanejo', name: 'Sertanejo', icon: '🤠' },
  { id: 'folk', name: 'Folk', icon: '🌾' },
  { id: 'infantil', name: 'Infantil e Folclore', icon: '🎈' },
  { id: 'gospel', name: 'Gospel e Hinos', icon: '🙏' },
  { id: 'exercicios', name: 'Exercícios', icon: '🏋️' },
];

const DEMO_SONGS = [
  // ---------------- originais ----------------
  {
    id: 'demo-estrada', title: 'Estrada de Terra', artist: 'Cifra Viva (original)',
    genre: 'sertanejo', level: 1, key: 'G', bpm: 92, strum: 'D-DU-UDU',
    text: `[Intro] G  D  Em  C

[Primeira parte]
G                    D
Saio cedo pela estrada de terra
Em                  C
O sol nascendo atrás da serra
G                 D
Levo no peito uma canção
Em                C
E o violão na minha mão

[Refrão]
C           G
Toca, toca devagar
D                  Em
Que a letra sobe sem parar
C            G
Cada acorde é um degrau
D                  G
Até o fim do meu sarau

[Segunda parte]
G                    D
Passa a cerca, passa o rio
Em                    C
O vento canta um assobio
G                   D
Quem tem música não tem pressa
Em                   C
Cada verso é uma promessa

[Refrão]
C           G
Toca, toca devagar
D                  Em
Que a letra sobe sem parar
C            G
Cada acorde é um degrau
D                  G
Até o fim do meu sarau

[Final] C  D  G`,
  },
  {
    id: 'demo-varanda', title: 'Café na Varanda', artist: 'Cifra Viva (original)',
    genre: 'mpb', level: 1, key: 'C', bpm: 84, strum: 'D-D-UDU-',
    text: `[Intro] [C] [Am] [F] [G]

[Verso]
[C]Chove fino lá fora, [Am]o café tá no fogão
[F]Minha avó conta histórias, [G]eu dedilho o violão
[C]A janela embaçada, [Am]um desenho com a mão
[F]Toda tarde é sagrada [G]quando tem essa canção

[Refrão]
[F]Fica mais um [G]pouco
[C]Que a chuva vai [Am]passar
[F]O tempo aqui é [G]outro
[C]Ninguém precisa [G]apressar

[Final] [F] [G] [C]`,
  },
  {
    id: 'demo-riff', title: 'Riff do Iniciante', artist: 'Cifra Viva (exercício original)',
    genre: 'exercicios', level: 1, key: 'E', bpm: 90,
    text: `[Riff — cordas graves, uma nota por vez]
${tab('E0 E3 A0 A2 | E0 E3 A0 A2 | D0 D2 A2 A0 | E3 E0 E3 A0')}

[Riff com acordes]
E5   A5   E5   D5

[Riff final]
${tab('A0 A2 D0 D2 | A2 A0 E3 E0')}`,
  },
  {
    id: 'demo-dedilhado', title: 'Dedilhado da Manhã', artist: 'Cifra Viva (exercício original)',
    genre: 'exercicios', level: 2, key: 'Am', bpm: 70,
    text: `[Dedilhado — toque nota por nota]
${tab('A0 G2 B1 G2 | A3 G0 B1 G0 | D0 G2 B3 G2 | E1 G2 B1 G2')}

[Mesmos acordes, agora batendo]
Am   C   D   F   Am`,
  },

  // -------- melodias de domínio público (tablatura) --------
  {
    id: 'pd-ode', title: 'Ode à Alegria (melodia)', artist: 'Ludwig van Beethoven (domínio público)',
    genre: 'exercicios', level: 1, key: 'C', bpm: 100,
    text: `[Primeira frase]
${tab('e0 e0 e1 e3 | e3 e1 e0 B3 | B1 B1 B3 e0 | e0 B3 B3')}

[Segunda frase]
${tab('e0 e0 e1 e3 | e3 e1 e0 B3 | B1 B1 B3 e0 | B3 B1 B1')}`,
  },
  {
    id: 'pd-parabens', title: 'Parabéns a Você (melodia)', artist: 'Tradicional (melodia em domínio público)',
    genre: 'infantil', level: 1, key: 'C', bpm: 100,
    text: `[Melodia]
${tab('G0 G0 G2 G0 B1 B0 | G0 G0 G2 G0 B3 B1')}
${tab('G0 G0 e3 e0 B1 B0 G2 | e1 e1 e0 B1 B3 B1')}

[Acompanhamento]
C   G7   G7   C   C   F   C G7   C`,
  },
  {
    id: 'pd-brilha', title: 'Brilha, Brilha, Estrelinha (melodia)', artist: 'Tradicional (domínio público)',
    genre: 'infantil', level: 1, key: 'C', bpm: 96,
    text: `[Melodia]
${tab('B1 B1 e3 e3 e5 e5 e3 | e1 e1 e0 e0 B3 B3 B1')}
${tab('e3 e3 e1 e1 e0 e0 B3 | e3 e3 e1 e1 e0 e0 B3')}
${tab('B1 B1 e3 e3 e5 e5 e3 | e1 e1 e0 e0 B3 B3 B1')}`,
  },

  // -------- folclore brasileiro (letras tradicionais) --------
  {
    id: 'pd-ciranda', title: 'Ciranda, Cirandinha', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 104, strum: 'D-DUD-DU',
    text: `C                    G7
Ciranda, cirandinha, vamos todos cirandar
G7                      C
Vamos dar a meia volta, volta e meia vamos dar

C                         G7
O anel que tu me deste era vidro e se quebrou
G7                           C
O amor que tu me tinhas era pouco e se acabou`,
  },
  {
    id: 'pd-cravo', title: 'O Cravo e a Rosa', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 96, strum: 'D-DUD-DU',
    text: `C                      G7
O cravo brigou com a rosa debaixo de uma sacada
G7                       C
O cravo saiu ferido e a rosa despedaçada

C                     G7
O cravo ficou doente, a rosa foi visitar
G7                       C
O cravo teve um desmaio e a rosa pôs-se a chorar`,
  },
  {
    id: 'pd-marcha', title: 'Marcha Soldado', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 110, strum: 'D-D-D-D-',
    text: `C                   G7
Marcha soldado, cabeça de papel
G7                      C
Se não marchar direito vai preso pro quartel

C                    G7
O quartel pegou fogo, a polícia deu sinal
G7                         C
Acode, acode, acode a bandeira nacional`,
  },
  {
    id: 'pd-peixe', title: 'Peixe Vivo', artist: 'Folclore mineiro',
    genre: 'infantil', level: 1, key: 'G', bpm: 92, strum: 'D-DUD-DU',
    text: `G                      D7
Como pode o peixe vivo viver fora da água fria?
D7                     G
Como pode o peixe vivo viver fora da água fria?

G                        C
Como poderei viver, como poderei viver
G              D7               G
Sem a tua, sem a tua, sem a tua companhia?`,
  },
  {
    id: 'pd-amazing', title: 'Amazing Grace', artist: 'John Newton, 1779 (domínio público)',
    genre: 'gospel', level: 1, key: 'G', bpm: 72, strum: 'D--D-U',
    text: `G            G7         C       G
Amazing grace, how sweet the sound
G                     D
That saved a wretch like me
G              G7      C        G
I once was lost, but now am found
G        D      G
Was blind, but now I see`,
  },

  // -------- populares: só acordes e estrutura --------
  {
    id: 'pop-heaven', title: "Knockin' on Heaven's Door", artist: 'Bob Dylan', chordsOnly: true,
    genre: 'rock', level: 1, key: 'G', bpm: 69, strum: 'D-DU-UDU',
    text: `[Verso] G  D  Am7  Am7  G  D  C  C
[Verso] G  D  Am7  Am7  G  D  C  C
[Refrão] G  D  Am7  Am7  G  D  C  C
[Refrão] G  D  Am7  Am7  G  D  C  C`,
  },
  {
    id: 'pop-letitbe', title: 'Let It Be', artist: 'The Beatles', chordsOnly: true,
    genre: 'pop', level: 1, key: 'C', bpm: 72, strum: 'D-DU-UDU',
    text: `[Intro] C  G  Am  F  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Refrão] Am  G  F  C  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Refrão] Am  G  F  C  C  G  F  C`,
  },
  {
    id: 'pop-standbyme', title: 'Stand By Me', artist: 'Ben E. King', chordsOnly: true,
    genre: 'pop', level: 1, key: 'A', bpm: 118, strum: 'D-DU-UDU',
    text: `[Intro] A  F#m  D  E  A
[Verso] A  F#m  D  E  A
[Verso] A  F#m  D  E  A
[Refrão] A  F#m  D  E  A
[Refrão] A  F#m  D  E  A`,
  },
  {
    id: 'pop-wonderwall', title: 'Wonderwall', artist: 'Oasis', chordsOnly: true, capo: 2,
    genre: 'rock', level: 2, key: 'Em', bpm: 87, strum: 'DDDUDUDU',
    text: `[Intro] Em7  G  Dsus4  A7sus4
[Verso] Em7  G  Dsus4  A7sus4  Em7  G  Dsus4  A7sus4
[Pré-refrão] Cadd9  Dsus4  Em7  Cadd9  Dsus4  Em7  Cadd9  Dsus4  A7sus4
[Refrão] Cadd9  Em7  G  Em7  Cadd9  Em7  G  Em7  Cadd9  Em7  G  Em7`,
  },
  {
    id: 'pop-zombie', title: 'Zombie', artist: 'The Cranberries', chordsOnly: true,
    genre: 'rock', level: 1, key: 'Em', bpm: 84, strum: 'D-D-DUDU',
    text: `[Intro] Em  C  G  D
[Verso] Em  C  G  D  Em  C  G  D
[Refrão] Em  C  G  D  Em  C  G  D`,
  },
  {
    id: 'pop-imagine', title: 'Imagine', artist: 'John Lennon', chordsOnly: true,
    genre: 'pop', level: 1, key: 'C', bpm: 76, strum: 'D-D-D-D-',
    text: `[Verso] C  C7M  F  C  C7M  F
[Verso] C  C7M  F  C  C7M  F
[Ponte] F  Am  Dm  F  G  G7
[Refrão] F  G  C  E7  F  G  C  E7  F  G  C`,
  },
  {
    id: 'pop-wishyou', title: 'Wish You Were Here', artist: 'Pink Floyd', chordsOnly: true,
    genre: 'rock', level: 2, key: 'G', bpm: 60, strum: 'D-DU-UDU',
    text: `[Intro] Em7  G  Em7  G  Em7  A7sus4  Em7  A7sus4  G
[Verso] C  D/F#  Am  G  D/F#  C  Am  G`,
  },
  {
    id: 'pop-hallelujah', title: 'Hallelujah', artist: 'Leonard Cohen', chordsOnly: true,
    genre: 'folk', level: 2, key: 'C', bpm: 56, strum: 'D--DUD',
    text: `[Intro] C  Am  C  Am
[Verso] C  Am  C  Am  F  G  C  G
[Verso] C  F  G  Am  F  G  E7  Am
[Refrão] F  Am  F  C  G  C`,
  },
  {
    id: 'pop-alabama', title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', chordsOnly: true,
    genre: 'rock', level: 1, key: 'D', bpm: 98, strum: 'D-DU-UDU',
    text: `[Intro] D  Cadd9  G  G
[Verso] D  Cadd9  G  G  D  Cadd9  G  G
[Refrão] D  Cadd9  G  G  D  Cadd9  G  G`,
  },
  {
    id: 'pop-riptide', title: 'Riptide', artist: 'Vance Joy', chordsOnly: true,
    genre: 'folk', level: 1, key: 'Am', bpm: 101, strum: 'D-DU-UDU',
    text: `[Verso] Am  G  C  C  Am  G  C  C
[Refrão] Am  G  C  C  Am  G  C  C`,
  },
  {
    id: 'pop-browneyed', title: 'Brown Eyed Girl', artist: 'Van Morrison', chordsOnly: true,
    genre: 'pop', level: 1, key: 'G', bpm: 150, strum: 'D-DU-UDU',
    text: `[Intro] G  C  G  D
[Verso] G  C  G  D  G  C  G  D
[Pré-refrão] C  D  G  Em  C  D
[Refrão] G  C  G  D  G  C  G  D`,
  },
  {
    id: 'pop-rising', title: 'House of the Rising Sun', artist: 'Tradicional (versão The Animals)', chordsOnly: true,
    genre: 'folk', level: 2, key: 'Am', bpm: 76,
    text: `[Dedilhado de cada acorde (6/8)]
${tab('A0 G2 B1 e0 B1 G2 | A3 G0 B1 e0 B1 G0 | D0 G2 B3 e2 B3 G2 | D3 G2 B1 e1 B1 G2')}

[Verso] Am  C  D  F  Am  C  E  E
[Verso] Am  C  D  F  Am  E  Am  E`,
  },
];

// ===== js/guitar.js =====
// Formas de acorde no violão (afinação padrão). Primeiro vêm as formas "clássicas"
// conhecidas; depois o gerador encontra outras posições tocáveis para qualquer acorde.


const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (6ª corda -> 1ª)

const COMMON = {
  C: 'x32010', C7: 'x32310', Cm: 'x35543', C7M: 'x32000', 'C/G': '332010', 'C/E': '032010', C9: 'x32033',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', D7M: 'xx0222', D4: 'xx0233', Dsus4: 'xx0233', 'D/F#': '200232',
  E: '022100', Em: '022000', E7: '020100', Em7: '020000', E4: '022200', Esus4: '022200', E7M: '021100',
  F: '133211', Fm: '133111', F7: '131211', F7M: 'xx3210', 'F/C': 'x33211',
  G: '320003', Gm: '355333', G7: '320001', G7M: '320002', 'G/B': 'x20003',
  A: 'x02220', Am: 'x02210', A7: 'x02020', Am7: 'x02010', A7M: 'x02120', A4: 'x02230', Asus4: 'x02230', A9: 'x02420', 'Am/G': '3x2210',
  B: 'x24442', Bm: 'x24432', B7: 'x21202', Bm7: 'x20202',
  'F#': '244322', 'F#m': '244222', 'C#m': 'x46654', 'G#m': '466444', Bb: 'x13331', Eb: 'x68886', Ab: '466544',
  'C#': 'x46664', 'F#7': '242322', 'C#7': 'x46464', Gm7: '353333', Cm7: 'x35343', Fm7: '131111',
};

const parseShape = (s) => [...s].map((c) => (c === 'x' ? -1 : parseInt(c, 10)));

/** Decide pestana e dedos (1 = indicador ... 4 = mínimo). Retorna null se não dá para tocar. */
function fingering(frets) {
  const fretted = frets.map((f, s) => ({ f, s })).filter((x) => x.f > 0);
  const fingers = Array(6).fill(0);
  if (!fretted.length) return { fingers, barre: null };
  const min = Math.min(...fretted.map((x) => x.f));
  let barre = null;
  let rest = fretted;
  let next = 1;
  if (fretted.length > 4) {
    const atMin = fretted.filter((x) => x.f === min).map((x) => x.s);
    const from = Math.min(...atMin);
    const to = Math.max(...atMin);
    for (let s = from; s <= to; s++) if (frets[s] < min) return null; // corda solta/abafada no meio da pestana
    barre = { fret: min, from, to };
    rest = fretted.filter((x) => x.f > min);
    fretted.filter((x) => x.f === min).forEach((x) => { fingers[x.s] = 1; });
    next = 2;
  }
  if (rest.length > 5 - next) return null;
  rest.sort((a, b) => a.f - b.f || a.s - b.s).forEach((x) => { fingers[x.s] = next++; });
  return { fingers, barre };
}

function makeVoicing(frets) {
  const fg = fingering(frets);
  return fg && { frets, ...fg };
}

function generate(chord) {
  const pcs = new Set(pitchClasses(chord));
  const required = [chord.root, (chord.root + chord.third) % 12, ...chord.ext.map((e) => (chord.root + e) % 12)];
  const fifth = (chord.root + chord.fifth) % 12;
  const bassPc = chord.bass ?? chord.root;
  if (chord.bass !== null) pcs.add(chord.bass);
  const found = [];

  for (let base = 1; base <= 12; base++) {
    const opts = TUNING.map((open) => {
      const o = [-1];
      if (base <= 4 && pcs.has(open % 12)) o.push(0);
      for (let f = base; f <= base + 3; f++) if (pcs.has((open + f) % 12)) o.push(f);
      return o;
    });
    const frets = Array(6);
    const walk = (s) => {
      if (s < 6) { for (const f of opts[s]) { frets[s] = f; walk(s + 1); } return; }
      const sounded = [];
      for (let i = 0; i < 6; i++) if (frets[i] >= 0) sounded.push(i);
      if (sounded.length < 4) return;
      if (sounded[sounded.length - 1] - sounded[0] !== sounded.length - 1) return; // sem cordas abafadas no meio
      if ((TUNING[sounded[0]] + frets[sounded[0]]) % 12 !== bassPc) return; // baixo certo
      const notes = new Set(sounded.map((i) => (TUNING[i] + frets[i]) % 12));
      if (!required.every((p) => notes.has(p))) return;
      const pressed = sounded.map((i) => frets[i]).filter((f) => f > 0);
      if (pressed.length && Math.min(...pressed) !== base) return; // cada posição só uma vez
      if (!pressed.length && base > 1) return;
      const v = makeVoicing([...frets]);
      if (!v) return;
      const span = pressed.length ? Math.max(...pressed) - base : 0;
      const opens = sounded.filter((i) => frets[i] === 0).length;
      if (opens && pressed.length && Math.max(...pressed) > 4) return; // corda solta só na 1ª posição
      v.score = base * 2.5 + (6 - sounded.length) * 1.6 + span * 0.8 + (notes.has(fifth) ? 0 : 1.5)
        + (v.barre ? 1.5 : 0) - opens * 0.4 + pressed.length * 0.3;
      found.push(v);
    };
    walk(0);
  }

  // tira formas que são só "pedaços" de outra maior (mesmas casas, menos cordas)
  const key = (v) => v.frets.join(',');
  const kept = found.filter((a) => !found.some((b) => b !== a
    && b.frets.filter((f) => f >= 0).length > a.frets.filter((f) => f >= 0).length
    && a.frets.every((f, i) => f < 0 || b.frets[i] === f)));
  // variações em regiões diferentes do braço (no máx. 2 na 1ª posição e 1 nas demais)
  const seen = new Set();
  const perBase = {};
  return kept.sort((a, b) => a.score - b.score).filter((v) => {
    const pressed = v.frets.filter((f) => f > 0);
    const base = pressed.length ? Math.min(...pressed) : 1;
    const region = base <= 3 && v.frets.includes(0) ? 0 : base;
    perBase[region] = (perBase[region] || 0) + 1;
    if (seen.has(key(v)) || perBase[region] > (region === 0 ? 2 : 1)) return false;
    seen.add(key(v));
    return true;
  });
}

const cache = new Map();

/** Lista de formas para tocar o acorde, da mais comum para a menos comum. */
function voicingsFor(name) {
  if (cache.has(name)) return cache.get(name);
  const chord = parseChord(name);
  const list = [];
  if (COMMON[name]) {
    const v = makeVoicing(parseShape(COMMON[name]));
    if (v) list.push(v);
  }
  if (chord) {
    for (const v of generate(chord)) {
      if (list.length >= 8) break;
      if (!list.some((u) => u.frets.join() === v.frets.join())) list.push(v);
    }
  }
  cache.set(name, list);
  return list;
}

/** Notas MIDI que soam com essa forma (da 6ª para a 1ª corda). */
function voicingNotes(v) {
  return v.frets.map((f, i) => (f >= 0 ? TUNING[i] + f : null)).filter((n) => n !== null);
}

// ===== js/diagram.js =====
// Desenha o diagrama do acorde em SVG (cordas na vertical, 6ª corda à esquerda).

const FRETS_SHOWN = 4;

function diagramSVG(v, { size = 1 } = {}) {
  if (!v) return '<svg viewBox="0 0 80 100" class="diagram"><text x="40" y="55" text-anchor="middle" font-size="10" fill="currentColor">sem forma</text></svg>';
  const pressed = v.frets.filter((f) => f > 0);
  const maxF = pressed.length ? Math.max(...pressed) : 0;
  const minF = pressed.length ? Math.min(...pressed) : 1;
  const start = maxF <= FRETS_SHOWN ? 1 : minF; // casa mostrada no topo
  const W = 80;
  const H = 100;
  const left = 14;
  const top = 22;
  const gx = 10.4; // espaço entre cordas
  const gy = 17; // espaço entre trastes
  const x = (s) => left + s * gx;
  const y = (f) => top + (f - start + 0.5) * gy;
  const out = [];

  out.push(`<svg viewBox="0 0 ${W} ${H}" width="${W * size}" height="${H * size}" class="diagram" role="img">`);
  // pestana do braço (nut) ou número da casa
  if (start === 1) out.push(`<rect x="${left - 1}" y="${top - 3}" width="${gx * 5 + 2}" height="3.5" fill="currentColor"/>`);
  else out.push(`<text x="${left - 4}" y="${top + gy * 0.5 + 3.5}" text-anchor="end" font-size="9" fill="currentColor">${start}ª</text>`);
  for (let i = 0; i <= FRETS_SHOWN; i++) {
    out.push(`<line x1="${left}" x2="${x(5)}" y1="${top + i * gy}" y2="${top + i * gy}" stroke="currentColor" stroke-opacity=".45" stroke-width="1"/>`);
  }
  for (let s = 0; s < 6; s++) {
    out.push(`<line x1="${x(s)}" x2="${x(s)}" y1="${top}" y2="${top + FRETS_SHOWN * gy}" stroke="currentColor" stroke-opacity=".7" stroke-width="${1.4 - s * 0.12}"/>`);
    const f = v.frets[s];
    if (f < 0) out.push(`<text x="${x(s)}" y="${top - 7}" text-anchor="middle" font-size="8.5" fill="currentColor" opacity=".7">✕</text>`);
    if (f === 0) out.push(`<circle cx="${x(s)}" cy="${top - 10}" r="3" fill="none" stroke="currentColor" stroke-width="1.1"/>`);
  }
  if (v.barre) {
    const b = v.barre;
    out.push(`<rect x="${x(b.from) - 4.5}" y="${y(b.fret) - 4.5}" width="${x(b.to) - x(b.from) + 9}" height="9" rx="4.5" class="dot"/>`);
    out.push(`<text x="${(x(b.from) + x(b.to)) / 2}" y="${y(b.fret) + 3}" text-anchor="middle" font-size="7.5" class="finger">1</text>`);
  }
  for (let s = 0; s < 6; s++) {
    const f = v.frets[s];
    if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) continue;
    out.push(`<circle cx="${x(s)}" cy="${y(f)}" r="4.5" class="dot"/>`);
    if (v.fingers[s]) out.push(`<text x="${x(s)}" y="${y(f) + 2.8}" text-anchor="middle" font-size="7.5" class="finger">${v.fingers[s]}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

// ===== js/synth.js =====
// Violão sintetizado (algoritmo Karplus-Strong: um ruído curto que "vibra" como corda).

class VirtualGuitar {
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

// ===== js/guitarview.js =====
// Braço do violão (visto de frente, mão do acorde à esquerda). Mostra onde ficam os
// dedos do acorde e as cordas vibram a cada batida.

const NUT = 74; // x da pestana do braço (osso)
const WIDTHS = [128, 120, 113, 106, 100]; // casas ficam mais estreitas, como no violão de verdade
const FRETS = WIDTHS.length;
const W = 700;
const TOP = 22;
const BOTTOM = 148;
const SY = (s) => TOP + 13 + s * 20; // 6ª corda (mais grave) em cima, como você vê olhando para o braço

function fretX(k) {
  let x = NUT;
  for (let i = 0; i < k; i++) x += WIDTHS[i];
  return x;
}
const CX = (f, start) => (fretX(f - start) + fretX(f - start + 1)) / 2;

function neckSVG() {
  const frets = Array.from({ length: FRETS }, (_, i) => {
    const x = fretX(i + 1);
    return `<rect x="${x - 2.5}" y="${TOP}" width="5" height="${BOTTOM - TOP}" fill="url(#gv-fretwire)"/>`;
  }).join('');
  const strings = [0, 1, 2, 3, 4, 5].map((s) => {
    const w = 3.4 - s * 0.42;
    return `<line class="gv-shadow" x1="58" x2="${W}" y1="${SY(s) + 2.2}" y2="${SY(s) + 2.2}" stroke-width="${w}"/>`
      + `<line class="gv-string ${s < 3 ? 'wound' : 'plain'}" x1="40" x2="${W}" y1="${SY(s)}" y2="${SY(s)}" stroke-width="${w}"/>`;
  }).join('');
  const pegs = [0, 1, 2].map((i) => `<ellipse cx="${16 + i * 17}" cy="9" rx="6" ry="5" class="gv-peg"/><ellipse cx="${16 + i * 17}" cy="161" rx="6" ry="5" class="gv-peg"/>`).join('');
  return `
<svg viewBox="0 0 ${W} 172" class="gv" role="img" aria-label="Braço do violão">
  <defs>
    <linearGradient id="gv-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#24150c"/><stop offset=".18" stop-color="#3f2717"/>
      <stop offset=".5" stop-color="#4b2f1c"/><stop offset=".82" stop-color="#3f2717"/><stop offset="1" stop-color="#24150c"/>
    </linearGradient>
    <linearGradient id="gv-headwood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a180d"/><stop offset="1" stop-color="#4a2c18"/>
    </linearGradient>
    <linearGradient id="gv-fretwire" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8d8d8d"/><stop offset=".45" stop-color="#f4f4f4"/><stop offset="1" stop-color="#9a9a9a"/>
    </linearGradient>
    <radialGradient id="gv-pearl" cx=".35" cy=".35" r=".8">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e6ddcf"/><stop offset="1" stop-color="#b9ae9c"/>
    </radialGradient>
    <linearGradient id="gv-bone" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d9cdb6"/><stop offset=".5" stop-color="#fbf5e8"/><stop offset="1" stop-color="#d4c7ae"/>
    </linearGradient>
  </defs>
  <path d="M2,14 Q30,2 ${NUT - 6},${TOP - 4} L${NUT - 6},${BOTTOM + 4} Q30,168 2,156 Q-4,85 2,14 Z" fill="url(#gv-headwood)"/>
  ${pegs}
  <rect x="${NUT - 6}" y="${TOP - 4}" width="${W - NUT + 6}" height="${BOTTOM - TOP + 8}" fill="#1b0f08"/>
  <rect x="${NUT}" y="${TOP}" width="${W - NUT}" height="${BOTTOM - TOP}" fill="url(#gv-wood)"/>
  <g id="gv-inlays"></g>
  ${frets}
  <rect x="${NUT - 7}" y="${TOP - 3}" width="8" height="${BOTTOM - TOP + 6}" rx="1.5" fill="url(#gv-bone)"/>
  <g class="gv-strings">${strings}</g>
  <g id="gv-marks"></g>
  <g id="gv-fingers"></g>
  <g id="gv-numbers"></g>
</svg>`;
}

class GuitarView {
  /** onPick(corda, casa) é chamado quando você toca numa corda do desenho. */
  constructor(container, onPick) {
    container.innerHTML = neckSVG();
    this.svg = container.querySelector('svg');
    this.fingers = this.svg.querySelector('#gv-fingers');
    this.marks = this.svg.querySelector('#gv-marks');
    this.inlays = this.svg.querySelector('#gv-inlays');
    this.numbers = this.svg.querySelector('#gv-numbers');
    this.strings = [...this.svg.querySelectorAll('.gv-string')];
    this.start = 1;
    this.drawWindow(1);
    this.svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = this.svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const { x, y } = p.matrixTransform(this.svg.getScreenCTM().inverse());
      if (y < TOP - 6 || y > BOTTOM + 6) return;
      const s = Math.max(0, Math.min(5, Math.round((y - SY(0)) / 20)));
      let fret = 0;
      if (x >= NUT) {
        let k = 0;
        while (k < FRETS - 1 && x > fretX(k + 1)) k++;
        fret = this.start + k;
      }
      this.ripple(s, fret);
      onPick?.(s, fret);
    });
  }

  /** Desenha marcações e números das casas a partir da casa `start`. */
  drawWindow(start) {
    this.start = start;
    const mid = (TOP + BOTTOM) / 2;
    this.inlays.innerHTML = [3, 5, 7, 9, 12, 15].filter((f) => f >= start && f < start + FRETS).map((f) => (f === 12
      ? `<circle cx="${CX(f, start)}" cy="${mid - 26}" r="6" fill="url(#gv-pearl)"/><circle cx="${CX(f, start)}" cy="${mid + 26}" r="6" fill="url(#gv-pearl)"/>`
      : `<circle cx="${CX(f, start)}" cy="${mid}" r="7" fill="url(#gv-pearl)"/>`)).join('');
    this.numbers.innerHTML = Array.from({ length: FRETS }, (_, i) =>
      `<text x="${CX(start + i, start)}" y="${BOTTOM + 19}" text-anchor="middle" class="gv-num">${start + i}</text>`).join('');
  }

  ripple(s, fret) {
    const x = fret === 0 ? NUT - 26 : CX(fret, this.start);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', SY(s));
    c.setAttribute('r', 12);
    c.setAttribute('class', 'gv-ripple');
    this.svg.appendChild(c);
    setTimeout(() => c.remove(), 500);
    this.strum({ frets: this.strings.map((_, i) => (i === s ? fret : -1)) });
  }

  /** Mostra a próxima nota da tablatura (piscando) e as seguintes, mais claras. */
  showNotes(list, upcoming = []) {
    this.marks.innerHTML = '';
    const all = [...list, ...upcoming].filter((n) => n.fret > 0);
    const maxF = all.length ? Math.max(...all.map((n) => n.fret)) : 0;
    const minF = all.length ? Math.min(...all.map((n) => n.fret)) : 1;
    this.drawWindow(maxF <= FRETS ? 1 : Math.max(1, Math.min(minF, maxF - FRETS + 1)));
    const dot = (n, cls) => (n.fret === 0
      ? `<circle cx="${NUT - 26}" cy="${SY(n.s)}" r="10" class="${cls} open"/>`
      : n.fret < this.start || n.fret >= this.start + FRETS ? ''
        : `<circle cx="${CX(n.fret, this.start)}" cy="${SY(n.s)}" r="12" class="${cls}"/>`
          + `<text x="${CX(n.fret, this.start)}" y="${SY(n.s) + 5}" text-anchor="middle" class="gv-finger">${n.fret}</text>`);
    this.fingers.innerHTML = upcoming.map((n) => dot(n, 'gv-ghost')).join('') + list.map((n) => dot(n, 'gv-dot gv-target')).join('');
  }

  /** Mostra no braço onde ficam os dedos da forma `v`. */
  showChord(v) {
    this.fingers.innerHTML = '';
    this.marks.innerHTML = '';
    if (!v) return;
    const pressed = v.frets.filter((f) => f > 0);
    const maxF = pressed.length ? Math.max(...pressed) : 0;
    const start = maxF <= FRETS ? 1 : Math.min(...pressed);
    this.drawWindow(start);

    const out = [];
    v.frets.forEach((f, s) => {
      if (f < 0) out.push(`<text x="${NUT - 26}" y="${SY(s) + 5}" text-anchor="middle" class="gv-mute">✕</text>`);
      if (f === 0) out.push(`<circle cx="${NUT - 26}" cy="${SY(s)}" r="6" class="gv-open"/>`);
    });
    this.marks.innerHTML = out.join('');

    const dots = [];
    if (v.barre) {
      const b = v.barre;
      const x = CX(b.fret, start);
      dots.push(`<rect x="${x - 12}" y="${SY(b.from) - 12}" width="24" height="${SY(b.to) - SY(b.from) + 24}" rx="12" class="gv-dot"/>`);
      dots.push(`<text x="${x}" y="${SY(b.from) + 5}" text-anchor="middle" class="gv-finger">1</text>`);
    }
    v.frets.forEach((f, s) => {
      if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) return;
      dots.push(`<circle cx="${CX(f, start)}" cy="${SY(s)}" r="12" class="gv-dot"/>`);
      if (v.fingers[s]) dots.push(`<text x="${CX(f, start)}" y="${SY(s) + 5}" text-anchor="middle" class="gv-finger">${v.fingers[s]}</text>`);
    });
    this.fingers.innerHTML = dots.join('');
  }

  /** Faz as cordas tocadas vibrarem, da mais grave para a mais aguda. */
  strum(v) {
    this.strings.forEach((el, s) => {
      el.classList.remove('vib');
      if (v && v.frets[s] < 0) return;
      void el.getBBox();
      el.style.animationDelay = s * 22 + 'ms';
      el.classList.add('vib');
    });
  }
}

// ===== js/store.js =====
// Tudo que o site guarda: suas cifras, favoritas, histórico, progresso e preferências.
// Fica no navegador (localStorage) e, se você entrar na sua conta, é sincronizado.


const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'cifraviva.data';
const OLD_SONGS = 'cifraviva.songs';
const OLD_PREFS = 'cifraviva.prefs';

function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}

const blank = () => ({
  songs: [], // cifras suas (inclusive letras coladas por cima das populares)
  favorites: [],
  history: [], // [{id, at}]
  progress: {}, // id -> {plays, best, hits, misses, lastAt}
  days: {}, // 'AAAA-MM-DD' -> minutos praticados
  drills: {}, // 'G-C' -> recorde de trocas por minuto
  prefs: { fontSize: 20, sensitivity: 5, speed: 30 },
  voicing: {},
  deleted: [],
  updatedAt: 0,
});

const data = Object.assign(blank(), read(KEY, {}));
// migra o formato antigo
if (!data.songs.length && read(OLD_SONGS, null)) data.songs = read(OLD_SONGS, []);
if (read(OLD_PREFS, null)) Object.assign(data.prefs, read(OLD_PREFS, {}));

const listeners = [];
function onChange(fn) { listeners.push(fn); }

let saveTimer = 0;
function save() {
  data.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sem armazenamento */ }
    listeners.forEach((fn) => fn());
  }, 150);
}

/** Substitui tudo (usado ao baixar da nuvem). */
function replaceAll(next) {
  Object.assign(data, blank(), next);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sem armazenamento */ }
}

// ---------- músicas ----------
function allSongs() {
  const mine = new Map(data.songs.map((s) => [s.id, s]));
  // uma popular com letra colada vira a sua versão, com o mesmo id
  return [...DEMO_SONGS.map((s) => (mine.has(s.id) ? { ...s, ...mine.get(s.id), mine: true, chordsOnly: false } : s)),
    ...data.songs.filter((s) => !DEMO_SONGS.some((d) => d.id === s.id)).map((s) => ({ ...s, mine: true }))];
}
const getSong = (id) => allSongs().find((s) => s.id === id);

function saveSong(song) {
  const i = data.songs.findIndex((s) => s.id === song.id);
  const clean = { ...song, updatedAt: Date.now() };
  delete clean.mine;
  if (i >= 0) data.songs[i] = clean;
  else data.songs.push(clean);
  data.deleted = (data.deleted || []).filter((d) => d !== song.id);
  save();
}
function deleteSong(id) {
  data.songs = data.songs.filter((s) => s.id !== id);
  data.favorites = data.favorites.filter((f) => f !== id);
  data.deleted = [...new Set([...(data.deleted || []), id])]; // para a exclusão chegar aos outros aparelhos
  save();
}

const hasTab = (song) => /^\s*[eBGDAE]?\|[-\d]/m.test(song.text);

// ---------- favoritas e histórico ----------
const isFavorite = (id) => data.favorites.includes(id);
function toggleFavorite(id) {
  data.favorites = isFavorite(id) ? data.favorites.filter((f) => f !== id) : [id, ...data.favorites];
  save();
}
function touchHistory(id) {
  data.history = [{ id, at: Date.now() }, ...data.history.filter((h) => h.id !== id)].slice(0, 30);
  save();
}

// ---------- progresso ----------
const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-DD

function recordSession(id, { hits, misses, minutes }) {
  const p = data.progress[id] || { plays: 0, best: 0, hits: 0, misses: 0 };
  p.plays++;
  p.hits += hits;
  p.misses += misses;
  if (hits >= 5) p.best = Math.max(p.best, Math.round((hits / (hits + misses)) * 100));
  p.lastAt = Date.now();
  data.progress[id] = p;
  addPracticeMinutes(minutes);
}
function addPracticeMinutes(minutes) {
  const d = today();
  data.days[d] = Math.round(((data.days[d] || 0) + Math.max(minutes, 0.1)) * 10) / 10;
  save();
}

/** Dias seguidos praticando (até hoje ou ontem). */
function streak() {
  let n = 0;
  const d = new Date();
  if (!data.days[d.toLocaleDateString('sv')]) d.setDate(d.getDate() - 1);
  while (data.days[d.toLocaleDateString('sv')]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function totals() {
  const prog = Object.values(data.progress);
  return {
    streak: streak(),
    songs: prog.length,
    hits: prog.reduce((a, p) => a + p.hits, 0),
    minutes: Math.round(Object.values(data.days).reduce((a, m) => a + m, 0)),
    mastered: prog.filter((p) => p.best >= 90).length,
  };
}

// ===== js/tools.js =====
// Ferramentas: metrônomo, afinador e treino de troca de acordes.


// ---------- metrônomo ----------
class Metronome {
  constructor() { this.running = false; }

  start(bpm, onTick) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.onTick = onTick;
    this.bpm = bpm;
    this.k = 0;
    this.next = this.ctx.currentTime + 0.15;
    this.gridStart = this.next;
    this.running = true;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this.gridStart = this.next;
    this.k = 0;
  }

  schedule() {
    const ctx = this.ctx;
    const step = 30 / this.bpm; // colcheia
    while (this.next < ctx.currentTime + 0.12) {
      const k = this.k;
      if (k % 2 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = k % 8 === 0 ? 1600 : 1000;
        g.gain.setValueAtTime(0.5, this.next);
        g.gain.exponentialRampToValueAtTime(0.001, this.next + 0.05);
        o.connect(g).connect(ctx.destination);
        o.start(this.next);
        o.stop(this.next + 0.06);
      }
      const when = (this.next - ctx.currentTime) * 1000;
      setTimeout(() => this.running && this.onTick?.(k), Math.max(0, when));
      this.next += step;
      this.k++;
    }
  }

  /** A batida (tempo de performance.now) caiu perto de alguma colcheia? */
  isOnGrid(perfTime) {
    const latency = 0.07; // o detector percebe a batida um pouco depois
    const t = this.ctx.currentTime + (perfTime - performance.now()) / 1000 - latency;
    const step = 30 / this.bpm;
    const phase = (((t - this.gridStart) % step) + step) % step;
    return Math.min(phase, step - phase) < Math.min(0.09, step * 0.3);
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.ctx?.close();
  }
}

// ---------- afinador ----------
const STRINGS = TUNING.map((m, i) => ({ midi: m, name: NOTE_NAMES[m % 12], label: `${6 - i}ª` }));
let tuner = null;

function renderTuner(root) {
  root.innerHTML = `
    <div class="page narrow">
      <h1>Afinador</h1>
      <p class="muted">Toque uma corda solta de cada vez, perto do microfone.</p>
      <div class="tuner card">
        <div class="tuner-note" id="tnNote">–</div>
        <div class="tuner-meter">
          <div class="tuner-scale"><span>-50</span><span>0</span><span>+50</span></div>
          <div class="tuner-track"><div class="tuner-center"></div><div class="tuner-needle" id="tnNeedle"></div></div>
        </div>
        <div class="tuner-info" id="tnInfo">Clique em Começar</div>
        <button type="button" class="primary big" id="tnStart">🎤 Começar</button>
      </div>
      <h2>Afinação padrão</h2>
      <p class="muted">Toque no botão para ouvir a nota certa de cada corda.</p>
      <div class="tuner-strings">${STRINGS.map((s, i) => `<button type="button" class="string-btn" data-s="${i}"><b>${s.name}</b><small>${s.label} corda</small></button>`).join('')}</div>
    </div>`;
  let ref = null;
  root.querySelectorAll('.string-btn').forEach((b) => b.addEventListener('click', () => {
    ref ??= new VirtualGuitar(new (window.AudioContext || window.webkitAudioContext)());
    ref.ctx.resume();
    ref.strum([STRINGS[+b.dataset.s].midi]);
  }));
  $('#tnStart').addEventListener('click', async () => {
    if (tuner) { stopTuner(); return; }
    const hist = [];
    tuner = new ChromaListener(({ pitch, rms }) => {
      if (!pitch || pitch.clarity < 0.9 || rms < 0.005) return;
      hist.push(pitch.midi);
      if (hist.length > 5) hist.shift();
      const midi = [...hist].sort((a, b) => a - b)[hist.length >> 1];
      const near = Math.round(midi);
      const cents = Math.round((midi - near) * 100);
      const closest = STRINGS.reduce((a, s) => (Math.abs(s.midi - midi) < Math.abs(a.midi - midi) ? s : a));
      $('#tnNote').textContent = NOTE_NAMES[((near % 12) + 12) % 12];
      $('#tnNote').className = 'tuner-note' + (Math.abs(cents) <= 5 ? ' ok' : '');
      $('#tnNeedle').style.left = 50 + Math.max(-50, Math.min(50, cents)) + '%';
      $('#tnInfo').innerHTML = `${pitch.hz.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents · `
        + (Math.abs(cents) <= 5 ? '<b class="ok">afinada!</b>' : cents < 0 ? 'aperte (está baixa)' : 'afrouxe (está alta)')
        + ` <span class="muted">(${closest.label} corda: ${closest.name})</span>`;
    });
    try {
      await tuner.start();
      $('#tnStart').textContent = '⏹ Parar';
      $('#tnInfo').textContent = 'Toque uma corda…';
    } catch (err) {
      tuner = null;
      $('#tnInfo').textContent = 'Sem acesso ao microfone: ' + (err.message || err.name);
    }
  });
}

function stopTuner() {
  tuner?.stop();
  tuner = null;
  const b = $('#tnStart');
  if (b) b.textContent = '🎤 Começar';
}

// ---------- treino de troca de acordes ----------
const DRILL_CHORDS = ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm', 'F', 'B7', 'E7', 'A7', 'D7', 'G7', 'C7M', 'Bm'];
let drill = null;

function renderPractice(root) {
  const opts = (sel) => DRILL_CHORDS.map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
  const records = Object.entries(data.drills).sort((a, b) => b[1] - a[1]).slice(0, 6);
  root.innerHTML = `
    <div class="page narrow">
      <h1>Treino de trocas</h1>
      <p class="muted">Quantas vezes você consegue trocar entre dois acordes em 1 minuto? É o exercício que mais acelera quem está aprendendo.</p>
      <div class="card drill">
        <div class="drill-setup">
          <label>Acorde 1 <select id="drA">${opts('G')}</select></label>
          <span class="drill-swap">⇄</span>
          <label>Acorde 2 <select id="drB">${opts('C')}</select></label>
          <label>Tempo <select id="drTime"><option value="30">30 s</option><option value="60" selected>1 min</option><option value="120">2 min</option></select></label>
        </div>
        <div class="drill-stage">
          <div class="drill-target" id="drTarget"></div>
          <div class="drill-stats">
            <div><span class="label">Trocas</span><strong id="drCount">0</strong></div>
            <div><span class="label">Tempo</span><strong id="drClock">1:00</strong></div>
            <div><span class="label">Recorde</span><strong id="drBest">–</strong></div>
          </div>
        </div>
        <div class="drill-actions">
          <button type="button" class="primary big" id="drMic">🎤 Com meu violão</button>
          <button type="button" class="big" id="drVirtual">🎸 No violão virtual</button>
        </div>
        <div class="drill-pads" id="drPads" hidden></div>
      </div>
      ${records.length ? `<h2>Seus recordes</h2><div class="records">${records.map(([k, v]) => `<span class="badge">${esc(k.replace('-', ' ⇄ '))}: <b>${v}</b></span>`).join('')}</div>` : ''}
    </div>`;
  const pair = () => [$('#drA').value, $('#drB').value];
  const key = () => pair().join('-');
  const showBest = () => { $('#drBest').textContent = data.drills[key()] ?? '–'; };
  const showTarget = (name) => {
    $('#drTarget').innerHTML = `<div class="chord-name big">${esc(name)}</div>${diagramSVG(voicingsFor(name)[0], { size: 1.5 })}`;
  };
  ['#drA', '#drB'].forEach((s) => $(s).addEventListener('change', () => { showTarget($('#drA').value); showBest(); }));
  $('#drTime').addEventListener('change', () => { const t = +$('#drTime').value; $('#drClock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; });
  showTarget('G');
  showBest();
  $('#drMic').addEventListener('click', () => startDrill(false));
  $('#drVirtual').addEventListener('click', () => startDrill(true));

  async function startDrill(virtual) {
    if (drill) { stopDrill(); return; }
    const [a, b] = pair();
    if (a === b) { alert('Escolha dois acordes diferentes.'); return; }
    const tpls = [a, b].map((n) => ({ name: n, tpl: chordTemplate(parseChord(n)) }));
    const rivals = [...COMMON_CHORDS, ...tpls];
    let target = 0;
    let evidence = 0;
    let count = 0;
    let vg = null;
    const duration = +$('#drTime').value;
    let noise = virtual ? 0.004 : null;
    const calib = [];
    const listener = new ChromaListener(({ chroma, rms }) => {
      if (noise === null) {
        calib.push(rms);
        if (calib.length >= 16) { noise = Math.max(0.004, (calib.reduce((x, y) => x + y, 0) / calib.length) * 2.5); begin(); }
        return;
      }
      if (!drill?.started || rms < noise) { evidence = 0; return; }
      const t = tpls[target];
      const s = cosine(chroma, t.tpl);
      let best = 0;
      for (const r of rivals) best = Math.max(best, cosine(chroma, r.tpl));
      evidence = s > 0.6 && s >= best - 0.04 ? evidence + 1 : Math.max(0, evidence - 1);
      if (evidence >= 4) {
        evidence = 0;
        if (drill.first) drill.first = false; // o primeiro acorde só dá a largada
        else { count++; $('#drCount').textContent = count; }
        target = 1 - target;
        showTarget(tpls[target].name);
      }
    });
    try {
      await listener.start(virtual ? (ctx) => { vg = new VirtualGuitar(ctx); return vg.output; } : undefined);
    } catch (err) {
      alert('Sem acesso ao microfone: ' + (err.message || err.name));
      return;
    }
    drill = { listener, started: false, first: true };
    $('#drCount').textContent = '0';
    showTarget(a);
    $(virtual ? '#drVirtual' : '#drMic').textContent = '⏹ Parar';
    if (virtual) {
      $('#drPads').hidden = false;
      $('#drPads').innerHTML = [a, b].map((n) => `<button type="button" class="dock-chord" data-c="${esc(n)}">${esc(n)}</button>`).join('');
      $('#drPads').querySelectorAll('button').forEach((btn) => btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vg.strum(voicingNotes(voicingsFor(btn.dataset.c)[0]));
      }));
      begin();
    } else {
      $('#drClock').textContent = '…';
    }

    function begin() {
      drill.started = true;
      const t0 = performance.now();
      drill.timer = setInterval(() => {
        const left = Math.max(0, duration - Math.floor((performance.now() - t0) / 1000));
        $('#drClock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (left === 0) finish();
      }, 200);
    }
    function finish() {
      const perMin = Math.round((count * 60) / duration);
      const k = key();
      const record = perMin > (data.drills[k] || 0);
      if (record) data.drills[k] = perMin;
      addPracticeMinutes(duration / 60);
      save();
      stopDrill();
      $('#drTarget').innerHTML = `<div class="drill-result">${record ? '🏆 Novo recorde!' : 'Fim!'}<br><b>${perMin}</b> trocas por minuto</div>`;
      showBest();
    }
  }
}

function stopDrill() {
  if (!drill) return;
  clearInterval(drill.timer);
  drill.listener.stop();
  drill = null;
  if ($('#drMic')) {
    $('#drMic').textContent = '🎤 Com meu violão';
    $('#drVirtual').textContent = '🎸 No violão virtual';
    $('#drPads').hidden = true;
  }
}

// ===== js/player.js =====
// Página da música: cifra/tablatura, modo jogo (microfone ou violão virtual),
// metrônomo com a batida, desenhos dos acordes, edição.


const state = {
  song: null,
  transpose: 0,
  events: [],
  follower: null,
  listener: null,
  noise: null,
  calib: [],
  autoScroll: null,
  mode: null, // 'mic' | 'virtual'
  vguitar: null,
  preview: null,
  lastStrum: null,
  score: { hits: 0, misses: 0, combo: 0, best: 0, strums: 0, onTime: 0, onsets: 0 },
  session: { hits: 0, misses: 0, start: 0 },
};
const metronome = new Metronome();

// ---------- montar a cifra ----------
function addEvent(ev) {
  ev.i = state.events.length;
  ev.els.forEach((el) => { el.dataset.i = ev.i; });
  state.events.push(ev);
}

function chordEl(name, row) {
  const b = document.createElement('b');
  b.className = 'ch';
  if (!name) return b;
  const shown = transposeChord(name, state.transpose);
  const parsed = parseChord(shown);
  b.textContent = shown;
  addEvent({ kind: 'chord', name: shown, tpl: chordTemplate(parsed), pcs: pitchClasses(parsed), els: [b], row });
  return b;
}

function tabEl(r, row) {
  // qual evento cada número da tablatura representa
  const marks = r.lines.map(() => new Map());
  const pending = r.notes.map((col) => {
    const notes = col.list.map((n) => ({ s: n.s, fret: n.fret + state.transpose >= 0 ? n.fret + state.transpose : n.fret }));
    const ev = { notes, els: [], row };
    col.list.forEach((n) => marks[5 - n.s].set(col.col, { len: n.len, ev }));
    return ev;
  });
  const pre = document.createElement('pre');
  pre.className = 'tab';
  r.lines.forEach((line, k) => {
    const div = document.createElement('div');
    div.className = 'tab-line s' + (5 - k);
    div.appendChild(document.createTextNode((line.label || ['e', 'B', 'G', 'D', 'A', 'E'][k]) + '|'));
    let i = 0;
    while (i < line.text.length) {
      const m = marks[k].get(i);
      if (m) {
        const sp = document.createElement('span');
        sp.className = 'tn';
        const n = m.ev.notes.find((x) => x.s === 5 - k);
        sp.textContent = String(n.fret).padStart(m.len, '-');
        m.ev.els.push(sp);
        div.appendChild(sp);
        i += m.len;
      } else {
        const j = [...marks[k].keys()].filter((c) => c > i).sort((a, b) => a - b)[0] ?? line.text.length;
        div.appendChild(document.createTextNode(line.text.slice(i, j)));
        i = j;
      }
    }
    pre.appendChild(div);
  });
  for (const ev of pending) {
    if (ev.notes.length === 1) {
      const n = ev.notes[0];
      const midi = TUNING[n.s] + n.fret;
      addEvent({ ...ev, kind: 'note', midi, name: noteName(midi) });
    } else {
      const tpl = new Float32Array(12);
      ev.notes.forEach((n) => { tpl[(TUNING[n.s] + n.fret) % 12] += 1; });
      addEvent({ ...ev, kind: 'chord', fromTab: true, tpl, pcs: [...new Set(ev.notes.map((n) => (TUNING[n.s] + n.fret) % 12))], name: ev.notes.map((n) => noteName(TUNING[n.s] + n.fret)).join('+') });
    }
  }
  row.appendChild(pre);
}

function renderSheet() {
  const sheet = $('#sheet');
  sheet.innerHTML = '';
  state.events = [];
  for (const r of parseSheet(state.song.text)) {
    const row = document.createElement('div');
    row.className = 'row ' + r.type;
    if (r.type === 'section') row.textContent = r.text;
    if (r.type === 'chords') {
      row.classList.add('chords-only');
      r.chords.forEach((c) => row.appendChild(chordEl(c, row)));
    }
    if (r.type === 'tab') tabEl(r, row);
    if (r.type === 'lyric') {
      if (!r.segments.some((s) => s.chord)) row.classList.add('nochords');
      for (const seg of r.segments) {
        const pieces = seg.text.match(/\S+\s*|\s+/g) || [' '];
        pieces.forEach((p, k) => {
          const s = document.createElement('span');
          s.className = 'seg';
          s.appendChild(chordEl(k === 0 ? seg.chord : null, row));
          const ly = document.createElement('span');
          ly.className = 'ly';
          ly.textContent = p;
          s.appendChild(ly);
          row.appendChild(s);
        });
      }
    }
    sheet.appendChild(row);
  }
  $('#transposeLabel').textContent = state.transpose > 0 ? '+' + state.transpose : String(state.transpose);

  const old = state.follower;
  state.follower = new Follower(state.events, onFollowEvent);
  state.follower.setSensitivity(data.prefs.sensitivity);
  if (old && old.events.length) {
    state.follower.pos = Math.max(0, Math.min(old.pos, state.events.length - 1));
    state.follower.started = old.started;
  }
  renderChordPanel();
  renderDock();
  highlight(false);
}

function renderHeader() {
  const s = state.song;
  const g = GENRES.find((x) => x.id === s.genre);
  const badges = [
    g && `${g.icon} ${g.name}`,
    s.key && `Tom: <b>${esc(transposeChord(s.key, state.transpose))}</b>`,
    s.capo && `Capo na ${s.capo}ª casa`,
    s.level && ['', 'Fácil', 'Médio', 'Difícil'][s.level],
    s.bpm && `${s.bpm} bpm`,
  ].filter(Boolean);
  $('#songTitle').textContent = s.title;
  $('#songArtist').textContent = s.artist || '';
  $('#songBadges').innerHTML = badges.map((b) => `<span class="badge">${b}</span>`).join('');
  $('#btnFav').textContent = isFavorite(s.id) ? '★' : '☆';
  $('#btnFav').classList.toggle('on', isFavorite(s.id));
  $('#btnDelete').hidden = !s.mine;
  $('#btnDelete').textContent = /^(pop|pd|demo)-/.test(s.id) ? 'Restaurar original' : 'Excluir';
  $('#chordsOnlyNote').hidden = !s.chordsOnly;
  $('#btnPasteLyrics').hidden = !s.chordsOnly;
  renderStrumPattern();
}

function renderStrumPattern() {
  const p = state.song.strum;
  $('#strumBox').hidden = !p;
  if (!p) return;
  $('#strumPattern').innerHTML = [...p].map((c, i) =>
    `<span class="beat${i % 2 ? ' off' : ''}" data-k="${i}">${c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}<small>${i % 2 ? 'e' : i / 2 + 1}</small></span>`).join('');
}

// ---------- desenhos dos acordes ----------
function uniqueChords() {
  return [...new Set(state.events.filter((e) => e.kind === 'chord' && !e.fromTab).map((e) => e.name))];
}

function currentVoicing(name) {
  const list = voicingsFor(name);
  const i = Math.min(data.voicing[name] || 0, Math.max(0, list.length - 1));
  return { list, i, v: list[i] };
}

function chordCard(name) {
  const { list, i, v } = currentVoicing(name);
  const card = document.createElement('div');
  card.className = 'chord-card';
  card.dataset.chord = name;
  card.innerHTML = `
    <div class="chord-name">${esc(name)}</div>
    <button type="button" class="diagram-btn" title="Ouvir ${esc(name)}">${diagramSVG(v)}</button>
    <div class="variation">
      <button type="button" class="var-prev" ${list.length < 2 ? 'disabled' : ''} aria-label="Forma anterior">‹</button>
      <span>${list.length ? i + 1 : 0}/${list.length}</span>
      <button type="button" class="var-next" ${list.length < 2 ? 'disabled' : ''} aria-label="Próxima forma">›</button>
    </div>`;
  return card;
}

function renderChordPanel() {
  const names = uniqueChords();
  $('#chordsSection').hidden = !names.length;
  const panel = $('#chordPanel');
  panel.innerHTML = '';
  names.forEach((n) => panel.appendChild(chordCard(n)));
}

function changeVoicing(name, delta) {
  const { list, i } = currentVoicing(name);
  if (!list.length) return;
  data.voicing[name] = (i + delta + list.length) % list.length;
  save();
  renderChordPanel();
  renderDock();
  highlight(false);
  strum(name);
}

// ---------- som ----------
function guitar() {
  if (state.vguitar) return state.vguitar;
  if (!state.preview) state.preview = new VirtualGuitar(new (window.AudioContext || window.webkitAudioContext)());
  state.preview.ctx.resume();
  return state.preview;
}

function strum(name) {
  const { v } = currentVoicing(name);
  if (!v) return;
  guitar().strum(voicingNotes(v));
  state.lastStrum = name;
  guitarView.strum(v);
  const btn = $(`#dock .dock-chord[data-chord="${CSS.escape(name)}"]`);
  if (btn) { btn.classList.remove('struck'); void btn.offsetWidth; btn.classList.add('struck'); }
}

/** Tocar numa corda do braço desenhado toca aquela nota. */
const guitarView = new GuitarView($('#guitar'), (s, fret) => guitar().strum([TUNING[s] + fret]));

function renderDock() {
  const box = $('#dockChords');
  box.innerHTML = '';
  uniqueChords().forEach((name, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-chord';
    b.dataset.chord = name;
    b.innerHTML = `<span class="chord-name">${esc(name)}</span>${k < 9 ? `<kbd>${k + 1}</kbd>` : ''}`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); strum(name); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strum(name); } });
    box.appendChild(b);
  });
  $('#dock').classList.toggle('has-tab', state.events.some((e) => e.kind === 'note' || e.fromTab));
}

// ---------- jogo: pista, placar, avisos ----------
const playing = () => (state.follower.started ? state.events[state.follower.pos] : null);
function targetEvent() {
  const ti = state.follower.target();
  return ti >= 0 ? state.events[ti] : null;
}
const isNoteish = (e) => e && (e.kind === 'note' || e.fromTab);
const STRING_NAMES = ['6ª', '5ª', '4ª', '3ª', '2ª', '1ª'];

function chipFor(ev) {
  if (ev.kind === 'note') {
    const n = ev.notes[0];
    return { html: `${n.fret}<small>${STRING_NAMES[n.s]}</small>`, cls: ' note s' + n.s };
  }
  return { html: esc(ev.fromTab ? ev.notes.map((n) => n.fret).join('·') : ev.name), cls: ev.fromTab ? ' note' : '' };
}

function renderLane(advance = false) {
  const f = state.follower;
  const items = [];
  let i = f.pos;
  while (i >= 0 && items.length < 8) { items.push(i); i = f.nextIndex(i); }
  $('#lane').innerHTML = items.map((idx, k) => {
    const { html, cls } = chipFor(state.events[idx]);
    let c = 'lane-chip' + cls;
    let extra = '';
    if (k === 0 && f.started) {
      c += ' playing';
      if (state.score.strums > 1 && state.events[idx].kind === 'chord') extra = `<small>×${state.score.strums}</small>`;
    } else if ((k === 0 && !f.started) || (k === 1 && f.started)) c += ' target';
    return `<span class="${c}">${html}${extra}</span>`;
  }).join('') + (i < 0 && items.length < 8 ? '<span class="lane-chip end">🏁</span>' : '');
  if (advance) { const l = $('#lane'); l.classList.remove('advance'); void l.offsetWidth; l.classList.add('advance'); }
}

function renderScore() {
  const s = state.score;
  const total = s.hits + s.misses;
  $('#score').innerHTML = `<span class="ok">✓ ${s.hits}</span><span class="bad">✗ ${s.misses}</span>`
    + `<span class="combo${s.combo >= 5 ? ' hot' : ''}">🔥 ${s.combo}</span>`
    + (total ? `<span class="acc">${Math.round((s.hits / total) * 100)}%</span>` : '')
    + (metronome.running && s.onsets >= 4 ? `<span class="acc" title="Batidas no tempo do metrônomo">🥁 ${Math.round((s.onTime / s.onsets) * 100)}%</span>` : '');
}

function resetScore() {
  Object.assign(state.score, { hits: 0, misses: 0, combo: 0, best: 0, strums: 0, onTime: 0, onsets: 0 });
}

let feedbackTimer = 0;
function feedback(html, kind) {
  const el = $('#feedback');
  el.innerHTML = html;
  el.className = 'feedback ' + kind;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

function upcomingNotes(fromIdx, count) {
  const out = [];
  let i = fromIdx;
  while (i >= 0 && out.length < count) {
    const e = state.events[i];
    if (!isNoteish(e)) break;
    out.push(...e.notes);
    i = state.follower.nextIndex(i);
  }
  return out;
}

function updateGame() {
  const cur = playing();
  const tgt = targetEvent();
  if (isNoteish(tgt)) {
    // tablatura: o braço mostra a próxima nota (piscando) e as seguintes (claras)
    const ti = state.follower.target();
    guitarView.showNotes(tgt.notes, upcomingNotes(state.follower.nextIndex(ti), 3));
  } else {
    // acordes: o braço mostra o que você ESTÁ tocando; só muda ao acertar o próximo
    const show = cur && cur.kind === 'chord' && !cur.fromTab ? cur : tgt;
    guitarView.showChord(show && currentVoicing(show.name).v);
  }
  $$('#dock .dock-chord').forEach((b) => {
    b.classList.toggle('is-current', !!cur && b.dataset.chord === cur.name);
    b.classList.toggle('is-next', !!tgt && b.dataset.chord === tgt.name);
  });
  const what = (e) => (e.kind === 'note' ? `a nota <b class="hint-next">${e.notes[0].fret}</b> na ${STRING_NAMES[e.notes[0].s]} corda` : `<b class="hint-next">${esc(e.fromTab ? e.notes.map((n) => n.fret).join('+') : e.name)}</b>`);
  $('#dockHint').innerHTML = !tgt
    ? 'Última parte — termine a música! 🎉'
    : !cur
      ? `Toque ${what(tgt)} para começar`
      : cur.kind === 'chord' && !cur.fromTab && !isNoteish(tgt)
        ? `Tocando <b>${esc(cur.name)}</b> · troque para ${what(tgt)}`
        : `Agora: ${what(tgt)}`;
  renderLane();
  renderScore();
}

function highlight(scroll = true) {
  $$('.ch.current, .ch.next, .ch.waiting, .tn.current, .tn.next, .tn.waiting, .tn.done').forEach((e) => e.classList.remove('current', 'next', 'waiting', 'done'));
  $$('.row.current, .row.past').forEach((e) => e.classList.remove('current', 'past'));
  const f = state.follower;
  const ev = state.events[f.pos];
  if (!ev) { updateGame(); return; }
  ev.els.forEach((el) => el.classList.add(f.started ? 'current' : 'waiting'));
  if (f.started) targetEvent()?.els.forEach((el) => el.classList.add('next'));
  // notas já tocadas na mesma tablatura ficam marcadas
  for (let i = f.pos - 1; i >= 0 && state.events[i].row === ev.row; i--) state.events[i].els.forEach((el) => el.classList.add('done'));
  ev.row.classList.add('current');
  let r = ev.row.previousElementSibling;
  while (r) { r.classList.add('past'); r = r.previousElementSibling; }
  updateGame();
  if (scroll) scrollToRow(ev.row);
}

function onFollowEvent(e) {
  const s = state.score;
  if (e.type === 'hit') {
    s.hits++;
    s.combo++;
    s.best = Math.max(s.best, s.combo);
    s.strums = 1;
    state.session.hits++;
    feedback(s.combo >= 5 && s.combo % 5 === 0 ? `🔥 ${s.combo} seguidos!` : '✓', 'ok');
    highlight(true);
    renderLane(true);
  } else if (e.type === 'strum') {
    s.strums++;
    renderLane();
  } else if (e.type === 'miss') {
    s.misses++;
    s.combo = 0;
    state.session.misses++;
    feedback(`✗ ${esc(e.heard)}${e.expected ? ` <small>era ${esc(e.expected)}</small>` : ''}`, 'bad');
    renderScore();
  } else if (e.type === 'onset') {
    if (metronome.running) {
      s.onsets++;
      if (metronome.isOnGrid(e.time)) s.onTime++;
      renderScore();
    }
  } else if (e.type === 'move') {
    s.strums = 0;
    highlight(true);
  }
}

// ---------- rolagem suave ----------
const smooth = {
  y: 0, target: 0, raf: 0,
  to(target) {
    this.target = Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight));
    if (!this.raf) { this.y = scrollY; this.raf = requestAnimationFrame(() => this.step()); }
  },
  step() {
    const d = this.target - this.y;
    if (Math.abs(d) < 0.5) { scrollTo(0, this.target); this.raf = 0; return; }
    this.y += d * 0.07;
    scrollTo(0, this.y);
    this.raf = requestAnimationFrame(() => this.step());
  },
  cancel() { cancelAnimationFrame(this.raf); this.raf = 0; },
};

function scrollToRow(row) {
  if ($('#view-player').hidden) return;
  const bar = $('#toolbar');
  const top = getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
  const dock = $('#dock').hidden ? 0 : $('#dock').offsetHeight;
  const visible = innerHeight - top - dock;
  const rect = row.getBoundingClientRect();
  smooth.to(scrollY + rect.top - top - visible * 0.25);
}
['wheel', 'touchstart'].forEach((t) => addEventListener(t, () => smooth.cancel(), { passive: true }));

// ---------- seguir o violão ----------
function setStatus(html) { $('#status').innerHTML = html; }

function buildChromaMeter() {
  $('#chroma').innerHTML = NOTES_SHARP.map((n) => `<div class="bar"><div class="fill"></div><div class="note">${n}</div></div>`).join('');
}

function onAudioFrame({ chroma, rms, pitch, time }) {
  if (state.noise === null) {
    state.calib.push(rms);
    if (state.calib.length >= 20) {
      const avg = state.calib.reduce((a, b) => a + b, 0) / state.calib.length;
      state.noise = Math.max(0.004, avg * 2.5);
      setStatus('Pode tocar! Comece pelo que está destacado e bata no ritmo que quiser; a música anda quando você toca o <b>próximo acorde/nota certo</b>. Se ele se perder, toque no acorde certo da letra.');
    }
    return;
  }
  const active = rms > state.noise;
  const lvl = $('#levelBar');
  lvl.style.height = Math.min(100, (rms / (state.noise * 4)) * 100) + '%';
  lvl.classList.toggle('active', active);

  state.follower.update(chroma, rms, time, state.noise, pitch);

  const show = playing() || targetEvent();
  const bars = $('#chroma').children;
  for (let i = 0; i < 12; i++) {
    bars[i].firstChild.style.height = (active ? chroma[i] * 100 : 0) + '%';
    bars[i].classList.toggle('expected', !!show?.pcs?.includes(i));
  }
  if (!active) { $('#heardChord').textContent = '–'; return; }
  if (isNoteish(targetEvent()) && pitch && pitch.clarity > 0.85) {
    $('#heardChord').textContent = noteName(pitch.midi);
    return;
  }
  let best = null;
  let bestS = 0;
  for (const c of COMMON_CHORDS) {
    const s = cosine(chroma, c.tpl);
    if (s > bestS) { bestS = s; best = c.name; }
  }
  $('#heardChord').textContent = bestS > 0.6 ? best : '?';
}

const MODE_BUTTONS = {
  mic: { btn: '#btnListen', idle: '🎤 <span class="long">Ouvir violão</span><span class="short">Ouvir</span>', on: '⏹ <span class="long">Parar</span><span class="short">Parar</span>' },
  virtual: { btn: '#btnVirtual', idle: '🎸 <span class="long">Violão virtual</span><span class="short">Virtual</span>', on: '⏹ <span class="long">Fechar violão</span><span class="short">Fechar</span>' },
};

/** No modo 'virtual' o som sintetizado entra no mesmo detector do microfone. */
async function startFollow(mode, sourceFactory) {
  const was = state.mode;
  if (state.listener) stopListen();
  if (was === mode && !sourceFactory) return;
  stopAuto();
  const listener = new ChromaListener(onAudioFrame);
  state.noise = null;
  state.calib = [];
  if (mode === 'virtual') {
    sourceFactory = (ctx) => {
      state.vguitar = new VirtualGuitar(ctx);
      return state.vguitar.output;
    };
  }
  try {
    setStatus(mode === 'mic' ? 'Pedindo acesso ao microfone…' : 'Ligando o violão virtual…');
    await listener.start(sourceFactory);
  } catch (err) {
    setStatus('Não consegui acessar o microfone (' + esc(err.message || err.name) + '). Verifique a permissão do navegador.');
    return;
  }
  state.listener = listener;
  state.mode = mode;
  state.session = { hits: 0, misses: 0, start: performance.now() };
  buildChromaMeter();
  $('#monitor').hidden = false;
  const m = MODE_BUTTONS[mode];
  $(m.btn).classList.add('on');
  $(m.btn).innerHTML = m.on;
  $('#dock').hidden = false;
  $('#dock').classList.toggle('mic', mode === 'mic');
  document.body.classList.add('has-dock');
  if (mode === 'virtual') {
    state.noise = 0.004;
    setStatus('Toque os acordes embaixo do braço (no computador, teclas 1–9) ou toque <b>direto nas cordas</b> do braço para as notas da tablatura. A música só anda quando você acerta.');
  } else {
    setStatus('Calibrando… fique em silêncio por um segundo.');
  }
  keepAwake(true);
  highlight();
}

function endSession() {
  const s = state.session;
  if (state.song && s.start && (s.hits || s.misses)) {
    recordSession(state.song.id, { hits: s.hits, misses: s.misses, minutes: (performance.now() - s.start) / 60000 });
  }
  state.session = { hits: 0, misses: 0, start: 0 };
}

function stopListen() {
  endSession();
  state.listener?.stop();
  state.listener = null;
  state.vguitar = null;
  state.mode = null;
  for (const m of Object.values(MODE_BUTTONS)) {
    $(m.btn).classList.remove('on');
    $(m.btn).innerHTML = m.idle;
  }
  $('#monitor').hidden = true;
  $('#dock').hidden = true;
  document.body.classList.remove('has-dock');
  keepAwake(false);
  setStatus('Parado. Toque em <b>Ouvir violão</b> ou <b>Violão virtual</b> para continuar de onde parou.');
}

// ---------- tela sempre ligada ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* sem suporte */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.listener || state.autoScroll)) keepAwake(true);
});

// ---------- rolagem por tempo ----------
function toggleAuto() {
  if (state.autoScroll) { stopAuto(); return; }
  if (state.listener) stopListen();
  smooth.cancel();
  let y = scrollY;
  let last = performance.now();
  const step = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    y += data.prefs.speed * dt;
    scrollTo(0, y);
    if (y >= document.documentElement.scrollHeight - innerHeight) { stopAuto(); return; }
    state.autoScroll = requestAnimationFrame(step);
  };
  state.autoScroll = requestAnimationFrame(step);
  $('#btnAuto').classList.add('on');
  $('#btnAuto').innerHTML = '⏸ <span class="long">Pausar</span><span class="short">Pausar</span>';
  keepAwake(true);
}
function stopAuto() {
  cancelAnimationFrame(state.autoScroll);
  state.autoScroll = null;
  $('#btnAuto').classList.remove('on');
  $('#btnAuto').innerHTML = '▶ <span class="long">Rolagem</span><span class="short">Rolar</span>';
  if (!state.listener) keepAwake(false);
}

// ---------- metrônomo ----------
function toggleMetronome() {
  if (metronome.running) {
    metronome.stop();
  } else {
    state.score.onTime = 0;
    state.score.onsets = 0;
    metronome.start(+$('#bpm').value, (k) => {
      $$('#strumPattern .beat').forEach((b) => b.classList.toggle('now', +b.dataset.k === k % 8));
    });
  }
  $('#btnMetro').classList.toggle('on', metronome.running);
  if (!metronome.running) $$('#strumPattern .beat').forEach((b) => b.classList.remove('now'));
  renderScore();
}

// ---------- abrir / fechar ----------
function openSong(id) {
  const song = getSong(id);
  if (!song) return false;
  if (state.song?.id !== id) {
    state.song = song;
    state.transpose = song.transpose || 0;
    state.follower = null;
    resetScore();
  } else {
    state.song = song;
  }
  $('#bpm').value = song.bpm || 80;
  $('#bpmLabel').textContent = $('#bpm').value;
  renderHeader();
  renderSheet();
  touchHistory(id);
  setStatus('Toque no <b>violão de verdade</b> (🎤) ou no <b>violão virtual</b> (🎸). Toque em qualquer acorde da letra para começar dali.');
  return true;
}

function closePlayer() {
  if (state.listener) stopListen();
  stopAuto();
  if (metronome.running) toggleMetronome();
}

// ---------- editor ----------
function openEditor(song, { pasteLyrics = false } = {}) {
  $('#editorHeading').textContent = pasteLyrics ? 'Colar letra' : song ? 'Editar cifra' : 'Nova cifra';
  $('#edHint').hidden = !pasteLyrics;
  $('#edTitle').value = song?.title || '';
  $('#edArtist').value = song?.artist || '';
  $('#edGenre').innerHTML = GENRES.map((g) => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
  $('#edGenre').value = song?.genre || 'pop';
  $('#edLevel').value = song?.level || 1;
  $('#edKey').value = song?.key || '';
  $('#edBpm').value = song?.bpm || '';
  $('#edStrum').value = song?.strum || '';
  $('#edText').value = song?.text || '';
  $('#editor').dataset.id = song?.id || '';
  $('#editor').showModal();
}

function saveEditor() {
  const id = $('#editor').dataset.id || 'u' + Date.now();
  const existing = getSong(id);
  const song = {
    ...(existing || {}),
    id,
    title: $('#edTitle').value.trim(),
    artist: $('#edArtist').value.trim(),
    genre: $('#edGenre').value,
    level: +$('#edLevel').value,
    key: $('#edKey').value.trim(),
    bpm: +$('#edBpm').value || undefined,
    strum: $('#edStrum').value.trim().toUpperCase().replace(/[^DU-]/g, '') || undefined,
    text: $('#edText').value,
    chordsOnly: false,
  };
  if (!song.title) return;
  saveSong(song);
  state.song = null;
  location.hash = '#/musica/' + encodeURIComponent(id);
  openSong(id);
}

// ---------- eventos ----------
$('#btnListen').addEventListener('click', () => startFollow('mic'));
$('#btnVirtual').addEventListener('click', () => startFollow('virtual'));
$('#btnAuto').addEventListener('click', toggleAuto);
$('#btnMetro').addEventListener('click', toggleMetronome);
$('#dockClose').addEventListener('click', stopListen);
$('#btnSettings').addEventListener('click', () => {
  const open = $('#toolbar').classList.toggle('show-settings');
  $('#btnSettings').setAttribute('aria-expanded', open);
});
$('#btnFav').addEventListener('click', () => { toggleFavorite(state.song.id); renderHeader(); });
$('#btnEdit').addEventListener('click', () => openEditor(state.song));
$('#btnPasteLyrics').addEventListener('click', () => openEditor(state.song, { pasteLyrics: true }));
$('#btnDelete').addEventListener('click', () => {
  const restoring = state.song.id.startsWith('pop-') || state.song.id.startsWith('pd-') || state.song.id.startsWith('demo-');
  if (!confirm(restoring ? `Voltar "${state.song.title}" para a versão original?` : `Excluir "${state.song.title}"?`)) return;
  const id = state.song.id;
  deleteSong(id);
  state.song = null;
  if (restoring) openSong(id);
  else location.hash = '#/repertorio';
});
$('#edCancel').addEventListener('click', () => $('#editor').close());
$('#editorForm').addEventListener('submit', (e) => { if (e.submitter?.value === 'save') saveEditor(); });

function setTranspose(t) {
  state.transpose = ((t + 17) % 12) - 5;
  if (state.song.mine) { state.song.transpose = state.transpose; saveSong(state.song); }
  renderHeader();
  renderSheet();
}
$('#btnTUp').addEventListener('click', () => setTranspose(state.transpose + 1));
$('#btnTDown').addEventListener('click', () => setTranspose(state.transpose - 1));

function setFont(px) {
  data.prefs.fontSize = Math.max(12, Math.min(40, px));
  document.documentElement.style.setProperty('--font-size', data.prefs.fontSize + 'px');
  save();
}
$('#btnFontUp').addEventListener('click', () => setFont(data.prefs.fontSize + 2));
$('#btnFontDown').addEventListener('click', () => setFont(data.prefs.fontSize - 2));
$('#btnRestart').addEventListener('click', () => { resetScore(); state.follower.setPosition(0); smooth.to(0); });
$('#sensitivity').addEventListener('input', (e) => { data.prefs.sensitivity = +e.target.value; state.follower.setSensitivity(data.prefs.sensitivity); save(); });
$('#speed').addEventListener('input', (e) => { data.prefs.speed = +e.target.value; save(); });
$('#bpm').addEventListener('input', (e) => {
  $('#bpmLabel').textContent = e.target.value;
  if (metronome.running) metronome.setBpm(+e.target.value);
});

$('#chordPanel').addEventListener('click', (e) => {
  const card = e.target.closest('.chord-card');
  if (!card) return;
  const name = card.dataset.chord;
  if (e.target.closest('.var-prev')) changeVoicing(name, -1);
  else if (e.target.closest('.var-next')) changeVoicing(name, 1);
  else if (e.target.closest('.diagram-btn')) strum(name);
});

$('#sheet').addEventListener('click', (e) => {
  const el = e.target.closest('[data-i]');
  if (el) state.follower.setPosition(+el.dataset.i);
});

// desenho do acorde ao passar o mouse
const tip = $('#chordTip');
$('#sheet').addEventListener('mouseover', (e) => {
  const ch = e.target.closest('.ch[data-i]');
  if (!ch) return;
  const name = ch.textContent;
  tip.innerHTML = `<div class="chord-name">${esc(name)}</div>${diagramSVG(currentVoicing(name).v)}`;
  const r = ch.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 110, Math.max(8, r.left - 20)) + 'px';
  tip.style.top = (r.top > 150 ? r.top - 140 : r.bottom + 8) + 'px';
  tip.hidden = false;
});
$('#sheet').addEventListener('mouseout', (e) => { if (e.target.closest('.ch[data-i]')) tip.hidden = true; });
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

addEventListener('keydown', (e) => {
  if ($('#view-player').hidden || e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'ArrowRight') { state.follower.setPosition(state.follower.pos + 1); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { state.follower.setPosition(state.follower.pos - 1); e.preventDefault(); }
  if (state.mode === 'virtual' && /^[1-9]$/.test(e.key)) {
    const name = uniqueChords()[+e.key - 1];
    if (name) strum(name);
  }
});

const playerState = state;

// ===== js/pages.js =====
// Páginas: início, catálogo de músicas e meu repertório.


const LEVELS = ['', 'Fácil', 'Médio', 'Difícil'];
const genreOf = (s) => GENRES.find((g) => g.id === s.genre);

function songCard(s) {
  const g = genreOf(s);
  const p = data.progress[s.id];
  const tags = [
    s.level && `<span class="tag lvl${s.level}">${LEVELS[s.level]}</span>`,
    s.key && `<span class="tag">Tom ${esc(s.key)}</span>`,
    hasTab(s) && '<span class="tag tabtag">Tablatura</span>',
    s.chordsOnly && '<span class="tag">Só acordes</span>',
    s.mine && '<span class="tag mine">Minha</span>',
    p?.best >= 90 ? `<span class="tag ok">🏆 ${p.best}%</span>` : p?.best ? `<span class="tag ok">${p.best}%</span>` : '',
  ].filter(Boolean).join('');
  return `<a class="song-card" href="#/musica/${encodeURIComponent(s.id)}">
    <span class="sc-icon">${g?.icon || '🎵'}</span>
    <span class="sc-main"><b>${esc(s.title)}</b><small>${esc(s.artist || '')}</small><span class="sc-tags">${tags}</span></span>
    <button type="button" class="fav${isFavorite(s.id) ? ' on' : ''}" data-fav="${esc(s.id)}" aria-label="Favorita">${isFavorite(s.id) ? '★' : '☆'}</button>
  </a>`;
}

// favoritar direto dos cartões
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  e.preventDefault();
  toggleFavorite(b.dataset.fav);
  const on = isFavorite(b.dataset.fav);
  $$(`[data-fav="${CSS.escape(b.dataset.fav)}"]`).forEach((x) => { x.classList.toggle('on', on); x.textContent = on ? '★' : '☆'; });
});

// ---------- início ----------
function renderHome(root) {
  const t = totals();
  const songs = allSongs();
  const recent = data.history.map((h) => songs.find((s) => s.id === h.id)).filter(Boolean).slice(0, 4);
  const easy = songs.filter((s) => s.level === 1 && !s.chordsOnly).slice(0, 6);
  root.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <h1>Toque.<br><span>A cifra acompanha você.</span></h1>
        <p>O Cifra Viva escuta o seu violão, rola a letra sozinho e só avança quando você acerta o acorde — como um jogo.</p>
        <div class="hero-actions">
          <a class="btn primary big" href="#/musicas">🎵 Escolher música</a>
          <a class="btn big" href="#/treino">🏋️ Treinar trocas</a>
          <a class="btn big" href="#/afinador">🎯 Afinar</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="ha-lane"><span class="lane-chip playing">G</span><span class="lane-chip target">D</span><span class="lane-chip">Em</span><span class="lane-chip">C</span></div>
        <div class="ha-hit">✓</div>
        <div class="ha-neck">${[0, 1, 2, 3, 4, 5].map((i) => `<i style="top:${12 + i * 15}%"></i>`).join('')}<b style="left:34%;top:52%">1</b><b style="left:56%;top:22%">2</b><b style="left:56%;top:82%">3</b></div>
      </div>
    </section>

    <section class="stats">
      <div><strong>🔥 ${t.streak}</strong><span>dia${t.streak === 1 ? '' : 's'} seguido${t.streak === 1 ? '' : 's'}</span></div>
      <div><strong>${t.minutes}</strong><span>minutos tocados</span></div>
      <div><strong>${t.songs}</strong><span>músicas praticadas</span></div>
      <div><strong>${t.hits}</strong><span>acertos</span></div>
      <div><strong>🏆 ${t.mastered}</strong><span>dominadas (90%+)</span></div>
    </section>

    ${recent.length ? `<section><div class="sec-head"><h2>Continue tocando</h2><a href="#/repertorio">Ver tudo</a></div>
      <div class="song-grid">${recent.map(songCard).join('')}</div></section>` : ''}

    <section><div class="sec-head"><h2>Gêneros</h2><a href="#/musicas">Ver todas</a></div>
      <div class="genre-grid">${GENRES.map((g) => {
        const n = songs.filter((s) => s.genre === g.id).length;
        return `<a class="genre-card g-${g.id}" href="#/musicas?g=${g.id}"><span>${g.icon}</span><b>${g.name}</b><small>${n} música${n === 1 ? '' : 's'}</small></a>`;
      }).join('')}</div></section>

    <section><div class="sec-head"><h2>Para começar</h2><a href="#/musicas?n=1">Mais fáceis</a></div>
      <div class="song-grid">${easy.map(songCard).join('')}</div></section>

    <section><h2>Ferramentas</h2>
      <div class="tool-grid">
        <a class="tool-card" href="#/afinador"><span>🎯</span><b>Afinador</b><small>Afine pelo microfone</small></a>
        <a class="tool-card" href="#/treino"><span>🏋️</span><b>Treino de trocas</b><small>Acordes por minuto</small></a>
        <a class="tool-card" href="#/importar"><span>📥</span><b>Importar</b><small>Colar cifra ou gerar de um áudio</small></a>
        <a class="tool-card" href="#/nova"><span>✍️</span><b>Nova cifra</b><small>Escreva a sua</small></a>
      </div></section>`;
}

// ---------- catálogo ----------
const filters = { q: '', g: '', n: 0, type: '' };

function renderCatalog(root, params) {
  filters.g = params.get('g') || '';
  filters.n = +(params.get('n') || 0);
  filters.q = params.get('q') || filters.q;
  root.innerHTML = `
    <div class="page">
      <h1>Músicas</h1>
      <input type="search" id="catSearch" class="search" placeholder="Buscar por música ou artista…" value="${esc(filters.q)}">
      <div class="chips" id="catGenres">
        <button type="button" data-g="">Todos</button>
        ${GENRES.map((g) => `<button type="button" data-g="${g.id}">${g.icon} ${g.name}</button>`).join('')}
      </div>
      <div class="chips small" id="catMore">
        <button type="button" data-n="0">Qualquer nível</button>
        <button type="button" data-n="1">Fácil</button><button type="button" data-n="2">Médio</button><button type="button" data-n="3">Difícil</button>
        <span class="sep"></span>
        <button type="button" data-t="">Tudo</button>
        <button type="button" data-t="lyrics">Com letra</button>
        <button type="button" data-t="chords">Só acordes</button>
        <button type="button" data-t="tab">Tablatura</button>
        <button type="button" data-t="mine">Minhas</button>
      </div>
      <p class="muted" id="catCount"></p>
      <div class="song-grid" id="catList"></div>
      <p class="muted small-print">As músicas populares vêm só com acordes e estrutura (a letra tem direitos autorais). Abra uma e use <b>Colar letra</b> para completar com a sua cópia pessoal.</p>
    </div>`;
  const draw = () => {
    const q = filters.q.trim().toLowerCase();
    const list = allSongs().filter((s) => (!filters.g || s.genre === filters.g)
      && (!filters.n || s.level === filters.n)
      && (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q))
      && (!filters.type
        || (filters.type === 'tab' && hasTab(s))
        || (filters.type === 'chords' && s.chordsOnly)
        || (filters.type === 'lyrics' && !s.chordsOnly && !hasTab(s))
        || (filters.type === 'mine' && s.mine)))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt'));
    $('#catList').innerHTML = list.map(songCard).join('') || '<p class="muted">Nenhuma música encontrada.</p>';
    $('#catCount').textContent = `${list.length} música${list.length === 1 ? '' : 's'}`;
    $$('#catGenres button').forEach((b) => b.classList.toggle('on', b.dataset.g === filters.g));
    $$('#catMore [data-n]').forEach((b) => b.classList.toggle('on', +b.dataset.n === filters.n));
    $$('#catMore [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === filters.type));
  };
  $('#catSearch').addEventListener('input', (e) => { filters.q = e.target.value; draw(); });
  $('#catGenres').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { filters.g = b.dataset.g; draw(); } });
  $('#catMore').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('n' in b.dataset) filters.n = +b.dataset.n;
    if ('t' in b.dataset) filters.type = b.dataset.t;
    draw();
  });
  draw();
}

// ---------- meu repertório ----------
function renderRepertoire(root) {
  const songs = allSongs();
  const favs = data.favorites.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const mine = songs.filter((s) => s.mine);
  const recent = data.history.map((h) => songs.find((s) => s.id === h.id)).filter(Boolean);
  const block = (title, list, empty) => `<section><h2>${title} <span class="muted">(${list.length})</span></h2>
    ${list.length ? `<div class="song-grid">${list.map(songCard).join('')}</div>` : `<p class="muted">${empty}</p>`}</section>`;
  root.innerHTML = `
    <div class="page">
      <div class="sec-head"><h1>Meu repertório</h1>
        <span><a class="btn" href="#/importar">📥 Importar</a> <a class="btn primary" href="#/nova">+ Nova cifra</a></span></div>
      ${block('★ Favoritas', favs, 'Toque na ☆ de uma música para guardar aqui.')}
      ${block('✍️ Minhas cifras', mine, 'Suas cifras e as letras que você colar aparecem aqui.')}
      ${block('🕘 Tocadas recentemente', recent, 'Nada ainda — escolha uma música!')}
    </div>`;
}

// ===== js/importer.js =====
// Importar: colar uma cifra copiada (limpa o texto) ou gerar a cifra a partir de um áudio.


// linhas que os sites de cifra colocam e que não são música
const JUNK = /^\s*(tom:|capotraste|afinação|afinacao|composição|composicao|colaboração|colaboracao|exibir|imprimir|versão|versao|cifra:|cifra club|ver mais|tablatura de|enviada por|revisada por|\d+\s*(exibições|visualizações))/i;

/** Limpa uma cifra colada de um site. Retorna { text, key, capo }. */
function cleanPasted(raw) {
  let key = '';
  let capo = 0;
  const out = [];
  for (const line of raw.replace(/\r/g, '').replace(/ /g, ' ').split('\n')) {
    const k = /tom:\s*([A-G][#b]?m?)/i.exec(line);
    if (k) key = k[1];
    const c = /capotraste\D*(\d+)/i.exec(line);
    if (c) capo = +c[1];
    if (JUNK.test(line)) continue;
    out.push(line.replace(/\s+$/, ''));
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, key, capo };
}

// ---------- áudio -> acordes ----------
const CANDIDATES = NOTES_SHARP.flatMap((n) => [n, n + 'm', n + '7']).map((name) => ({ name, tpl: chordTemplate(parseChord(name)) }));

/** Acha o acorde de cada trecho e junta trechos iguais. Retorna [{t0, t1, name}]. */
function framesToChords(frames, hop) {
  const maxRms = Math.max(...frames.map((f) => f.rms), 1e-9);
  const labels = frames.map((f) => {
    if (f.rms < maxRms * 0.04) return 'N';
    let best = 'N';
    let s = 0.55;
    for (const c of CANDIDATES) {
      // acordes com 7ª só ganham com folga (senão tudo vira "7")
      const v = cosine(f.chroma, c.tpl) - (c.name.endsWith('7') ? 0.03 : 0);
      if (v > s) { s = v; best = c.name; }
    }
    return best;
  });
  // votação numa janela de ~1,4 s para tirar o "tremido"
  const W = Math.max(2, Math.round(0.7 / hop));
  const smooth = labels.map((_, i) => {
    const count = {};
    for (let j = Math.max(0, i - W); j <= Math.min(labels.length - 1, i + W); j++) count[labels[j]] = (count[labels[j]] || 0) + 1;
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
  });
  const segs = [];
  smooth.forEach((name, i) => {
    const t = frames[i].t;
    const last = segs[segs.length - 1];
    if (last && last.name === name) last.t1 = t + hop;
    else segs.push({ t0: t, t1: t + hop, name });
  });
  // trechos curtos demais (< 0,8 s) entram no anterior
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && (s.t1 - s.t0 < 0.8 || s.name === last.name)) last.t1 = s.t1;
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.name !== 'N');
}

/** Monta o texto da cifra (4 acordes por linha). */
function chordsToText(segs) {
  const lines = [];
  for (let i = 0; i < segs.length; i += 4) lines.push(segs.slice(i, i + 4).map((s) => s.name.padEnd(6)).join(' ').trimEnd());
  return lines.join('\n');
}

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let audioUrl = null;

function renderImport(root) {
  root.innerHTML = `
    <div class="page narrow">
      <h1>Importar</h1>

      <section class="card">
        <h2>📋 Colar cifra de um site</h2>
        <p class="muted">Copie a cifra de um site (só a parte da música) e cole aqui. O Cifra Viva limpa o texto, entende os acordes acima da letra, tablaturas e o tom. Para uso pessoal.</p>
        <div class="form-grid">
          <label>Título <input id="imTitle" placeholder="Nome da música"></label>
          <label>Artista <input id="imArtist"></label>
          <label>Gênero <select id="imGenre">${GENRES.map((g) => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('')}</select></label>
        </div>
        <textarea id="imText" rows="12" spellcheck="false" placeholder="Cole a cifra aqui…"></textarea>
        <div class="actions"><button type="button" class="primary" id="imSave">Salvar e abrir</button></div>
      </section>

      <section class="card">
        <h2>🎧 Gerar cifra a partir de um áudio</h2>
        <p class="muted">Escolha um arquivo de música (MP3, WAV, M4A…). O Cifra Viva escuta a música inteira e descobre os acordes. Funciona melhor em gravações de violão/voz; com banda completa ele erra mais — revise antes de salvar.</p>
        <input type="file" id="auFile" accept="audio/*">
        <div class="progress" id="auProgress" hidden><div></div></div>
        <div id="auResult" hidden>
          <audio id="auPlayer" controls></audio>
          <div class="au-now">
            <div><span class="label">Agora</span><div class="chord-name big" id="auNow">–</div></div>
            <div id="auDiagram"></div>
            <div><span class="label">Próximo</span><div class="chord-name" id="auNext">–</div></div>
          </div>
          <div class="au-timeline" id="auTimeline"></div>
          <div class="form-grid">
            <label>Título <input id="auTitle"></label>
            <label>Artista <input id="auArtist"></label>
          </div>
          <div class="actions"><button type="button" class="primary" id="auSave">Salvar como cifra</button></div>
        </div>
      </section>
    </div>`;

  $('#imSave').addEventListener('click', () => {
    const { text, key, capo } = cleanPasted($('#imText').value);
    if (!text) { alert('Cole a cifra primeiro.'); return; }
    const firstLine = text.split('\n')[0].trim();
    const id = 'u' + Date.now();
    saveSong({
      id,
      title: $('#imTitle').value.trim() || firstLine.slice(0, 60) || 'Cifra importada',
      artist: $('#imArtist').value.trim(),
      genre: $('#imGenre').value,
      level: 2,
      key,
      capo: capo || undefined,
      text,
    });
    location.hash = '#/musica/' + id;
  });

  let segs = [];
  $('#auFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#auResult').hidden = true;
    $('#auProgress').hidden = false;
    const bar = $('#auProgress div');
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      ctx.close();
      const hop = 0.2;
      const frames = await analyzeAudioBuffer(buf, hop, (p) => { bar.style.width = Math.round(p * 100) + '%'; });
      segs = framesToChords(frames, hop);
    } catch (err) {
      alert('Não consegui ler esse arquivo de áudio: ' + (err.message || err.name));
      $('#auProgress').hidden = true;
      return;
    }
    $('#auProgress').hidden = true;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    $('#auPlayer').src = audioUrl;
    $('#auTitle').value = file.name.replace(/\.[^.]+$/, '');
    $('#auTimeline').innerHTML = segs.map((s, i) => `<button type="button" class="au-chip" data-i="${i}"><b>${esc(s.name)}</b><small>${fmt(s.t0)}</small></button>`).join('');
    $('#auResult').hidden = false;
  });

  // tocar junto: destaca o acorde da hora enquanto a música toca
  let lastI = -1;
  $('#auPlayer').addEventListener('timeupdate', () => {
    const t = $('#auPlayer').currentTime;
    const i = segs.findIndex((s) => t >= s.t0 && t < s.t1);
    if (i === lastI) return;
    lastI = i;
    document.querySelectorAll('.au-chip.now').forEach((c) => c.classList.remove('now'));
    const chip = document.querySelector(`.au-chip[data-i="${i}"]`);
    chip?.classList.add('now');
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('#auNow').textContent = segs[i]?.name || '–';
    $('#auNext').textContent = segs[i + 1]?.name || '–';
    $('#auDiagram').innerHTML = segs[i] ? diagramSVG(voicingsFor(segs[i].name)[0]) : '';
  });
  $('#auTimeline').addEventListener('click', (e) => {
    const c = e.target.closest('.au-chip');
    if (!c) return;
    $('#auPlayer').currentTime = segs[+c.dataset.i].t0;
    $('#auPlayer').play();
  });
  $('#auSave').addEventListener('click', () => {
    if (!segs.length) return;
    const id = 'u' + Date.now();
    saveSong({
      id,
      title: $('#auTitle').value.trim() || 'Música do áudio',
      artist: $('#auArtist').value.trim(),
      genre: 'pop',
      level: 2,
      text: '[Acordes detectados do áudio — revise]\n' + chordsToText(segs),
    });
    location.hash = '#/musica/' + id;
  });
}

function stopImport() {
  const p = $('#auPlayer');
  if (p) p.pause();
}

// ===== js/account.js =====
// Conta e sincronização (celular <-> computador) usando a API em PHP + MySQL da Hostinger.
// Sem a API (ex.: abrindo o arquivo direto ou no GitHub Pages) tudo continua só no navegador.


const API = 'api/index.php';
const TOKEN_KEY = 'cifraviva.token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* sem armazenamento */ }
let apiInfo = null; // { ok, registration } quando a API existe
let email = '';
let pushTimer = 0;
let syncing = false;

async function call(action, body) {
  const res = await fetch(`${API}?a=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

async function detectApi() {
  if (!location.protocol.startsWith('http')) return null;
  try {
    const r = await call('ping');
    apiInfo = r && r.ok === true ? r : null; // só vale se o PHP respondeu de verdade
  } catch {
    apiInfo = null;
  }
  if (apiInfo && token) {
    try {
      email = (await call('me')).email;
      await pullAndMerge();
    } catch {
      setToken(null);
    }
  }
  updateBadge();
  return apiInfo;
}

function setToken(t) {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento */ }
}

function updateBadge() {
  const a = $('#accountLink');
  if (!a) return;
  a.hidden = !apiInfo;
  a.textContent = token ? '👤 ' + (email.split('@')[0] || 'Conta') : '👤 Entrar';
  a.classList.toggle('on', !!token);
}

/** Junta os dados da nuvem com os do aparelho (nada se perde). */
function merge(local, remote) {
  const byId = new Map();
  for (const s of [...(remote.songs || []), ...(local.songs || [])]) {
    const prev = byId.get(s.id);
    if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(s.id, s);
  }
  const deleted = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  const maxMap = (a = {}, b = {}) => {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = Math.max(o[k] || 0, v);
    return o;
  };
  const progress = { ...(remote.progress || {}) };
  for (const [id, p] of Object.entries(local.progress || {})) {
    const r = progress[id];
    progress[id] = !r ? p : {
      plays: Math.max(p.plays, r.plays), hits: Math.max(p.hits, r.hits), misses: Math.max(p.misses, r.misses),
      best: Math.max(p.best, r.best), lastAt: Math.max(p.lastAt || 0, r.lastAt || 0),
    };
  }
  const history = [...(local.history || []), ...(remote.history || [])]
    .sort((a, b) => b.at - a.at).filter((h, i, arr) => arr.findIndex((x) => x.id === h.id) === i).slice(0, 30);
  const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
  return {
    ...newer,
    songs: [...byId.values()].filter((s) => !deleted.has(s.id)),
    deleted: [...deleted],
    favorites: newer.favorites || [],
    history,
    progress,
    days: maxMap(local.days, remote.days),
    drills: maxMap(local.drills, remote.drills),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };
}

async function pullAndMerge() {
  syncing = true;
  try {
    const remote = await call('pull');
    const merged = remote.data ? merge(JSON.parse(JSON.stringify(data)), remote.data) : data;
    replaceAll(merged);
    await call('push', { data: merged });
  } finally {
    syncing = false;
  }
}

// envia as mudanças para a nuvem alguns segundos depois de cada alteração
onChange(() => {
  if (!token || !apiInfo || syncing) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => call('push', { data }).catch(() => {}), 2500);
});

function renderAccount(root) {
  if (!apiInfo) {
    root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
      <div class="card"><p>A conta e a sincronização entre celular e computador funcionam quando o site está publicado na <b>Hostinger</b> (com a pasta <code>api/</code> configurada).</p>
      <p class="muted">Por enquanto suas cifras e seu progresso ficam salvos só neste navegador.</p></div></div>`;
    return;
  }
  if (token) {
    root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
      <div class="card"><p>Você entrou como <b>${esc(email)}</b>.</p>
      <p class="muted">Suas cifras, favoritas e progresso são sincronizados automaticamente entre os aparelhos em que você entrar.</p>
      <div class="actions"><button type="button" class="primary" id="acSync">🔄 Sincronizar agora</button><button type="button" id="acLogout">Sair</button></div>
      <p class="muted" id="acMsg"></p></div></div>`;
    $('#acSync').addEventListener('click', async () => {
      $('#acMsg').textContent = 'Sincronizando…';
      try { await pullAndMerge(); $('#acMsg').textContent = 'Tudo sincronizado ✓'; } catch (e) { $('#acMsg').textContent = e.message; }
    });
    $('#acLogout').addEventListener('click', async () => {
      await call('logout', {}).catch(() => {});
      setToken(null);
      email = '';
      updateBadge();
      renderAccount(root);
    });
    return;
  }
  root.innerHTML = `<div class="page narrow"><h1>Entrar</h1>
    <form class="card form-stack" id="acForm">
      <label>E-mail <input type="email" id="acEmail" required autocomplete="username"></label>
      <label>Senha <input type="password" id="acPass" required minlength="8" autocomplete="current-password"></label>
      <div class="actions">
        <button type="submit" class="primary" value="login">Entrar</button>
        ${apiInfo.registration ? '<button type="submit" value="register">Criar conta</button>' : ''}
      </div>
      <p class="muted" id="acMsg">${apiInfo.registration ? 'Primeira vez? Preencha e clique em Criar conta (senha com 8+ caracteres).' : ''}</p>
    </form></div>`;
  $('#acForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter?.value === 'register' ? 'register' : 'login';
    $('#acMsg').textContent = 'Aguarde…';
    try {
      const r = await call(action, { email: $('#acEmail').value.trim(), password: $('#acPass').value });
      setToken(r.token);
      email = r.email;
      await pullAndMerge();
      updateBadge();
      renderAccount(root);
    } catch (err) {
      $('#acMsg').textContent = err.message;
    }
  });
}

// ===== js/app.js =====
// Navegação entre as páginas do site (#/, #/musicas, #/musica/id, ...).


const VIEWS = {
  '': { view: 'page', nav: 'home', render: renderHome },
  musicas: { view: 'page', nav: 'catalog', render: renderCatalog },
  repertorio: { view: 'page', nav: 'repertoire', render: renderRepertoire },
  afinador: { view: 'page', nav: 'tuner', render: renderTuner },
  treino: { view: 'page', nav: 'practice', render: renderPractice },
  importar: { view: 'page', nav: 'import', render: renderImport },
  conta: { view: 'page', nav: 'account', render: renderAccount },
  musica: { view: 'player', nav: 'catalog' },
};

let current = null;

function leave() {
  closePlayer();
  stopTuner();
  stopDrill();
  stopImport();
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const [name, arg] = path.split('/');
  const params = new URLSearchParams(query);

  if (name === 'nova') { // abre o editor por cima da página atual
    history.replaceState(null, '', current ? '#/' + current : '#/');
    openEditor(null);
    return;
  }
  const v = VIEWS[name] ?? VIEWS[''];
  leave();
  current = hash;
  $('#view-page').hidden = v.view !== 'page';
  $('#view-player').hidden = v.view !== 'player';
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === v.nav));

  if (v.view === 'player') {
    if (!openSong(decodeURIComponent(arg || ''))) { location.hash = '#/musicas'; return; }
    scrollTo(0, 0);
  } else {
    v.render($('#view-page'), params);
    scrollTo(0, 0);
  }
  document.title = v.view === 'player' ? `${playerState.song.title} · Cifra Viva` : 'Cifra Viva';
}

addEventListener('hashchange', route);

// ---------- início ----------
$('#sensitivity').value = data.prefs.sensitivity;
$('#speed').value = data.prefs.speed;
setFont(data.prefs.fontSize || 20);
route();
detectApi();

// "instalar" no celular e funcionar sem internet quando publicado em https
if (location.protocol === 'https:') {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}

// ganchos para teste/depuração no console
window.cifraviva = { state: playerState, startFollow, stopListen, strum, resetScore, toggleListen: (f) => startFollow('mic', f) };

})();
