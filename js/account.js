// Conta (nome de usuário + senha) e sincronização automática entre aparelhos,
// usando a API em PHP + MySQL da Hostinger.
//  - Publicado (http/https com a API): só entra quem fez login.
//  - Abrindo o arquivo direto no computador (sem API): funciona sem login, só neste navegador.
//  - A sincronização é sozinha: baixa ao abrir/voltar para o app e a cada minuto,
//    e envia logo depois de cada mudança.

import { $, esc, data, onChange, replaceAll } from './store.js';

const API = 'api/index.php';
const TOKEN_KEY = 'cifraviva.token';
const USER_KEY = 'cifraviva.user';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
};

let token = store.get(TOKEN_KEY);
let username = store.get(USER_KEY) || '';
let apiInfo = null; // { ok, registration } quando a API responde
let pushTimer = 0;
let syncing = false;
let lastPull = 0;
let lastSyncAt = 0;
let syncError = '';
const syncedListeners = [];

/** Avisa quando chegaram dados novos da nuvem (para redesenhar a página). */
export function onSynced(fn) { syncedListeners.push(fn); }

async function call(action, body) {
  const res = await fetch(`${API}?a=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function setSession(t, name) {
  token = t;
  username = name || '';
  store.set(TOKEN_KEY, t);
  store.set(USER_KEY, name);
}

export const isPublished = () => location.protocol.startsWith('http');
export const isLoggedIn = () => !!token;
/** Precisa mostrar a tela de login? (site publicado e sem login) */
export const needsLogin = () => isPublished() && !token && apiInfo !== false;

/**
 * Descobre se a API existe e confere a sessão. Retorna quando já dá para decidir
 * se mostra o site ou a tela de login.
 */
export async function initAccount() {
  if (!isPublished()) { apiInfo = false; return; }
  try {
    const r = await call('ping');
    apiInfo = r && r.ok === true ? r : false;
  } catch {
    apiInfo = token ? null : false; // sem internet: quem já entrou continua usando
  }
  if (apiInfo && token) {
    try {
      username = (await call('me')).username;
      store.set(USER_KEY, username);
      syncNow();
    } catch (err) {
      if (err.status === 401) setSession(null, null); // sessão expirou
    }
  }
  updateBadge();
}

function updateBadge() {
  const a = $('#accountLink');
  if (!a) return;
  a.hidden = !apiInfo || !token;
  const t = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  a.innerHTML = `${syncing ? '⟳' : syncError ? '⚠️' : '☁️'} ${esc(username)}`;
  a.title = syncing ? 'Sincronizando…' : syncError ? `Não sincronizou: ${syncError}` : t ? `Sincronizado às ${t}` : '';
}

// ---------- sincronização ----------

/** Junta os dados da nuvem com os do aparelho (nada se perde). */
function merge(local, remote) {
  const byId = new Map();
  for (const s of [...(remote.songs || []), ...(local.songs || [])]) {
    const prev = byId.get(s.id);
    if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(s.id, s);
  }
  const deleted = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  const maxMap = (a = {}, b = {}) => {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = Math.max(o[k] || 0, v);
    return o;
  };
  const progress = { ...(remote.progress || {}) };
  for (const [id, p] of Object.entries(local.progress || {})) {
    const r = progress[id];
    progress[id] = !r ? p : {
      plays: Math.max(p.plays, r.plays), hits: Math.max(p.hits, r.hits), misses: Math.max(p.misses, r.misses),
      best: Math.max(p.best, r.best), lastAt: Math.max(p.lastAt || 0, r.lastAt || 0),
    };
  }
  const history = [...(local.history || []), ...(remote.history || [])]
    .sort((a, b) => b.at - a.at).filter((h, i, arr) => arr.findIndex((x) => x.id === h.id) === i).slice(0, 30);
  const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
  return {
    ...newer,
    songs: [...byId.values()].filter((s) => !deleted.has(s.id)),
    deleted: [...deleted],
    favorites: newer.favorites || [],
    history,
    progress,
    days: maxMap(local.days, remote.days),
    drills: maxMap(local.drills, remote.drills),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };
}

/** Baixa, junta com o que tem aqui e envia de volta. */
export async function syncNow() {
  if (!token || !apiInfo || syncing) return;
  clearTimeout(pushTimer);
  syncing = true;
  updateBadge();
  try {
    const before = JSON.stringify(data);
    const remote = await call('pull');
    const merged = remote.data ? merge(JSON.parse(before), remote.data) : JSON.parse(before);
    replaceAll(merged);
    await call('push', { data: merged });
    lastPull = Date.now();
    lastSyncAt = Date.now();
    syncError = '';
    if (JSON.stringify(merged) !== before) syncedListeners.forEach((fn) => fn());
  } catch (err) {
    syncError = err.message;
    if (err.status === 401) { setSession(null, null); location.reload(); }
  } finally {
    syncing = false;
    updateBadge();
  }
}

async function pushNow() {
  if (!token || !apiInfo) return;
  if (syncing) { pushTimer = setTimeout(pushNow, 1000); return; }
  try {
    await call('push', { data });
    lastSyncAt = Date.now();
    syncError = '';
  } catch (err) {
    syncError = err.message;
  }
  updateBadge();
}

// cada mudança é enviada 1,5 s depois (juntando várias mudanças seguidas)
onChange(() => {
  if (!token || !apiInfo || syncing) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
});
// voltou para o app (outra aba, desbloqueou o celular): pega o que mudou nos outros aparelhos
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastPull > 15000) syncNow();
});
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
addEventListener('online', () => syncNow());

// ---------- telas ----------

/** Tela de login (aparece no lugar do site enquanto você não entrar). */
export function renderLogin(root, onDone) {
  const offline = apiInfo === null || (apiInfo === false && isPublished());
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card card">
        <img src="icon.svg" alt="" width="64" height="64">
        <h1>Cifra Viva</h1>
        <p class="muted">Entre para ver suas músicas.</p>
        <form class="form-stack" id="acForm">
          <label>Nome de usuário <input id="acUser" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
          <label>Senha <input type="password" id="acPass" required minlength="8" autocomplete="current-password"></label>
          <button type="submit" class="primary big" value="login">Entrar</button>
          ${apiInfo?.registration ? '<button type="submit" value="register">Criar conta</button>' : ''}
          <p class="muted" id="acMsg">${offline ? 'Não consegui falar com o servidor. Confira a internet.' : ''}</p>
        </form>
      </div>
    </div>`;
  $('#acForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter?.value === 'register' ? 'register' : 'login';
    $('#acMsg').textContent = 'Entrando…';
    try {
      if (!apiInfo) await initAccount();
      const r = await call(action, { username: $('#acUser').value.trim(), password: $('#acPass').value });
      setSession(r.token, r.username);
      await syncNow();
      updateBadge();
      onDone();
    } catch (err) {
      $('#acMsg').textContent = err.message;
    }
  });
  setTimeout(() => $('#acUser')?.focus(), 50);
}

