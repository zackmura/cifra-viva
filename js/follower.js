// Acompanha a música como um jogo (estilo Guitar Hero):
//  - "alvo" é o acorde (ou a nota da tablatura) que você precisa tocar agora;
//  - acertou o alvo  -> 'hit'   (a música anda)
//  - repetiu o acorde que já está tocando (ritmo) -> 'strum' (nada anda)
//  - tocou outra coisa -> 'miss' (nada anda)
// Acordes iguais seguidos na cifra (C ... C) contam como um só: você só continua batendo.
// Notas de tablatura nunca se juntam: cada nota precisa de uma palhetada nova.

import { cosine, noteName } from './audio.js';
import { COMMON_CHORDS } from './chords.js';

export class Follower {
  constructor(events, onEvent) {
    this.events = events; // [{kind:'chord', name, tpl} | {kind:'note', name, midi}]
    this.onEvent = onEvent;
    this.pos = 0; // o que está tocando (ou o primeiro, antes de começar)
    this.started = false;
    this.evidence = 0;
    this.env = 0; // envelope de volume, para perceber cada batida
    this.lastOnset = 0;
    this.onset = null;
    this.armed = false; // nota: só uma nota por palhetada
    const seen = new Set();
    this.rivals = [...COMMON_CHORDS, ...events.filter((e) => e.kind === 'chord')]
      .filter((c) => !seen.has(c.name) && seen.add(c.name));
    this.setSensitivity(5);
  }

  /** 1 (cauteloso) a 10 (muito sensível). */
  setSensitivity(s) {
    this.margin = 0.13 - s * 0.011;
    this.needFrames = Math.round(9 - s * 0.6);
    this.minSim = 0.62 - s * 0.012;
    this.minClarity = 0.86 - s * 0.012;
  }

  similar(a, b) {
    return a.kind === 'chord' && b.kind === 'chord' && cosine(a.tpl, b.tpl) > 0.9; // C e C7M, G e G/B
  }

  /** Próximo evento depois de i, pulando acordes repetidos (C ... C). -1 no fim. */
  nextIndex(i = this.pos) {
    const ev = this.events;
    let j = i + 1;
    while (j < ev.length && this.similar(ev[j], ev[i])) j++;
    return j < ev.length ? j : -1;
  }

  target() {
    return this.started ? this.nextIndex() : this.pos;
  }

  setPosition(i) {
    this.pos = Math.max(0, Math.min(this.events.length - 1, i));
    this.started = false;
    this.evidence = 0;
    this.onset = null;
    this.onEvent({ type: 'move', pos: this.pos });
  }

  bestRival(chroma) {
    let best = null;
    let s = 0;
    for (const r of this.rivals) {
      const v = cosine(chroma, r.tpl);
      if (v > s) { s = v; best = r; }
    }
    return { chord: best, s };
  }

  hit(ti) {
    if (this.started) this.pos = ti;
    this.started = true;
    this.evidence = 0;
    this.armed = false;
    if (this.onset) this.onset.decided = true;
    this.onEvent({ type: 'hit', pos: this.pos });
  }

  update(chroma, rms, now, noise, pitch) {
    // cada batida/palhetada é um salto de volume
    if (rms > noise * 1.5 && rms > this.env * 1.5 && now - this.lastOnset > 120) {
      this.lastOnset = now;
      this.onset = { frames: 0, decided: false };
      this.armed = true;
      this.onEvent({ type: 'onset', time: now });
    }
    this.env = Math.max(rms, this.env * 0.85);
    if (rms <= noise) { this.evidence = 0; return; }

    const ev = this.events;
    const ti = this.target();
    const tgt = ti >= 0 ? ev[ti] : null;
    const cur = this.started ? ev[this.pos] : null;

    if (tgt && tgt.kind === 'note') {
      this.updateNote(tgt, ti, cur, pitch);
      return;
    }

    const sT = tgt ? cosine(chroma, tgt.tpl) : 0;
    const sC = cur && cur.kind === 'chord' ? cosine(chroma, cur.tpl) : 0;
    const best = this.bestRival(chroma);

    // acertou: parece mais com o alvo do que com o acorde atual e com qualquer outro
    const hitting = tgt && sT > this.minSim && sT > sC + this.margin && sT >= best.s - 0.04;
    this.evidence = hitting ? this.evidence + 1 : Math.max(0, this.evidence - 1);
    if (this.evidence >= this.needFrames) { this.hit(ti); return; }

    if (this.onset && !this.onset.decided && ++this.onset.frames >= this.needFrames + 3) {
      this.onset.decided = true;
      if (cur && cur.kind === 'chord' && sC > this.minSim && sC >= best.s - 0.05) {
        this.onEvent({ type: 'strum', pos: this.pos });
      } else if (best.chord && best.s > this.minSim && !(tgt && cosine(best.chord.tpl, tgt.tpl) > 0.9)) {
        this.onEvent({ type: 'miss', heard: best.chord.name, expected: tgt?.name || null });
      }
    }
  }

  updateNote(tgt, ti, cur, pitch) {
    const clear = pitch && pitch.clarity > this.minClarity;
    // aceita a nota certa (e a mesma nota uma oitava acima/abaixo, comum no microfone)
    const diff = clear ? pitch.midi - tgt.midi : 99;
    const right = clear && (Math.abs(diff) < 0.5 || Math.abs(Math.abs(diff) - 12) < 0.5);
    this.evidence = right ? this.evidence + 1 : 0;
    if (right && this.armed && this.evidence >= Math.max(2, Math.round(this.needFrames / 2))) {
      this.hit(ti);
      return;
    }
    if (this.onset && !this.onset.decided && ++this.onset.frames >= this.needFrames) {
      this.onset.decided = true;
      if (!clear) return;
      const same = cur && cur.kind === 'note' && Math.abs(pitch.midi - cur.midi) < 0.5;
      if (same) this.onEvent({ type: 'strum', pos: this.pos });
      else if (!right) this.onEvent({ type: 'miss', heard: noteName(pitch.midi), expected: tgt.name });
    }
  }
}
