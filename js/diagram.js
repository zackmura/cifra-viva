// Desenha o diagrama do acorde em SVG (cordas na vertical, 6ª corda à esquerda).

const FRETS_SHOWN = 4;

export function diagramSVG(v, { size = 1 } = {}) {
  if (!v) return '<svg viewBox="0 0 80 100" class="diagram"><text x="40" y="55" text-anchor="middle" font-size="10" fill="currentColor">sem forma</text></svg>';
  const pressed = v.frets.filter((f) => f > 0);
  const maxF = pressed.length ? Math.max(...pressed) : 0;
  const minF = pressed.length ? Math.min(...pressed) : 1;
  const start = maxF <= FRETS_SHOWN ? 1 : minF; // casa mostrada no topo
  const W = 80;
  const H = 100;
  const left = 14;
  const top = 22;
  const gx = 10.4; // espaço entre cordas
  const gy = 17; // espaço entre trastes
  const x = (s) => left + s * gx;
  const y = (f) => top + (f - start + 0.5) * gy;
  const out = [];

  out.push(`<svg viewBox="0 0 ${W} ${H}" width="${W * size}" height="${H * size}" class="diagram" role="img">`);
  // pestana do braço (nut) ou número da casa
  if (start === 1) out.push(`<rect x="${left - 1}" y="${top - 3}" width="${gx * 5 + 2}" height="3.5" fill="currentColor"/>`);
  else out.push(`<text x="${left - 4}" y="${top + gy * 0.5 + 3.5}" text-anchor="end" font-size="9" fill="currentColor">${start}ª</text>`);
  for (let i = 0; i <= FRETS_SHOWN; i++) {
    out.push(`<line x1="${left}" x2="${x(5)}" y1="${top + i * gy}" y2="${top + i * gy}" stroke="currentColor" stroke-opacity=".45" stroke-width="1"/>`);
  }
  for (let s = 0; s < 6; s++) {
    out.push(`<line x1="${x(s)}" x2="${x(s)}" y1="${top}" y2="${top + FRETS_SHOWN * gy}" stroke="currentColor" stroke-opacity=".7" stroke-width="${1.4 - s * 0.12}"/>`);
    const f = v.frets[s];
    if (f < 0) out.push(`<text x="${x(s)}" y="${top - 7}" text-anchor="middle" font-size="8.5" fill="currentColor" opacity=".7">✕</text>`);
    if (f === 0) out.push(`<circle cx="${x(s)}" cy="${top - 10}" r="3" fill="none" stroke="currentColor" stroke-width="1.1"/>`);
  }
  if (v.barre) {
    const b = v.barre;
    out.push(`<rect x="${x(b.from) - 4.5}" y="${y(b.fret) - 4.5}" width="${x(b.to) - x(b.from) + 9}" height="9" rx="4.5" class="dot"/>`);
    out.push(`<text x="${(x(b.from) + x(b.to)) / 2}" y="${y(b.fret) + 3}" text-anchor="middle" font-size="7.5" class="finger">1</text>`);
  }
  for (let s = 0; s < 6; s++) {
    const f = v.frets[s];
    if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) continue;
    out.push(`<circle cx="${x(s)}" cy="${y(f)}" r="4.5" class="dot"/>`);
    if (v.fingers[s]) out.push(`<text x="${x(s)}" y="${y(f) + 2.8}" text-anchor="middle" font-size="7.5" class="finger">${v.fingers[s]}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}
