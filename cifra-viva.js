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

/**
 * Retorna linhas do tipo:
 *  {type:'section', text} | {type:'lyric', segments:[{chord, text}]} | {type:'chords', chords:[]} | {type:'blank'}
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
// Escuta o microfone e transforma o som em um "cromagrama": quanto de cada uma
// das 12 notas (C, C#, D ... B) está soando agora, independente da oitava.

class ChromaListener {
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

// ===== js/follower.js =====
// Acompanha em que acorde da música você está. Só compara o som com o acorde
// atual e os próximos (e não com todos os acordes do mundo), o que deixa a
// detecção bem mais robusta do que tentar "adivinhar" o acorde do zero.


class Follower {
  constructor(events, onMove) {
    this.events = events; // [{name, tpl}]
    this.onMove = onMove;
    this.allowSkip = true; // aceitar pular um acorde (útil no violão real, desligado no virtual)
    // todos os acordes "concorrentes": se o som parece mais com outro acorde, não avança
    const seen = new Set();
    this.rivals = [...COMMON_CHORDS, ...events].filter((c) => !seen.has(c.name) && seen.add(c.name)).map((c) => c.tpl);
    this.pos = 0;
    this.enteredAt = performance.now();
    this.avgDur = 2200; // duração média de um acorde (ms), aprendida enquanto você toca
    this.evidence = [0, 0];
    this.setSensitivity(5);
  }

  /** 1 (cauteloso) a 10 (muito sensível). */
  setSensitivity(s) {
    this.margin = 0.13 - s * 0.011; // quanto o próximo acorde precisa "ganhar" do atual
    this.needFrames = Math.round(9 - s * 0.6); // por quantos quadros de 50 ms seguidos
    this.minSim = 0.62 - s * 0.012;
  }

  setPosition(i) {
    this.pos = Math.max(0, Math.min(this.events.length - 1, i));
    this.enteredAt = performance.now();
    this.evidence = [0, 0];
    this.onMove(this.pos, 'manual');
  }

  similar(a, b) {
    return cosine(a.tpl, b.tpl) > 0.9; // ex.: C e C7M, G e G/B
  }

  update(chroma, now) {
    const ev = this.events;
    const cur = ev[this.pos];
    const n1 = ev[this.pos + 1];
    if (!cur || !n1) return null;
    const n2 = ev[this.pos + 2];
    const sCur = cosine(chroma, cur.tpl);

    // Mesmo acorde repetido (C ... C): não dá para ouvir a troca, então
    // avançamos pelo tempo médio que você costuma ficar em cada acorde.
    if (this.similar(cur, n1)) {
      if (now - this.enteredAt > this.avgDur && sCur > this.minSim) this.advance(1, now, false);
      return { sCur, s1: sCur, s2: 0 };
    }

    const s1 = cosine(chroma, n1.tpl);
    const canSkip = this.allowSkip && n2 && !this.similar(n1, n2) && !this.similar(cur, n2);
    const s2 = canSkip ? cosine(chroma, n2.tpl) : -1;
    const best = s2 > s1 + 0.08 ? 1 : 0;
    const sBest = best ? s2 : s1;
    let sAll = 0;
    for (const t of this.rivals) sAll = Math.max(sAll, cosine(chroma, t));

    if (sBest > this.minSim && sBest > sCur + this.margin && sBest >= sAll - 0.04) {
      this.evidence[best]++;
      this.evidence[1 - best] = Math.max(0, this.evidence[1 - best] - 1);
    } else {
      this.evidence[0] = Math.max(0, this.evidence[0] - 1);
      this.evidence[1] = Math.max(0, this.evidence[1] - 1);
    }

    // Pular um acorde (porque você foi rápido ou ele foi mal detectado) exige mais certeza.
    const need = best ? this.needFrames * 3 : this.needFrames;
    if (this.evidence[best] >= need) this.advance(best + 1, now, true);
    return { sCur, s1, s2 };
  }

  advance(steps, now, learn) {
    const dur = (now - this.enteredAt) / steps;
    if (learn && dur > 300 && dur < 12000) this.avgDur = this.avgDur * 0.7 + dur * 0.3;
    this.pos = Math.min(this.events.length - 1, this.pos + steps);
    this.enteredAt = now;
    this.evidence = [0, 0];
    this.onMove(this.pos, 'audio');
  }
}

// ===== js/songs.js =====
// Músicas de exemplo (letras originais, escritas para demonstrar o site).

