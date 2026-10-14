// Acompanha em que acorde da música você está. Só compara o som com o acorde
// atual e os próximos (e não com todos os acordes do mundo), o que deixa a
// detecção bem mais robusta do que tentar "adivinhar" o acorde do zero.

import { cosine } from './audio.js';
import { COMMON_CHORDS } from './chords.js';

export class Follower {
  constructor(events, onMove) {
    this.events = events; // [{name, tpl}]
    this.onMove = onMove;
    this.allowSkip = true; // aceitar pular um acorde (útil no violão real, desligado no virtual)
    // todos os acordes "concorrentes": se o som parece mais com outro acorde, não avança
    const seen = new Set();
    this.rivals = [...COMMON_CHORDS, ...events].filter((c) => !seen.has(c.name) && seen.add(c.name)).map((c) => c.tpl);
    this.pos = 0;
    this.enteredAt = performance.now();
    this.avgDur = 2200; // duração média de um acorde (ms), aprendida enquanto você toca
    this.evidence = [0, 0];
    this.setSensitivity(5);
  }

  /** 1 (cauteloso) a 10 (muito sensível). */
  setSensitivity(s) {
    this.margin = 0.13 - s * 0.011; // quanto o próximo acorde precisa "ganhar" do atual
    this.needFrames = Math.round(9 - s * 0.6); // por quantos quadros de 50 ms seguidos
    this.minSim = 0.62 - s * 0.012;
  }

  setPosition(i) {
    this.pos = Math.max(0, Math.min(this.events.length - 1, i));
    this.enteredAt = performance.now();
    this.evidence = [0, 0];
    this.onMove(this.pos, 'manual');
  }

  similar(a, b) {
    return cosine(a.tpl, b.tpl) > 0.9; // ex.: C e C7M, G e G/B
  }

  update(chroma, now) {
    const ev = this.events;
    const cur = ev[this.pos];
    const n1 = ev[this.pos + 1];
    if (!cur || !n1) return null;
    const n2 = ev[this.pos + 2];
    const sCur = cosine(chroma, cur.tpl);

    // Mesmo acorde repetido (C ... C): não dá para ouvir a troca, então
    // avançamos pelo tempo médio que você costuma ficar em cada acorde.
    if (this.similar(cur, n1)) {
      if (now - this.enteredAt > this.avgDur && sCur > this.minSim) this.advance(1, now, false);
      return { sCur, s1: sCur, s2: 0 };
    }

    const s1 = cosine(chroma, n1.tpl);
    const canSkip = this.allowSkip && n2 && !this.similar(n1, n2) && !this.similar(cur, n2);
    const s2 = canSkip ? cosine(chroma, n2.tpl) : -1;
    const best = s2 > s1 + 0.08 ? 1 : 0;
    const sBest = best ? s2 : s1;
    let sAll = 0;
    for (const t of this.rivals) sAll = Math.max(sAll, cosine(chroma, t));

    if (sBest > this.minSim && sBest > sCur + this.margin && sBest >= sAll - 0.04) {
      this.evidence[best]++;
      this.evidence[1 - best] = Math.max(0, this.evidence[1 - best] - 1);
    } else {
      this.evidence[0] = Math.max(0, this.evidence[0] - 1);
      this.evidence[1] = Math.max(0, this.evidence[1] - 1);
    }

    // Pular um acorde (porque você foi rápido ou ele foi mal detectado) exige mais certeza.
    const need = best ? this.needFrames * 3 : this.needFrames;
    if (this.evidence[best] >= need) this.advance(best + 1, now, true);
    return { sCur, s1, s2 };
  }

  advance(steps, now, learn) {
    const dur = (now - this.enteredAt) / steps;
    if (learn && dur > 300 && dur < 12000) this.avgDur = this.avgDur * 0.7 + dur * 0.3;
    this.pos = Math.min(this.events.length - 1, this.pos + steps);
    this.enteredAt = now;
    this.evidence = [0, 0];
    this.onMove(this.pos, 'audio');
  }
}
