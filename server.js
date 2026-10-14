// Servidor local simples (o microfone só funciona em https ou em localhost).
// Uso: node server.js              ->  abra http://localhost:5173
//      node server.js --mock-api   ->  idem, com uma API de mentira (em memória) que imita
//                                      a api/index.php da Hostinger, para testar login/sincronização
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;
const MOCK_API = process.argv.includes('--mock-api');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// ---------- API de mentira (só para testes locais) ----------
const mock = { users: new Map(), tokens: new Map(), data: new Map() };

function mockApi(req, res, url) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const user = mock.tokens.get(req.headers['x-auth-token']);
    const needUser = () => { if (!user) { send(401, { error: 'Entre na sua conta.' }); return false; } return true; };
    const newToken = (name) => { const t = crypto.randomBytes(32).toString('hex'); mock.tokens.set(t, name); return t; };
    switch (url.searchParams.get('a')) {
      case 'ping': return send(200, { ok: true, registration: true });
      case 'register': {
        const name = String(body.username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(name) || String(body.password || '').length < 8) return send(400, { error: 'Nome de usuário: 3 a 30 letras/números (sem espaço). Senha: pelo menos 8 caracteres.' });
        if (mock.users.has(name)) return send(409, { error: 'Esse nome de usuário já existe. Use Entrar.' });
        mock.users.set(name, body.password);
        return send(200, { token: newToken(name), username: name });
      }
      case 'login': {
        const name = String(body.username || '').trim().toLowerCase();
        if (mock.users.get(name) !== body.password) return send(401, { error: 'Usuário ou senha incorretos.' });
        return send(200, { token: newToken(name), username: name });
      }
      case 'me': return needUser() && send(200, { username: user });
      case 'logout': if (!needUser()) return; mock.tokens.delete(req.headers['x-auth-token']); return send(200, { ok: true });
      case 'pull': return needUser() && send(200, { data: mock.data.get(user) || null });
      case 'push': if (!needUser()) return; mock.data.set(user, body.data); return send(200, { ok: true });
      default: return send(404, { error: 'Ação desconhecida.' });
    }
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const urlPath = decodeURIComponent(url.pathname);
  if (urlPath.startsWith('/api/')) {
    if (MOCK_API && urlPath === '/api/index.php') return mockApi(req, res, url);
    res.writeHead(404).end(); // o PHP de verdade só roda na Hostinger
    return;
  }
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Cifra Viva rodando em http://localhost:${PORT}${MOCK_API ? ' (com API de teste)' : ''}`));
