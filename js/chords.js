// Teoria de acordes: reconhecer nomes, transpor e montar o "perfil de notas" de cada acorde.

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

const CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;
// Sufixos aceitos: m, 7, 7M, maj7, dim, °, aug, +, sus4, 4, 9, add9, (b5), (9), etc.
const QUALITY_RE = /^(?:maj|min|dim|aug|sus|add|m|M|º|°|ø|\+|-|\d|\(|\)|#|b|,)*$/;

export function isChord(token) {
  const m = CHORD_RE.exec(token);
  return !!m && QUALITY_RE.test(m[2]);
}

export function parseChord(name) {
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

export function pitchClasses(chord) {
  const pcs = [chord.root, (chord.root + chord.third) % 12, (chord.root + chord.fifth) % 12];
  for (const e of chord.ext) pcs.push((chord.root + e) % 12);
  return pcs;
}

/** Vetor de 12 posições (C..B) com o peso esperado de cada nota quando o acorde soa. */
export function chordTemplate(chord) {
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

export function transposeChord(name, semis) {
  if (!semis) return name;
  const c = parseChord(name);
  if (!c) return name;
  const preferFlat = c.rootName.includes('b');
  const root = transposeNote(c.rootName, semis, preferFlat);
  const bass = c.bassName ? '/' + transposeNote(c.bassName, semis, preferFlat) : '';
  return root + c.quality + bass;
}

/** Acordes maiores e menores das 12 notas, para mostrar "o que estou ouvindo". */
export const COMMON_CHORDS = NOTES_SHARP.flatMap((n) => [n, n + 'm']).map((name) => {
  const c = parseChord(name);
  return { name, tpl: chordTemplate(c) };
});