/** Página "Conta" (depois de entrar). */
export function renderAccount(root) {
  if (!apiInfo || !token) {
    root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
      <div class="card"><p>A conta e a sincronização funcionam quando o site está publicado na <b>Hostinger</b>.</p>
      <p class="muted">Por enquanto suas cifras e seu progresso ficam salvos só neste navegador.</p></div></div>`;
    return;
  }
  const t = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '–';
  root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
    <div class="card"><p>Você entrou como <b>${esc(username)}</b>.</p>
    <p class="muted">☁️ A sincronização é automática: tudo que você muda aqui aparece nos outros aparelhos em que você entrou (celular, computador…).
    Última sincronização: <b id="acLast">${t}</b>.</p>
    ${syncError ? `<p class="bad">⚠️ ${esc(syncError)}</p>` : ''}
    <div class="actions"><button type="button" id="acLogout">Sair desta conta</button></div>
    <p class="muted small-print">Ao sair, as cifras deste aparelho são apagadas daqui (continuam na sua conta e voltam quando você entrar de novo).</p></div></div>`;
  $('#acLogout').addEventListener('click', async () => {
    if (!confirm('Sair da conta neste aparelho?')) return;
    clearTimeout(pushTimer);
    await pushNow();
    await call('logout', {}).catch(() => {});
    setSession(null, null);
    replaceAll({}); // limpa os dados deste aparelho (ficam guardados na conta)
    location.hash = '#/';
    location.reload();
  });
}
