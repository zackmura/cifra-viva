// Formas de acorde no violão (afinação padrão). Primeiro vêm as formas "clássicas"
// conhecidas; depois o gerador encontra outras posições tocáveis para qualquer acorde.

import { parseChord, pitchClasses } from './chords.js';

export const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (6ª corda -> 1ª)

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
export function fingering(frets) {
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
export function voicingsFor(name) {
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
export function voicingNotes(v) {
  return v.frets.map((f, i) => (f >= 0 ? TUNING[i] + f : null)).filter((n) => n !== null);
}
