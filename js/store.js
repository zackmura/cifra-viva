// Tudo que o site guarda: suas cifras, favoritas, histórico, progresso e preferências.
// Fica no navegador (localStorage) e, se você entrar na sua conta, é sincronizado.

import { DEMO_SONGS } from './songs.js';

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'cifraviva.data';
const OLD_SONGS = 'cifraviva.songs';
const OLD_PREFS = 'cifraviva.prefs';

function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}

const blank = () => ({
  songs: [], // cifras suas (inclusive letras coladas por cima das populares)
  favorites: [],
  history: [], // [{id, at}]
  progress: {}, // id -> {plays, best, hits, misses, lastAt}
  days: {}, // 'AAAA-MM-DD' -> minutos praticados
  drills: {}, // 'G-C' -> recorde de trocas por minuto
  prefs: { fontSize: 20, sensitivity: 5, speed: 30 },
  voicing: {},
  deleted: [],
  updatedAt: 0,
});

export const data = Object.assign(blank(), read(KEY, {}));
// migra o formato antigo
if (!data.songs.length && read(OLD_SONGS, null)) data.songs = read(OLD_SONGS, []);
if (read(OLD_PREFS, null)) Object.assign(data.prefs, read(OLD_PREFS, {}));

const listeners = [];
export function onChange(fn) { listeners.push(fn); }

let saveTimer = 0;
export function save() {
  data.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sem armazenamento */ }
    listeners.forEach((fn) => fn());
  }, 150);
}

/** Substitui tudo (usado ao baixar da nuvem). */
export function replaceAll(next) {
  Object.assign(data, blank(), next);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sem armazenamento */ }
}

// ---------- músicas ----------
export function allSongs() {
  const mine = new Map(data.songs.map((s) => [s.id, s]));
  // uma popular com letra colada vira a sua versão, com o mesmo id
  return [...DEMO_SONGS.map((s) => (mine.has(s.id) ? { ...s, ...mine.get(s.id), mine: true, chordsOnly: false } : s)),
    ...data.songs.filter((s) => !DEMO_SONGS.some((d) => d.id === s.id)).map((s) => ({ ...s, mine: true }))];
}
export const getSong = (id) => allSongs().find((s) => s.id === id);

export function saveSong(song) {
  const i = data.songs.findIndex((s) => s.id === song.id);
  const clean = { ...song, updatedAt: Date.now() };
  delete clean.mine;
  if (i >= 0) data.songs[i] = clean;
  else data.songs.push(clean);
  data.deleted = (data.deleted || []).filter((d) => d !== song.id);
  save();
}
export function deleteSong(id) {
  data.songs = data.songs.filter((s) => s.id !== id);
  data.favorites = data.favorites.filter((f) => f !== id);
  data.deleted = [...new Set([...(data.deleted || []), id])]; // para a exclusão chegar aos outros aparelhos
  save();
}

export const hasTab = (song) => /^\s*[eBGDAE]?\|[-\d]/m.test(song.text);

// ---------- favoritas e histórico ----------
export const isFavorite = (id) => data.favorites.includes(id);
export function toggleFavorite(id) {
  data.favorites = isFavorite(id) ? data.favorites.filter((f) => f !== id) : [id, ...data.favorites];
  save();
}
export function touchHistory(id) {
  data.history = [{ id, at: Date.now() }, ...data.history.filter((h) => h.id !== id)].slice(0, 30);
  save();
}

// ---------- progresso ----------
const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-DD

export function recordSession(id, { hits, misses, minutes }) {
  const p = data.progress[id] || { plays: 0, best: 0, hits: 0, misses: 0 };
  p.plays++;
  p.hits += hits;
  p.misses += misses;
  if (hits >= 5) p.best = Math.max(p.best, Math.round((hits / (hits + misses)) * 100));
  p.lastAt = Date.now();
  data.progress[id] = p;
  addPracticeMinutes(minutes);
}
export function addPracticeMinutes(minutes) {
  const d = today();
  data.days[d] = Math.round(((data.days[d] || 0) + Math.max(minutes, 0.1)) * 10) / 10;
  save();
}

/** Dias seguidos praticando (até hoje ou ontem). */
export function streak() {
  let n = 0;
  const d = new Date();
  if (!data.days[d.toLocaleDateString('sv')]) d.setDate(d.getDate() - 1);
  while (data.days[d.toLocaleDateString('sv')]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function totals() {
  const prog = Object.values(data.progress);
  return {
    streak: streak(),
    songs: prog.length,
    hits: prog.reduce((a, p) => a + p.hits, 0),
    minutes: Math.round(Object.values(data.days).reduce((a, m) => a + m, 0)),
    mastered: prog.filter((p) => p.best >= 90).length,
  };
}
