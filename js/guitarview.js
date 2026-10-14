// Braço do violão (visto de frente, mão do acorde à esquerda). Mostra onde ficam os
// dedos do acorde e as cordas vibram a cada batida.

const NUT = 74; // x da pestana do braço (osso)
const WIDTHS = [128, 120, 113, 106, 100]; // casas ficam mais estreitas, como no violão de verdade
const FRETS = WIDTHS.length;
const W = 700;
const TOP = 22;
const BOTTOM = 148;
const SY = (s) => TOP + 13 + s * 20; // 6ª corda (mais grave) em cima, como você vê olhando para o braço

function fretX(k) {
  let x = NUT;
  for (let i = 0; i < k; i++) x += WIDTHS[i];
  return x;
}
const CX = (f, start) => (fretX(f - start) + fretX(f - start + 1)) / 2;

function neckSVG() {
  const frets = Array.from({ length: FRETS }, (_, i) => {
    const x = fretX(i + 1);
    return `<rect x="${x - 2.5}" y="${TOP}" width="5" height="${BOTTOM - TOP}" fill="url(#gv-fretwire)"/>`;
  }).join('');
  const strings = [0, 1, 2, 3, 4, 5].map((s) => {
    const w = 3.4 - s * 0.42;
    return `<line class="gv-shadow" x1="58" x2="${W}" y1="${SY(s) + 2.2}" y2="${SY(s) + 2.2}" stroke-width="${w}"/>`
      + `<line class="gv-string ${s < 3 ? 'wound' : 'plain'}" x1="40" x2="${W}" y1="${SY(s)}" y2="${SY(s)}" stroke-width="${w}"/>`;
  }).join('');
  const pegs = [0, 1, 2].map((i) => `<ellipse cx="${16 + i * 17}" cy="9" rx="6" ry="5" class="gv-peg"/><ellipse cx="${16 + i * 17}" cy="161" rx="6" ry="5" class="gv-peg"/>`).join('');
  return `
<svg viewBox="0 0 ${W} 172" class="gv" role="img" aria-label="Braço do violão">
  <defs>
    <linearGradient id="gv-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#24150c"/><stop offset=".18" stop-color="#3f2717"/>
      <stop offset=".5" stop-color="#4b2f1c"/><stop offset=".82" stop-color="#3f2717"/><stop offset="1" stop-color="#24150c"/>
    </linearGradient>
    <linearGradient id="gv-headwood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a180d"/><stop offset="1" stop-color="#4a2c18"/>
    </linearGradient>
    <linearGradient id="gv-fretwire" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8d8d8d"/><stop offset=".45" stop-color="#f4f4f4"/><stop offset="1" stop-color="#9a9a9a"/>
    </linearGradient>
    <radialGradient id="gv-pearl" cx=".35" cy=".35" r=".8">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e6ddcf"/><stop offset="1" stop-color="#b9ae9c"/>
    </radialGradient>
    <linearGradient id="gv-bone" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d9cdb6"/><stop offset=".5" stop-color="#fbf5e8"/><stop offset="1" stop-color="#d4c7ae"/>
    </linearGradient>
  </defs>
  <path d="M2,14 Q30,2 ${NUT - 6},${TOP - 4} L${NUT - 6},${BOTTOM + 4} Q30,168 2,156 Q-4,85 2,14 Z" fill="url(#gv-headwood)"/>
  ${pegs}
  <rect x="${NUT - 6}" y="${TOP - 4}" width="${W - NUT + 6}" height="${BOTTOM - TOP + 8}" fill="#1b0f08"/>
  <rect x="${NUT}" y="${TOP}" width="${W - NUT}" height="${BOTTOM - TOP}" fill="url(#gv-wood)"/>
  <g id="gv-inlays"></g>
  ${frets}
  <rect x="${NUT - 7}" y="${TOP - 3}" width="8" height="${BOTTOM - TOP + 6}" rx="1.5" fill="url(#gv-bone)"/>
  <g class="gv-strings">${strings}</g>
  <g id="gv-marks"></g>
  <g id="gv-fingers"></g>
  <g id="gv-numbers"></g>
</svg>`;
}

