// Desenho do violão (deitado, braço à esquerda). As cordas vibram ao tocar e o
// braço mostra onde colocar os dedos do acorde.

const NUT = 70; // x da pestana do braço
const FW = 58; // largura de cada casa
const FRETS = 5; // casas visíveis
const BRIDGE = 566;
const SY = (s) => 46 + s * 13.6; // y de cada corda (6ª corda em cima, como você vê olhando para o violão)
const CX = (f, start) => NUT + FW * (f - start + 0.5);

function guitarSVG() {
  const strings = [0, 1, 2, 3, 4, 5].map((s) =>
    `<line class="gv-string" data-s="${s}" x1="22" x2="${BRIDGE}" y1="${SY(s)}" y2="${SY(s)}" stroke-width="${2.6 - s * 0.32}"/>`).join('');
  const frets = Array.from({ length: FRETS }, (_, i) =>
    `<line x1="${NUT + FW * (i + 1)}" x2="${NUT + FW * (i + 1)}" y1="36" y2="124" class="gv-fret"/>`).join('');
  const pegs = [0, 1, 2].map((i) => `<circle cx="${14 + i * 17}" cy="27" r="5.5" class="gv-peg"/><circle cx="${14 + i * 17}" cy="133" r="5.5" class="gv-peg"/>`).join('');
  return `
<svg viewBox="0 0 640 160" class="gv" role="img" aria-label="Violão">
  <path class="gv-body" d="M350,24 C385,8 450,12 472,32 C492,48 522,0 592,2 C652,6 652,154 592,158 C522,160 492,112 472,128 C450,148 385,152 350,136 Z"/>
  <circle cx="440" cy="80" r="34" class="gv-rosette"/>
  <circle cx="440" cy="80" r="27" class="gv-hole"/>
  <rect x="${BRIDGE - 8}" y="40" width="20" height="80" rx="4" class="gv-bridge"/>
  <path class="gv-head" d="M4,30 L${NUT - 6},36 L${NUT - 6},124 L4,130 Q-2,80 4,30 Z"/>
  ${pegs}
  <rect x="${NUT}" y="36" width="${FW * FRETS + 12}" height="88" class="gv-board"/>
  <rect x="${NUT - 6}" y="36" width="6" height="88" class="gv-nut"/>
  ${frets}
  <g id="gv-inlays"></g>
  <g class="gv-strings">${strings}</g>
  <g id="gv-marks"></g>
  <g id="gv-fingers"></g>
  <text id="gv-pos" x="${NUT + FW / 2}" y="148" text-anchor="middle" class="gv-pos"></text>
  <rect x="0" y="0" width="640" height="160" fill="transparent" class="gv-hit"/>
</svg>`;
}

export class GuitarView {
  constructor(container, onTap) {
    container.innerHTML = guitarSVG();
    this.svg = container.querySelector('svg');
    this.fingers = this.svg.querySelector('#gv-fingers');
    this.marks = this.svg.querySelector('#gv-marks');
    this.inlays = this.svg.querySelector('#gv-inlays');
    this.pos = this.svg.querySelector('#gv-pos');
    this.strings = [...this.svg.querySelectorAll('.gv-string')];
    this.svg.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap?.(); });
  }

  /** Mostra no braço onde ficam os dedos da forma `v`. */
  showChord(v) {
    this.fingers.innerHTML = '';
    this.marks.innerHTML = '';
    if (!v) return;
    const pressed = v.frets.filter((f) => f > 0);
    const maxF = pressed.length ? Math.max(...pressed) : 0;
    const start = maxF <= FRETS ? 1 : Math.min(...pressed);
    this.pos.textContent = start > 1 ? `${start}ª casa` : '';
    this.inlays.innerHTML = [3, 5, 7, 9, 12].filter((f) => f >= start && f < start + FRETS)
      .map((f) => `<circle cx="${CX(f, start)}" cy="80" r="${f === 12 ? 4 : 5}" class="gv-inlay"/>`).join('');

    const out = [];
    v.frets.forEach((f, s) => {
      if (f < 0) out.push(`<text x="${NUT - 15}" y="${SY(s) + 4}" text-anchor="middle" class="gv-mute">✕</text>`);
      if (f === 0) out.push(`<circle cx="${NUT - 15}" cy="${SY(s)}" r="4.5" class="gv-open"/>`);
    });
    this.marks.innerHTML = out.join('');

    const dots = [];
    if (v.barre) {
      const b = v.barre;
      dots.push(`<rect x="${CX(b.fret, start) - 9}" y="${SY(b.from) - 9}" width="18" height="${SY(b.to) - SY(b.from) + 18}" rx="9" class="gv-dot"/>`);
      dots.push(`<text x="${CX(b.fret, start)}" y="${SY(b.from) + 4}" text-anchor="middle" class="gv-finger">1</text>`);
    }
    v.frets.forEach((f, s) => {
      if (f <= 0 || (v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to)) return;
      dots.push(`<circle cx="${CX(f, start)}" cy="${SY(s)}" r="8.5" class="gv-dot"/>`);
      if (v.fingers[s]) dots.push(`<text x="${CX(f, start)}" y="${SY(s) + 4}" text-anchor="middle" class="gv-finger">${v.fingers[s]}</text>`);
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