const DEMO_SONGS = [
  {
    id: 'demo-estrada',
    demo: true,
    title: 'Estrada de Terra',
    artist: 'Exemplo — acordes acima da letra',
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
    id: 'demo-varanda',
    demo: true,
    title: 'Café na Varanda',
    artist: 'Exemplo — acordes entre colchetes',
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
// Desenho do violão (deitado, braço à esquerda). As cordas vibram ao tocar e o
// braço mostra onde colocar os dedos do acorde.

const NUT = 70; // x da pestana do braço
const FW = 58; // largura de cada casa
const FRETS = 5; // casas visíveis
const BRIDGE = 566;
const SY = (s) => 46 + s * 13.6; // y de cada corda (6ª corda em cima, como você vê olhando para o violão)
const CX = (f, start) => NUT + FW * (f - start + 0.5);

function guitarSVG() {
  const strings = [0, 1, 2, 3, 4, 5].map((s) =>
    `<line class="gv-string" data-s="${s}" x1="22" x2="${BRIDGE}" y1="${SY(s)}" y2="${SY(s)}" stroke-width="${2.6 - s * 0.32}"/>`).join('');
  const frets = Array.from({ length: FRETS }, (_, i) =>
    `<line x1="${NUT + FW * (i + 1)}" x2="${NUT + FW * (i + 1)}" y1="36" y2="124" class="gv-fret"/>`).join('');
  const pegs = [0, 1, 2].map((i) => `<circle cx="${14 + i * 17}" cy="27" r="5.5" class="gv-peg"/><circle cx="${14 + i * 17}" cy="133" r="5.5" class="gv-peg"/>`).join('');
  return `
<svg viewBox="0 0 640 160" class="gv" role="img" aria-label="Violão">
  <path class="gv-body" d="M350,24 C385,8 450,12 472,32 C492,48 522,0 592,2 C652,6 652,154 592,158 C522,160 492,112 472,128 C450,148 385,152 350,136 Z"/>
  <circle cx="440" cy="80" r="34" class="gv-rosette"/>
  <circle cx="440" cy="80" r="27" class="gv-hole"/>
  <rect x="${BRIDGE - 8}" y="40" width="20" height="80" rx="4" class="gv-bridge"/>
  <path class="gv-head" d="M4,30 L${NUT - 6},36 L${NUT - 6},124 L4,130 Q-2,80 4,30 Z"/>
  ${pegs}
  <rect x="${NUT}" y="36" width="${FW * FRETS + 12}" height="88" class="gv-board"/>
  <rect x="${NUT - 6}" y="36" width="6" height="88" class="gv-nut"/>
  ${frets}
  <g id="gv-inlays"></g>
  <g class="gv-strings">${strings}</g>
  <g id="gv-marks"></g>
  <g id="gv-fingers"></g>
  <text id="gv-pos" x="${NUT + FW / 2}" y="148" text-anchor="middle" class="gv-pos"></text>
  <rect x="0" y="0" width="640" height="160" fill="transparent" class="gv-hit"/>
</svg>`;
}

class GuitarView {
  constructor(container, onTap) {
    container.innerHTML = guitarSVG();
    this.svg = container.querySelector('svg');
    this.fingers = this.svg.querySelector('#gv-fingers');
    this.marks = this.svg.querySelector('#gv-marks');
    this.inlays = this.svg.querySelector('#gv-inlays');
    this.pos = this.svg.querySelector('#gv-pos');
    this.strings = [...this.svg.querySelectorAll('.gv-string')];
    this.svg.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap?.(); });
  }

  /** Mostra no braço onde ficam os dedos da forma `v`. */
  showChord(v) {
    this.fingers.innerHTML = '';
    this.marks.innerHTML = '';
    if (!v) return;
    const pressed = v.frets.filter((f) => f > 0);
    const maxF = pressed.length ? Math.max(...pressed) : 0;
    const start = maxF <= FRETS ? 1 : Math.min(...pressed);
    this.pos.textContent = start > 1 ? `${start}ª casa` : '';
    this.inlays.innerHTML = [3, 5, 7, 9, 12].filter((f) => f >= start && f < start + FRETS)
      .map((f) => `<circle cx="${CX(f, start)}" cy="80" r="${f === 12 ? 4 : 5}" class="gv-inlay"/>`).join('');

    const out = [];
    v.frets.forEach((f, s) => {
      if (f < 0) out.push(`<text x="${NUT - 15}" y="${SY(s) + 4}" text-anchor="middle" class="gv-mute">✕</text>`);
      if (f === 0) out.push(`<circle cx="${NUT - 15}" cy="${SY(s)}" r="4.5" class="gv-open"/>`);
    });
    this.marks.innerHTML = out.join('');

    const dots = [];
    if (v.barre) {
      const b = v.barre;
      dots.push(`<rect x="${CX(b.fret, start) - 9}" y="${SY(b.from) - 9}" width="18" height="${SY(b.to) - SY(b.from) + 18}" rx="9" class="gv-dot"/>`);
      dots.push(`<text x="${CX(b.fret, start)}" y="${SY(b.from) + 4}" text-anchor="middle" class="gv-finger">1</text>`);
    }
    v.frets.forEach((f, s) => {
      if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) return;
      dots.push(`<circle cx="${CX(f, start)}" cy="${SY(s)}" r="8.5" class="gv-dot"/>`);
      if (v.fingers[s]) dots.push(`<text x="${CX(f, start)}" y="${SY(s) + 4}" text-anchor="middle" class="gv-finger">${v.fingers[s]}</text>`);
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

// ===== js/app.js =====

const $ = (s) => document.querySelector(s);
const STORE_KEY = 'cifraviva.songs';
const PREFS_KEY = 'cifraviva.prefs';

const state = {
  songs: [],
  song: null,
  transpose: 0,
  fontSize: 20,
  events: [],
  follower: null,
  listener: null,
  noise: null,
  calib: [],
  autoScroll: null,
  mode: null, // 'mic' | 'virtual' enquanto estiver seguindo
  vguitar: null, // violão virtual ligado ao detector
  preview: null, // violão só para ouvir o acorde (fora do modo virtual)
  voicing: {}, // acorde -> índice da variação escolhida
};

// ---------- armazenamento ----------
function loadUserSongs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function saveUserSongs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.songs.filter((s) => !s.demo))); } catch { /* sem armazenamento */ }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      songId: state.song?.id, fontSize: state.fontSize,
      sensitivity: +$('#sensitivity').value, speed: +$('#speed').value,
    }));
  } catch { /* sem armazenamento */ }
}