export class GuitarView {
  /** onPick(corda, casa) é chamado quando você toca numa corda do desenho. */
  constructor(container, onPick) {
    container.innerHTML = neckSVG();
    this.svg = container.querySelector('svg');
    this.fingers = this.svg.querySelector('#gv-fingers');
    this.marks = this.svg.querySelector('#gv-marks');
    this.inlays = this.svg.querySelector('#gv-inlays');
    this.numbers = this.svg.querySelector('#gv-numbers');
    this.strings = [...this.svg.querySelectorAll('.gv-string')];
    this.start = 1;
    this.drawWindow(1);
    this.svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = this.svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const { x, y } = p.matrixTransform(this.svg.getScreenCTM().inverse());
      if (y < TOP - 6 || y > BOTTOM + 6) return;
      const s = Math.max(0, Math.min(5, Math.round((y - SY(0)) / 20)));
      let fret = 0;
      if (x >= NUT) {
        let k = 0;
        while (k < FRETS - 1 && x > fretX(k + 1)) k++;
        fret = this.start + k;
      }
      this.ripple(s, fret);
      onPick?.(s, fret);
    });
  }

  /** Desenha marcações e números das casas a partir da casa `start`. */
  drawWindow(start) {
    this.start = start;
    const mid = (TOP + BOTTOM) / 2;
    this.inlays.innerHTML = [3, 5, 7, 9, 12, 15].filter((f) => f >= start && f < start + FRETS).map((f) => (f === 12
      ? `<circle cx="${CX(f, start)}" cy="${mid - 26}" r="6" fill="url(#gv-pearl)"/><circle cx="${CX(f, start)}" cy="${mid + 26}" r="6" fill="url(#gv-pearl)"/>`
      : `<circle cx="${CX(f, start)}" cy="${mid}" r="7" fill="url(#gv-pearl)"/>`)).join('');
    this.numbers.innerHTML = Array.from({ length: FRETS }, (_, i) =>
      `<text x="${CX(start + i, start)}" y="${BOTTOM + 19}" text-anchor="middle" class="gv-num">${start + i}</text>`).join('');
  }

  ripple(s, fret) {
    const x = fret === 0 ? NUT - 26 : CX(fret, this.start);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', SY(s));
    c.setAttribute('r', 12);
    c.setAttribute('class', 'gv-ripple');
    this.svg.appendChild(c);
    setTimeout(() => c.remove(), 500);
    this.strum({ frets: this.strings.map((_, i) => (i === s ? fret : -1)) });
  }

  /** Mostra a próxima nota da tablatura (piscando) e as seguintes, mais claras. */
  showNotes(list, upcoming = []) {
    this.marks.innerHTML = '';
    const all = [...list, ...upcoming].filter((n) => n.fret > 0);
    const maxF = all.length ? Math.max(...all.map((n) => n.fret)) : 0;
    const minF = all.length ? Math.min(...all.map((n) => n.fret)) : 1;
    this.drawWindow(maxF <= FRETS ? 1 : Math.max(1, Math.min(minF, maxF - FRETS + 1)));
    const dot = (n, cls) => (n.fret === 0
      ? `<circle cx="${NUT - 26}" cy="${SY(n.s)}" r="10" class="${cls} open"/>`
      : n.fret < this.start || n.fret >= this.start + FRETS ? ''
        : `<circle cx="${CX(n.fret, this.start)}" cy="${SY(n.s)}" r="12" class="${cls}"/>`
          + `<text x="${CX(n.fret, this.start)}" y="${SY(n.s) + 5}" text-anchor="middle" class="gv-finger">${n.fret}</text>`);
    this.fingers.innerHTML = upcoming.map((n) => dot(n, 'gv-ghost')).join('') + list.map((n) => dot(n, 'gv-dot gv-target')).join('');
  }

  /** Mostra no braço onde ficam os dedos da forma `v`. */
  showChord(v) {
    this.fingers.innerHTML = '';
    this.marks.innerHTML = '';
    if (!v) return;
    const pressed = v.frets.filter((f) => f > 0);
    const maxF = pressed.length ? Math.max(...pressed) : 0;
    const start = maxF <= FRETS ? 1 : Math.min(...pressed);
    this.drawWindow(start);

    const out = [];
    v.frets.forEach((f, s) => {
      if (f < 0) out.push(`<text x="${NUT - 26}" y="${SY(s) + 5}" text-anchor="middle" class="gv-mute">✕</text>`);
      if (f === 0) out.push(`<circle cx="${NUT - 26}" cy="${SY(s)}" r="6" class="gv-open"/>`);
    });
    this.marks.innerHTML = out.join('');

    const dots = [];
    if (v.barre) {
      const b = v.barre;
      const x = CX(b.fret, start);
      dots.push(`<rect x="${x - 12}" y="${SY(b.from) - 12}" width="24" height="${SY(b.to) - SY(b.from) + 24}" rx="12" class="gv-dot"/>`);
      dots.push(`<text x="${x}" y="${SY(b.from) + 5}" text-anchor="middle" class="gv-finger">1</text>`);
    }
    v.frets.forEach((f, s) => {
      if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) return;
      dots.push(`<circle cx="${CX(f, start)}" cy="${SY(s)}" r="12" class="gv-dot"/>`);
      if (v.fingers[s]) dots.push(`<text x="${CX(f, start)}" y="${SY(s) + 5}" text-anchor="middle" class="gv-finger">${v.fingers[s]}</text>`);
    });
    this.fingers.innerHTML = dots.join('');
  }

  /** Faz as cordas tocadas vibrarem, da mais grave para a mais aguda. */
  strum(v) {
    this.strings.forEach((el, s) => {
      el.classList.remove('vib');
      if (v && v.frets[s] < 0) return;
      void el.getBBox();
      el.style.animationDelay = s * 22 + 'ms';
      el.classList.add('vib');
    });
  }
}
