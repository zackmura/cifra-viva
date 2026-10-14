// Conta e sincronização (celular <-> computador) usando a API em PHP + MySQL da Hostinger.
// Sem a API (ex.: abrindo o arquivo direto ou no GitHub Pages) tudo continua só no navegador.

import { $, esc, data, onChange, replaceAll } from './store.js';

const API = 'api/index.php';
const TOKEN_KEY = 'cifraviva.token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* sem armazenamento */ }
let apiInfo = null; // { ok, registration } quando a API existe
let email = '';
let pushTimer = 0;
let syncing = false;

async function call(action, body) {
  const res = await fetch(`${API}?a=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

export async function detectApi() {
  if (!location.protocol.startsWith('http')) return null;
  try {
    const r = await call('ping');
    apiInfo = r && r.ok === true ? r : null; // só vale se o PHP respondeu de verdade
  } catch {
    apiInfo = null;
  }
  if (apiInfo && token) {
    try {
      email = (await call('me')).email;
      await pullAndMerge();
    } catch {
      setToken(null);
    }
  }
  updateBadge();
  return apiInfo;
}

function setToken(t) {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento */ }
}

function updateBadge() {
  const a = $('#accountLink');
  if (!a) return;
  a.hidden = !apiInfo;
  a.textContent = token ? '👤 ' + (email.split('@')[0] || 'Conta') : '👤 Entrar';
  a.classList.toggle('on', !!token);
}

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

async function pullAndMerge() {
  syncing = true;
  try {
    const remote = await call('pull');
    const merged = remote.data ? merge(JSON.parse(JSON.stringify(data)), remote.data) : data;
    replaceAll(merged);
    await call('push', { data: merged });
  } finally {
    syncing = false;
  }
}

// envia as mudanças para a nuvem alguns segundos depois de cada alteração
onChange(() => {
  if (!token || !apiInfo || syncing) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => call('push', { data }).catch(() => {}), 2500);
});

export function renderAccount(root) {
  if (!apiInfo) {
    root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
      <div class="card"><p>A conta e a sincronização entre celular e computador funcionam quando o site está publicado na <b>Hostinger</b> (com a pasta <code>api/</code> configurada).</p>
      <p class="muted">Por enquanto suas cifras e seu progresso ficam salvos só neste navegador.</p></div></div>`;
    return;
  }
  if (token) {
    root.innerHTML = `<div class="page narrow"><h1>Conta</h1>
      <div class="card"><p>Você entrou como <b>${esc(email)}</b>.</p>
      <p class="muted">Suas cifras, favoritas e progresso são sincronizados automaticamente entre os aparelhos em que você entrar.</p>
      <div class="actions"><button type="button" class="primary" id="acSync">🔄 Sincronizar agora</button><button type="button" id="acLogout">Sair</button></div>
      <p class="muted" id="acMsg"></p></div></div>`;
    $('#acSync').addEventListener('click', async () => {
      $('#acMsg').textContent = 'Sincronizando…';
      try { await pullAndMerge(); $('#acMsg').textContent = 'Tudo sincronizado ✓'; } catch (e) { $('#acMsg').textContent = e.message; }
    });
    $('#acLogout').addEventListener('click', async () => {
      await call('logout', {}).catch(() => {});
      setToken(null);
      email = '';
      updateBadge();
      renderAccount(root);
    });
    return;
  }
  root.innerHTML = `<div class="page narrow"><h1>Entrar</h1>
    <form class="card form-stack" id="acForm">
      <label>E-mail <input type="email" id="acEmail" required autocomplete="username"></label>
      <label>Senha <input type="password" id="acPass" required minlength="8" autocomplete="current-password"></label>
      <div class="actions">
        <button type="submit" class="primary" value="login">Entrar</button>
        ${apiInfo.registration ? '<button type="submit" value="register">Criar conta</button>' : ''}
      </div>
      <p class="muted" id="acMsg">${apiInfo.registration ? 'Primeira vez? Preencha e clique em Criar conta (senha com 8+ caracteres).' : ''}</p>
    </form></div>`;
  $('#acForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter?.value === 'register' ? 'register' : 'login';
    $('#acMsg').textContent = 'Aguarde…';
    try {
      const r = await call(action, { email: $('#acEmail').value.trim(), password: $('#acPass').value });
      setToken(r.token);
      email = r.email;
      await pullAndMerge();
      updateBadge();
      renderAccount(root);
    } catch (err) {
      $('#acMsg').textContent = err.message;
    }
  });
}