// ---------- renderização ----------
function chordEl(name, row) {
  const b = document.createElement('b');
  b.className = 'ch';
  if (!name) return b;
  const shown = transposeChord(name, state.transpose);
  const parsed = parseChord(shown);
  b.textContent = shown;
  b.dataset.i = state.events.length;
  state.events.push({ name: shown, tpl: chordTemplate(parsed), pcs: pitchClasses(parsed), el: b, row });
  return b;
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
    if (r.type === 'lyric') {
      if (!r.segments.some((s) => s.chord)) row.classList.add('nochords');
      for (const seg of r.segments) {
        // quebra por palavra para a linha poder quebrar em telas estreitas
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
  $('#songTitle').textContent = state.song.title;
  $('#songArtist').textContent = state.song.artist || '';
  $('#transposeLabel').textContent = state.transpose > 0 ? '+' + state.transpose : String(state.transpose);

  const pos = state.follower ? Math.min(state.follower.pos, state.events.length - 1) : 0;
  const sens = +$('#sensitivity').value;
  state.follower = new Follower(state.events, onMove);
  state.follower.setSensitivity(sens);
  state.follower.pos = Math.max(0, pos);
  state.follower.allowSkip = state.mode !== 'virtual';
  renderChordPanel();
  renderDock();
  highlight(state.follower.pos, false);
}

// ---------- desenhos dos acordes ----------
function uniqueChords() {
  return [...new Set(state.events.map((e) => e.name))];
}

function currentVoicing(name) {
  const list = voicingsFor(name);
  const i = Math.min(state.voicing[name] || 0, Math.max(0, list.length - 1));
  return { list, i, v: list[i] };
}

function chordCard(name) {
  const { list, i, v } = currentVoicing(name);
  const card = document.createElement('div');
  card.className = 'chord-card';
  card.dataset.chord = name;
  card.innerHTML = `
    <div class="chord-name">${name}</div>
    <button type="button" class="diagram-btn" title="Ouvir ${name}">${diagramSVG(v)}</button>
    <div class="variation">
      <button type="button" class="var-prev" ${list.length < 2 ? 'disabled' : ''} aria-label="Forma anterior">‹</button>
      <span>${list.length ? i + 1 : 0}/${list.length}</span>
      <button type="button" class="var-next" ${list.length < 2 ? 'disabled' : ''} aria-label="Próxima forma">›</button>
    </div>`;
  return card;
}

function renderChordPanel() {
  const panel = $('#chordPanel');
  panel.innerHTML = '';
  uniqueChords().forEach((n) => panel.appendChild(chordCard(n)));
}

function changeVoicing(name, delta) {
  const { list, i } = currentVoicing(name);
  if (!list.length) return;
  state.voicing[name] = (i + delta + list.length) % list.length;
  renderChordPanel();
  renderDock();
  highlight(state.follower.pos, false);
  strum(name);
}

$('#chordPanel').addEventListener('click', (e) => {
  const card = e.target.closest('.chord-card');
  if (!card) return;
  const name = card.dataset.chord;
  if (e.target.closest('.var-prev')) changeVoicing(name, -1);
  else if (e.target.closest('.var-next')) changeVoicing(name, 1);
  else if (e.target.closest('.diagram-btn')) strum(name);
});

// desenho ao passar o mouse sobre um acorde da letra
const tip = $('#chordTip');
$('#sheet').addEventListener('mouseover', (e) => {
  const ch = e.target.closest('.ch[data-i]');
  if (!ch) return;
  const name = ch.textContent;
  tip.innerHTML = `<div class="chord-name">${name}</div>${diagramSVG(currentVoicing(name).v)}`;
  const r = ch.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 110, Math.max(8, r.left - 20)) + 'px';
  tip.style.top = (r.top > 150 ? r.top - 140 : r.bottom + 8) + 'px';
  tip.hidden = false;
});
$('#sheet').addEventListener('mouseout', (e) => {
  if (e.target.closest('.ch[data-i]')) tip.hidden = true;
});
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

// ---------- violão virtual ----------
function strum(name) {
  const { v } = currentVoicing(name);
  if (!v) return;
  let g = state.vguitar;
  if (!g) {
    if (!state.preview) state.preview = new VirtualGuitar(new (window.AudioContext || window.webkitAudioContext)());
    g = state.preview;
    g.ctx.resume();
  }
  g.strum(voicingNotes(v));
  state.lastStrum = name;
  guitarView.strum(v);
  const btn = $(`#dock .dock-chord[data-chord="${CSS.escape(name)}"]`);
  if (btn) { btn.classList.remove('struck'); void btn.offsetWidth; btn.classList.add('struck'); }
}

// tocar nas cordas do desenho repete o último acorde (ou toca o acorde atual)
const guitarView = new GuitarView($('#guitar'), () => {
  const name = state.lastStrum || state.events[state.follower.pos]?.name;
  if (name) strum(name);
});

function renderDock() {
  const box = $('#dockChords');
  box.innerHTML = '';
  uniqueChords().forEach((name, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-chord';
    b.dataset.chord = name;
    b.innerHTML = `<span class="chord-name">${name}</span>${k < 9 ? `<kbd>${k + 1}</kbd>` : ''}`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); strum(name); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strum(name); } });
    box.appendChild(b);
  });
}

