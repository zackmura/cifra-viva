// Páginas: início, catálogo de músicas e meu repertório.

import { GENRES } from './songs.js';
import { $, $$, esc, data, allSongs, hasTab, isFavorite, toggleFavorite, totals } from './store.js';

const LEVELS = ['', 'Fácil', 'Médio', 'Difícil'];
const genreOf = (s) => GENRES.find((g) => g.id === s.genre);

export function songCard(s) {
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
export function renderHome(root) {
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

export function renderCatalog(root, params) {
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
export function renderRepertoire(root) {
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
