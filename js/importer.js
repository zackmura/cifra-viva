// Importar: colar uma cifra copiada (limpa o texto) ou gerar a cifra a partir de um áudio.

import { analyzeAudioBuffer, cosine } from './audio.js';
import { parseChord, chordTemplate, isChord, NOTES_SHARP } from './chords.js';
import { voicingsFor } from './guitar.js';
import { diagramSVG } from './diagram.js';
import { GENRES } from './songs.js';
import { $, esc, saveSong } from './store.js';

// linhas que os sites de cifra colocam e que não são música
const JUNK = new RegExp('^\\s*(' + [
  'tom:', 'capotraste', 'afinação', 'afinacao', 'composição', 'composicao', 'colaboração', 'colaboracao',
  'exibir', 'imprimir', 'versão', 'versao', 'cifra:', 'cifra club', 'ver mais', 'tablatura de', 'enviada por',
  'revisada por', 'essa informação', 'esta informação', 'nos avise', 'simplificar', 'auto rolagem', 'compartilhar',
  'adicionar à lista', 'baixar', 'comentários', 'parte \\d+ de \\d+', '\\d+\\s*(exibições|visualizações)',
].join('|') + ')', 'i');
const BATIDA = /batida|ritmo/i;

/** Limpa uma cifra colada de um site. Retorna { text, key, capo, title, artist, strum }. */
export function cleanPasted(raw) {
  let key = '';
  let capo = 0;
  let strum = '';
  const out = [];
  for (const line of raw.replace(/\r/g, '').replace(/ /g, ' ').split('\n')) {
    const k = /tom:\s*([A-G][#b]?m?)/i.exec(line);
    if (k) key = k[1];
    const c = /capotraste\D*(\d+)/i.exec(line);
    if (c) capo = +c[1];
    // batida escrita com setas (↓ ↑) ou letras (B C / D U)
    if (BATIDA.test(line) && /[↓↑]/.test(line)) {
      strum = [...line.replace(/[^↓↑·-]/g, '')].map((ch) => (ch === '↓' ? 'D' : ch === '↑' ? 'U' : '-')).join('').slice(0, 8);
      continue;
    }
    if (JUNK.test(line)) continue;
    out.push(line.replace(/\s+$/, ''));
  }
  let lines = out.join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n');

  // as duas primeiras linhas costumam ser o título e o artista (se não forem música)
  const looksMusical = (l) => /^\s*\[/.test(l) || /\|-/.test(l) || (l.trim() && l.trim().split(/\s+/).every(isChord));
  let title = '';
  let artist = '';
  if (lines[0] && !looksMusical(lines[0]) && lines[0].length <= 70) {
    title = lines.shift().trim();
    if (lines[0] && !looksMusical(lines[0]) && lines[0].trim() && lines[0].length <= 50) artist = lines.shift().trim();
  }
  const text = lines.join('\n').trim();
  return { text, key, capo, title, artist, strum };
}

// ---------- áudio -> acordes ----------
const CANDIDATES = NOTES_SHARP.flatMap((n) => [n, n + 'm', n + '7']).map((name) => ({ name, tpl: chordTemplate(parseChord(name)) }));

/** Acha o acorde de cada trecho e junta trechos iguais. Retorna [{t0, t1, name}]. */
export function framesToChords(frames, hop) {
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

export function renderImport(root) {
  root.innerHTML = `
    <div class="page narrow">
      <h1>Importar</h1>

      <section class="card">
        <h2>📋 Colar cifra de um site</h2>
        <p class="muted">Copie a cifra de um site (do título até o fim da música) e cole aqui. O Cifra Viva limpa o texto e entende acordes acima da letra, tablaturas, tom e capotraste. Fica salvo só na sua conta (uso pessoal).</p>
        <textarea id="imText" rows="12" spellcheck="false" placeholder="Cole a cifra aqui…"></textarea>
        <div class="form-grid">
          <label>Título <input id="imTitle" placeholder="preenche sozinho ao colar"></label>
          <label>Artista <input id="imArtist"></label>
          <label>Gênero <select id="imGenre">${GENRES.map((g) => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('')}</select></label>
          <label>Nível <select id="imLevel"><option value="1">Fácil</option><option value="2" selected>Médio</option><option value="3">Difícil</option></select></label>
          <label>BPM <input id="imBpm" type="number" min="30" max="250" placeholder="ex.: 120"></label>
          <label>Batida <input id="imStrum" placeholder="ex.: D-DU-UDU" maxlength="8"></label>
        </div>
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

  // ao colar, já preenche título, artista, tom e batida que encontrar
  $('#imText').addEventListener('paste', () => setTimeout(() => {
    const p = cleanPasted($('#imText').value);
    if (p.title && !$('#imTitle').value) $('#imTitle').value = p.title;
    if (p.artist && !$('#imArtist').value) $('#imArtist').value = p.artist;
    if (p.strum && !$('#imStrum').value) $('#imStrum').value = p.strum;
  }));

  $('#imSave').addEventListener('click', () => {
    const p = cleanPasted($('#imText').value);
    if (!p.text) { alert('Cole a cifra primeiro.'); return; }
    const id = 'u' + Date.now();
    saveSong({
      id,
      title: $('#imTitle').value.trim() || p.title || 'Cifra importada',
      artist: $('#imArtist').value.trim() || p.artist,
      genre: $('#imGenre').value,
      level: +$('#imLevel').value,
      key: p.key,
      capo: p.capo || undefined,
      bpm: +$('#imBpm').value || undefined,
      strum: $('#imStrum').value.trim().toUpperCase().replace(/[^DU-]/g, '') || undefined,
      text: p.text,
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

export function stopImport() {
  const p = $('#auPlayer');
  if (p) p.pause();
}