function updateDockHints(i) {
  const cur = state.events[i]?.name;
  const next = state.events[i + 1]?.name;
  document.querySelectorAll('#dock .dock-chord').forEach((b) => {
    b.classList.toggle('is-current', b.dataset.chord === cur);
    b.classList.toggle('is-next', b.dataset.chord === next && next !== cur);
  });
  // o braço do violão já mostra a posição do PRÓXIMO acorde, para você se preparar
  const show = next || cur;
  guitarView.showChord(show && currentVoicing(show).v);
  $('#dockHint').innerHTML = next
    ? `Agora <b>${cur}</b> · próximo <b class="hint-next">${next}</b> <span class="label">(dedos no braço)</span>`
    : `Último acorde: <b>${cur || '–'}</b>`;
}

function highlight(i, scroll = true) {
  document.querySelectorAll('.ch.current, .ch.next').forEach((e) => e.classList.remove('current', 'next'));
  document.querySelectorAll('.row.current, .row.past').forEach((e) => e.classList.remove('current', 'past'));
  const ev = state.events[i];
  if (!ev) return;
  ev.el.classList.add('current');
  state.events[i + 1]?.el.classList.add('next');
  ev.row.classList.add('current');
  updateDockHints(i);
  let r = ev.row.previousElementSibling;
  while (r) { r.classList.add('past'); r = r.previousElementSibling; }
  if (scroll) scrollToRow(ev.row);
}

