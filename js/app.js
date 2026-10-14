import { parseSheet } from './sheet.js';
import { parseChord, chordTemplate, transposeChord, pitchClasses, COMMON_CHORDS, NOTES_SHARP } from './chords.js';
import { ChromaListener, cosine } from './audio.js';
import { Follower } from './follower.js';
import { DEMO_SONGS } from './songs.js';
import { voicingsFor, voicingNotes } from './guitar.js';
import { diagramSVG } from './diagram.js';
import { VirtualGuitar } from './synth.js';
import { GuitarView } from './guitarview.js';

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
