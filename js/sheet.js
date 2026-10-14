// Lê a cifra em texto. Aceita dois formatos (podem até se misturar):
//  1) acordes numa linha acima da letra (como nos sites de cifra)
//  2) acordes entre colchetes dentro da letra: "[G]Saio cedo pela [D]estrada"

import { isChord } from './chords.js';

const SECTION_RE = /^(intro|introdução|introducao|verso|estrofe|refrão|refrao|pré-refrão|pre-refrão|pre-refrao|ponte|solo|final|outro|coda|interlúdio|interludio|parte\s*\d+|primeira parte|segunda parte|terceira parte)\s*:?$/i;
// coisas que aparecem nas linhas de acordes e não são acordes: |, 2x, (x2), (2x), -, ...
const NOISE_TOKEN = /^(\|+|:?\|\|?:?|x\d+|\d+x|\(x?\d+x?\)|-+|\.+|%|\(|\)|→|>)$/i;

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
export function parseSheet(text) {
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