function onMove(i) {
  highlight(i);
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
  // deixa a linha atual a ~1/4 da área visível (descontando a barra fixa no topo e
  // o violão embaixo), então as próximas linhas já ficam visíveis
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
  const box = $('#chroma');
  box.innerHTML = '';
  NOTES_SHARP.forEach((n) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `<div class="fill"></div><div class="note">${n}</div>`;
    box.appendChild(bar);
  });
}

function onAudioFrame({ chroma, rms, time }) {
  // calibra o ruído ambiente no primeiro segundo
  if (state.noise === null) {
    state.calib.push(rms);
    if (state.calib.length >= 20) {
      const avg = state.calib.reduce((a, b) => a + b, 0) / state.calib.length;
      state.noise = Math.max(0.004, avg * 2.5);
      setStatus('Pode tocar! Toque o <b>primeiro acorde</b> destacado e siga a música. Se ele se perder, clique no acorde certo.');
    }
    return;
  }

  const active = rms > state.noise;
  const lvl = $('#levelBar');
  lvl.style.height = Math.min(100, (rms / (state.noise * 4)) * 100) + '%';
  lvl.classList.toggle('active', active);

  const cur = state.events[state.follower.pos];
  const bars = $('#chroma').children;
  for (let i = 0; i < 12; i++) {
    bars[i].firstChild.style.height = (active ? chroma[i] * 100 : 0) + '%';
    bars[i].classList.toggle('expected', !!cur && cur.pcs.includes(i));
  }
  if (!active) { $('#heardChord').textContent = '–'; return; }

  let best = null;
  let bestS = 0;
  for (const c of COMMON_CHORDS) {
    const s = cosine(chroma, c.tpl);
    if (s > bestS) { bestS = s; best = c.name; }
  }
  $('#heardChord').textContent = bestS > 0.6 ? best : '?';
  state.follower.update(chroma, time);
}

const MODE_BUTTONS = {
  mic: { btn: '#btnListen', idle: '🎤 <span class="long">Ouvir violão</span><span class="short">Ouvir</span>', on: '⏹ <span class="long">Parar</span><span class="short">Parar</span>' },
  virtual: { btn: '#btnVirtual', idle: '🎸 <span class="long">Violão virtual</span><span class="short">Virtual</span>', on: '⏹ <span class="long">Fechar violão</span><span class="short">Fechar</span>' },
};

/**
 * Começa a seguir a música. No modo 'virtual' o som do violão sintetizado entra
 * direto no mesmo detector do microfone, então o teste é o mesmo de um violão real.
 */
async function startFollow(mode, sourceFactory) {
  const was = state.mode;
  if (state.listener) stopListen();
  if (was === mode && !sourceFactory) return; // clicou de novo no mesmo botão: só desliga
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
    setStatus('Não consegui acessar o microfone (' + (err.message || err.name) + '). Verifique a permissão do navegador.');
    return;
  }
  state.listener = listener;
  state.mode = mode;
  state.follower.allowSkip = mode !== 'virtual';
  buildChromaMeter();
  $('#monitor').hidden = false;
  const m = MODE_BUTTONS[mode];
  if (m) { $(m.btn).classList.add('on'); $(m.btn).innerHTML = m.on; }
  if (mode === 'virtual') {
    state.noise = 0.004; // sem ruído ambiente: não precisa calibrar
    $('#dock').hidden = false;
    document.body.classList.add('has-dock');
    setStatus('Toque os acordes embaixo do violão (no computador, teclas 1–9). Quando você toca o <b>próximo acorde certo</b>, a letra avança.');
  } else {
    setStatus('Calibrando… fique em silêncio por um segundo.');
  }
  keepAwake(true);
  highlight(state.follower.pos);
}

const toggleListen = (sourceFactory) => startFollow('mic', sourceFactory);

function stopListen() {
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

// ---------- tela sempre ligada enquanto você toca (celular) ----------
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
  } catch { /* sem suporte ou sem permissão: segue sem */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.listener || state.autoScroll)) keepAwake(true);
});

// ---------- rolagem por tempo (sem microfone) ----------
function toggleAuto() {
  if (state.autoScroll) { stopAuto(); return; }
  if (state.listener) stopListen();
  smooth.cancel();
  let y = scrollY;
  let last = performance.now();
  const step = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    y += (+$('#speed').value) * dt;
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

// ---------- músicas ----------
function fillSelect() {
  const sel = $('#songSelect');
  sel.innerHTML = '';
  for (const s of state.songs) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.title + (s.artist ? ' — ' + s.artist : '');
    sel.appendChild(o);
  }
  sel.value = state.song?.id;
}

