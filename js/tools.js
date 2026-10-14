// Ferramentas: metrônomo, afinador e treino de troca de acordes.

import { ChromaListener, cosine, NOTE_NAMES } from './audio.js';
import { parseChord, chordTemplate, COMMON_CHORDS } from './chords.js';
import { voicingsFor, voicingNotes, TUNING } from './guitar.js';
import { diagramSVG } from './diagram.js';
import { VirtualGuitar } from './synth.js';
import { $, esc, data, save, addPracticeMinutes } from './store.js';

// ---------- metrônomo ----------
export class Metronome {
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

export function renderTuner(root) {
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

export function stopTuner() {
  tuner?.stop();
  tuner = null;
  const b = $('#tnStart');
  if (b) b.textContent = '🎤 Começar';
}

// ---------- treino de troca de acordes ----------
const DRILL_CHORDS = ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm', 'F', 'B7', 'E7', 'A7', 'D7', 'G7', 'C7M', 'Bm'];
let drill = null;

export function renderPractice(root) {
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

export function stopDrill() {
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
