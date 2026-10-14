// Página da música: cifra/tablatura, modo jogo (microfone ou violão virtual),
// metrônomo com a batida, desenhos dos acordes, edição.

import { parseSheet } from './sheet.js';
import { parseChord, chordTemplate, transposeChord, pitchClasses, COMMON_CHORDS, NOTES_SHARP } from './chords.js';
import { ChromaListener, cosine, noteName } from './audio.js';
import { Follower } from './follower.js';
import { GENRES } from './songs.js';
import { voicingsFor, voicingNotes, TUNING } from './guitar.js';
import { diagramSVG } from './diagram.js';
import { VirtualGuitar } from './synth.js';
import { GuitarView } from './guitarview.js';
import { Metronome } from './tools.js';
import {
  $, $$, esc, data, save, getSong, saveSong, deleteSong, isFavorite, toggleFavorite, touchHistory, recordSession,
} from './store.js';

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

export function resetScore() {
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
export async function startFollow(mode, sourceFactory) {
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

export function stopListen() {
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
export function openSong(id) {
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

export function closePlayer() {
  if (state.listener) stopListen();
  stopAuto();
  if (metronome.running) toggleMetronome();
}

// ---------- editor ----------
export function openEditor(song, { pasteLyrics = false } = {}) {
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

export function setFont(px) {
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

export const playerState = state;
export { strum };