function selectSong(id) {
  state.song = state.songs.find((s) => s.id === id) || state.songs[0];
  state.transpose = state.song.transpose || 0;
  state.follower = null;
  renderSheet();
  $('#btnDelete').hidden = !!state.song.demo;
  scrollTo(0, 0);
  savePrefs();
}

function openEditor(song) {
  $('#editorHeading').textContent = song ? 'Editar cifra' : 'Nova cifra';
  $('#edTitle').value = song?.title || '';
  $('#edArtist').value = song?.demo ? '' : song?.artist || '';
  $('#edText').value = song?.text || '';
  $('#editor').dataset.id = song && !song.demo ? song.id : '';
  $('#editor').showModal();
}

function saveEditor() {
  const id = $('#editor').dataset.id;
  const data = { title: $('#edTitle').value.trim(), artist: $('#edArtist').value.trim(), text: $('#edText').value };
  if (!data.title) return;
  let song = id && state.songs.find((s) => s.id === id);
  if (song) Object.assign(song, data);
  else {
    song = { id: 'u' + Date.now(), ...data };
    state.songs.push(song);
  }
  saveUserSongs();
  fillSelect();
  selectSong(song.id);
  $('#songSelect').value = song.id;
}

// ---------- eventos da interface ----------
$('#btnListen').addEventListener('click', () => startFollow('mic'));
$('#btnVirtual').addEventListener('click', () => startFollow('virtual'));
$('#dockClose').addEventListener('click', stopListen);
$('#btnSettings').addEventListener('click', () => {
  const open = $('#toolbar').classList.toggle('show-settings');
  $('#btnSettings').setAttribute('aria-expanded', open);
});

// "instalar" no celular (tela inicial) quando o site está publicado em http(s)
if (location.protocol.startsWith('http')) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
}
$('#btnAuto').addEventListener('click', toggleAuto);
$('#songSelect').addEventListener('change', (e) => selectSong(e.target.value));
$('#btnNew').addEventListener('click', () => openEditor(null));
$('#btnEdit').addEventListener('click', () => openEditor(state.song));
$('#edCancel').addEventListener('click', () => $('#editor').close());
$('#editorForm').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'save') saveEditor();
});
$('#btnDelete').addEventListener('click', () => {
  if (state.song.demo || !confirm(`Excluir "${state.song.title}"?`)) return;
  state.songs = state.songs.filter((s) => s !== state.song);
  saveUserSongs();
  fillSelect();
  selectSong(state.songs[0].id);
});

function setTranspose(t) {
  state.transpose = ((t + 17) % 12) - 5; // de -5 a +6
  if (!state.song.demo) { state.song.transpose = state.transpose; saveUserSongs(); }
  renderSheet();
}
$('#btnTUp').addEventListener('click', () => setTranspose(state.transpose + 1));
$('#btnTDown').addEventListener('click', () => setTranspose(state.transpose - 1));

function setFont(px) {
  state.fontSize = Math.max(12, Math.min(40, px));
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'px');
  savePrefs();
}
$('#btnFontUp').addEventListener('click', () => setFont(state.fontSize + 2));
$('#btnFontDown').addEventListener('click', () => setFont(state.fontSize - 2));
$('#btnRestart').addEventListener('click', () => { state.follower.setPosition(0); smooth.to(0); });

$('#sensitivity').addEventListener('input', (e) => { state.follower.setSensitivity(+e.target.value); savePrefs(); });
$('#speed').addEventListener('input', savePrefs);

$('#sheet').addEventListener('click', (e) => {
  const ch = e.target.closest('.ch[data-i]');
  if (ch) state.follower.setPosition(+ch.dataset.i);
});

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'ArrowRight') { state.follower.setPosition(state.follower.pos + 1); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { state.follower.setPosition(state.follower.pos - 1); e.preventDefault(); }
  if (state.mode === 'virtual' && /^[1-9]$/.test(e.key)) {
    const name = uniqueChords()[+e.key - 1];
    if (name) strum(name);
  }
});

// ---------- início ----------
const prefs = loadPrefs();
state.songs = [...DEMO_SONGS, ...loadUserSongs()];
if (prefs.sensitivity) $('#sensitivity').value = prefs.sensitivity;
if (prefs.speed) $('#speed').value = prefs.speed;
setFont(prefs.fontSize || 20);
state.song = state.songs.find((s) => s.id === prefs.songId) || state.songs[0];
fillSelect();
selectSong(state.song.id);

// ganchos para teste/depuração no console
window.cifraviva = { state, toggleListen, startFollow, strum };

})();
