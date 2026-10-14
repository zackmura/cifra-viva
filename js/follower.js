// Acompanha a música como um jogo (estilo Guitar Hero):
//  - "alvo" é o acorde que você precisa tocar agora;
//  - acertou o alvo  -> 'hit'   (a música anda)
//  - repetiu o acorde que já está tocando (ritmo) -> 'strum' (nada anda)
//  - tocou outro acorde -> 'miss' (nada anda)
// Acordes iguais seguidos na cifra (C ... C) contam como um só: você só continua batendo.

import { cosine } from './audio.js';
import { COMMON_CHORDS } from './chords.js';

export class Follower {
  constructor(events, onEvent) {
    this.events = events; // [{name, tpl}]
    this.onEvent = onEvent;
    this.pos = 0; // acorde que está tocando (ou o primeiro, antes de começar)
    this.started = false; // já tocou o primeiro acorde?
    this.evidence = 0;
    this.env = 0; // envelope de volume, para perceber cada batida
    this.lastOnset = 0;
    this.onset = null;
    const seen = new Set();
    this.rivals = [...COMMON_CHORDS, ...events].filter((c) => !seen.has(c.name) && seen.add(c.name));
    this.setSensitivity(5);
  }

  /** 1 (cauteloso) a 10 (muito sensível). */
  setSensitivity(s) {
    this.margin = 0.13 - s * 0.011; // quanto o alvo precisa "ganhar" do acorde atual
    this.needFrames = Math.round(9 - s * 0.6); // por quantos quadros de 50 ms
    this.minSim = 0.62 - s * 0.012;
  }

  similar(a, b) {
    return cosine(a.tpl, b.tpl) > 0.9; // ex.: C e C7M, G e G/B
  }

  /** Próximo acorde DIFERENTE depois de i (pula repetições como C ... C). -1 no fim. */
  nextIndex(i = this.pos) {
    const ev = this.events;
    let j = i + 1;
    while (j < ev.length && this.similar(ev[j], ev[i])) j++;
    return j < ev.length ? j : -1;
  }

  /** Índice do acorde que você precisa tocar agora. */
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

  update(chroma, rms, now, noise) {
    // cada batida nas cordas é um salto de volume
    if (rms > noise * 1.5 && rms > this.env * 1.5 && now - this.lastOnset > 150) {
      this.lastOnset = now;
      this.onset = { frames: 0, decided: false };
    }
    this.env = Math.max(rms, this.env * 0.85);
    if (rms <= noise) { this.evidence = 0; return; }

    const ev = this.events;
    const ti = this.target();
    const tgt = ti >= 0 ? ev[ti] : null;
    const cur = this.started ? ev[this.pos] : null;
    const sT = tgt ? cosine(chroma, tgt.tpl) : 0;
    const sC = cur ? cosine(chroma, cur.tpl) : 0;
    const best = this.bestRival(chroma);

    // acertou o alvo: parece mais com ele do que com o acorde atual e com qualquer outro
    const hitting = tgt && sT > this.minSim && sT > sC + this.margin && sT >= best.s - 0.04;
    this.evidence = hitting ? this.evidence + 1 : Math.max(0, this.evidence - 1);
    if (this.evidence >= this.needFrames) {
      if (this.started) this.pos = ti;
      this.started = true;
      this.evidence = 0;
      if (this.onset) this.onset.decided = true;
      this.onEvent({ type: 'hit', pos: this.pos });
      return;
    }

    // a batida não foi o alvo: foi o mesmo acorde de antes (ritmo) ou um erro?
    if (this.onset && !this.onset.decided && ++this.onset.frames >= this.needFrames + 3) {
      this.onset.decided = true;
      if (cur && sC > this.minSim && sC >= best.s - 0.05) {
        this.onEvent({ type: 'strum', pos: this.pos });
      } else if (best.chord && best.s > this.minSim && !(tgt && cosine(best.chord.tpl, tgt.tpl) > 0.9)) {
        this.onEvent({ type: 'miss', heard: best.chord.name, expected: tgt?.name || null });
      }
    }
  }
}
