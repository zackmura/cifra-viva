// Navegação entre as páginas do site (#/, #/musicas, #/musica/id, ...).

import { $, $$, data } from './store.js';
import { renderHome, renderCatalog, renderRepertoire } from './pages.js';
import { openSong, closePlayer, openEditor, setFont, startFollow, stopListen, playerState, strum, resetScore } from './player.js';
import { renderTuner, stopTuner, renderPractice, stopDrill } from './tools.js';
import { renderImport, stopImport } from './importer.js';
import { renderAccount, detectApi } from './account.js';

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
