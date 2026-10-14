// Catálogo inicial do Cifra Viva.
//  - Originais: letras escritas para o site.
//  - Folclore / domínio público: letras tradicionais, sem autor protegido.
//  - Populares: só acordes e estrutura (a letra tem direito autoral); use "Colar letra"
//    para completar com a sua cópia pessoal. Acordes de referência — confira o tom.
//
// Campos: genre, level (1 fácil · 2 médio · 3 difícil), key, bpm, strum (8 colcheias:
// D = para baixo, U = para cima, - = pausa), capo, chordsOnly.

/** Monta uma tablatura a partir de notas "corda+casa": "e0 B3 G2+B1 | ..." */
function tab(seq) {
  const names = ['e', 'B', 'G', 'D', 'A', 'E'];
  const lines = names.map((n) => n + '|-');
  for (const tok of seq.trim().split(/\s+/)) {
    if (tok === '|') { for (let i = 0; i < 6; i++) lines[i] += '|-'; continue; }
    const notes = Object.fromEntries(tok.split('+').map((p) => [p[0], p.slice(1)]));
    const w = Math.max(...Object.values(notes).map((f) => f.length));
    for (let i = 0; i < 6; i++) lines[i] += (notes[names[i]] ?? '').padEnd(w, '-') + '-';
  }
  return lines.map((l) => l + '|').join('\n');
}

export const GENRES = [
  { id: 'rock', name: 'Rock', icon: '🎸' },
  { id: 'pop', name: 'Pop', icon: '🎤' },
  { id: 'mpb', name: 'MPB', icon: '🌴' },
  { id: 'sertanejo', name: 'Sertanejo', icon: '🤠' },
  { id: 'folk', name: 'Folk', icon: '🌾' },
  { id: 'infantil', name: 'Infantil e Folclore', icon: '🎈' },
  { id: 'gospel', name: 'Gospel e Hinos', icon: '🙏' },
  { id: 'exercicios', name: 'Exercícios', icon: '🏋️' },
];

export const DEMO_SONGS = [
  // ---------------- originais ----------------
  {
    id: 'demo-estrada', title: 'Estrada de Terra', artist: 'Cifra Viva (original)',
    genre: 'sertanejo', level: 1, key: 'G', bpm: 92, strum: 'D-DU-UDU',
    text: `[Intro] G  D  Em  C

[Primeira parte]
G                    D
Saio cedo pela estrada de terra
Em                  C
O sol nascendo atrás da serra
G                 D
Levo no peito uma canção
Em                C
E o violão na minha mão

[Refrão]
C           G
Toca, toca devagar
D                  Em
Que a letra sobe sem parar
C            G
Cada acorde é um degrau
D                  G
Até o fim do meu sarau

[Segunda parte]
G                    D
Passa a cerca, passa o rio
Em                    C
O vento canta um assobio
G                   D
Quem tem música não tem pressa
Em                   C
Cada verso é uma promessa

[Refrão]
C           G
Toca, toca devagar
D                  Em
Que a letra sobe sem parar
C            G
Cada acorde é um degrau
D                  G
Até o fim do meu sarau

[Final] C  D  G`,
  },
  {
    id: 'demo-varanda', title: 'Café na Varanda', artist: 'Cifra Viva (original)',
    genre: 'mpb', level: 1, key: 'C', bpm: 84, strum: 'D-D-UDU-',
    text: `[Intro] [C] [Am] [F] [G]

[Verso]
[C]Chove fino lá fora, [Am]o café tá no fogão
[F]Minha avó conta histórias, [G]eu dedilho o violão
[C]A janela embaçada, [Am]um desenho com a mão
[F]Toda tarde é sagrada [G]quando tem essa canção

[Refrão]
[F]Fica mais um [G]pouco
[C]Que a chuva vai [Am]passar
[F]O tempo aqui é [G]outro
[C]Ninguém precisa [G]apressar

[Final] [F] [G] [C]`,
  },
  {
    id: 'demo-riff', title: 'Riff do Iniciante', artist: 'Cifra Viva (exercício original)',
    genre: 'exercicios', level: 1, key: 'E', bpm: 90,
    text: `[Riff — cordas graves, uma nota por vez]
${tab('E0 E3 A0 A2 | E0 E3 A0 A2 | D0 D2 A2 A0 | E3 E0 E3 A0')}

[Riff com acordes]
E5   A5   E5   D5

[Riff final]
${tab('A0 A2 D0 D2 | A2 A0 E3 E0')}`,
  },
  {
    id: 'demo-dedilhado', title: 'Dedilhado da Manhã', artist: 'Cifra Viva (exercício original)',
    genre: 'exercicios', level: 2, key: 'Am', bpm: 70,
    text: `[Dedilhado — toque nota por nota]
${tab('A0 G2 B1 G2 | A3 G0 B1 G0 | D0 G2 B3 G2 | E1 G2 B1 G2')}

[Mesmos acordes, agora batendo]
Am   C   D   F   Am`,
  },

  // -------- melodias de domínio público (tablatura) --------
  {
    id: 'pd-ode', title: 'Ode à Alegria (melodia)', artist: 'Ludwig van Beethoven (domínio público)',
    genre: 'exercicios', level: 1, key: 'C', bpm: 100,
    text: `[Primeira frase]
${tab('e0 e0 e1 e3 | e3 e1 e0 B3 | B1 B1 B3 e0 | e0 B3 B3')}

[Segunda frase]
${tab('e0 e0 e1 e3 | e3 e1 e0 B3 | B1 B1 B3 e0 | B3 B1 B1')}`,
  },
  {
    id: 'pd-parabens', title: 'Parabéns a Você (melodia)', artist: 'Tradicional (melodia em domínio público)',
    genre: 'infantil', level: 1, key: 'C', bpm: 100,
    text: `[Melodia]
${tab('G0 G0 G2 G0 B1 B0 | G0 G0 G2 G0 B3 B1')}
${tab('G0 G0 e3 e0 B1 B0 G2 | e1 e1 e0 B1 B3 B1')}

[Acompanhamento]
C   G7   G7   C   C   F   C G7   C`,
  },
  {
    id: 'pd-brilha', title: 'Brilha, Brilha, Estrelinha (melodia)', artist: 'Tradicional (domínio público)',
    genre: 'infantil', level: 1, key: 'C', bpm: 96,
    text: `[Melodia]
${tab('B1 B1 e3 e3 e5 e5 e3 | e1 e1 e0 e0 B3 B3 B1')}
${tab('e3 e3 e1 e1 e0 e0 B3 | e3 e3 e1 e1 e0 e0 B3')}
${tab('B1 B1 e3 e3 e5 e5 e3 | e1 e1 e0 e0 B3 B3 B1')}`,
  },

  // -------- folclore brasileiro (letras tradicionais) --------
  {
    id: 'pd-ciranda', title: 'Ciranda, Cirandinha', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 104, strum: 'D-DUD-DU',
    text: `C                    G7
Ciranda, cirandinha, vamos todos cirandar
G7                      C
Vamos dar a meia volta, volta e meia vamos dar

C                         G7
O anel que tu me deste era vidro e se quebrou
G7                           C
O amor que tu me tinhas era pouco e se acabou`,
  },
  {
    id: 'pd-cravo', title: 'O Cravo e a Rosa', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 96, strum: 'D-DUD-DU',
    text: `C                      G7
O cravo brigou com a rosa debaixo de uma sacada
G7                       C
O cravo saiu ferido e a rosa despedaçada

C                     G7
O cravo ficou doente, a rosa foi visitar
G7                       C
O cravo teve um desmaio e a rosa pôs-se a chorar`,
  },
  {
    id: 'pd-marcha', title: 'Marcha Soldado', artist: 'Folclore brasileiro',
    genre: 'infantil', level: 1, key: 'C', bpm: 110, strum: 'D-D-D-D-',
    text: `C                   G7
Marcha soldado, cabeça de papel
G7                      C
Se não marchar direito vai preso pro quartel

C                    G7
O quartel pegou fogo, a polícia deu sinal
G7                         C
Acode, acode, acode a bandeira nacional`,
  },
  {
    id: 'pd-peixe', title: 'Peixe Vivo', artist: 'Folclore mineiro',
    genre: 'infantil', level: 1, key: 'G', bpm: 92, strum: 'D-DUD-DU',
    text: `G                      D7
Como pode o peixe vivo viver fora da água fria?
D7                     G
Como pode o peixe vivo viver fora da água fria?

G                        C
Como poderei viver, como poderei viver
G              D7               G
Sem a tua, sem a tua, sem a tua companhia?`,
  },
  {
    id: 'pd-amazing', title: 'Amazing Grace', artist: 'John Newton, 1779 (domínio público)',
    genre: 'gospel', level: 1, key: 'G', bpm: 72, strum: 'D--D-U',
    text: `G            G7         C       G
Amazing grace, how sweet the sound
G                     D
That saved a wretch like me
G              G7      C        G
I once was lost, but now am found
G        D      G
Was blind, but now I see`,
  },

  // -------- populares: só acordes e estrutura --------
  {
    id: 'pop-heaven', title: "Knockin' on Heaven's Door", artist: 'Bob Dylan', chordsOnly: true,
    genre: 'rock', level: 1, key: 'G', bpm: 69, strum: 'D-DU-UDU',
    text: `[Verso] G  D  Am7  Am7  G  D  C  C
[Verso] G  D  Am7  Am7  G  D  C  C
[Refrão] G  D  Am7  Am7  G  D  C  C
[Refrão] G  D  Am7  Am7  G  D  C  C`,
  },
  {
    id: 'pop-letitbe', title: 'Let It Be', artist: 'The Beatles', chordsOnly: true,
    genre: 'pop', level: 1, key: 'C', bpm: 72, strum: 'D-DU-UDU',
    text: `[Intro] C  G  Am  F  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Refrão] Am  G  F  C  C  G  F  C
[Verso] C  G  Am  F  C  G  F  C
[Refrão] Am  G  F  C  C  G  F  C`,
  },
  {
    id: 'pop-standbyme', title: 'Stand By Me', artist: 'Ben E. King', chordsOnly: true,
    genre: 'pop', level: 1, key: 'A', bpm: 118, strum: 'D-DU-UDU',
    text: `[Intro] A  F#m  D  E  A
[Verso] A  F#m  D  E  A
[Verso] A  F#m  D  E  A
[Refrão] A  F#m  D  E  A
[Refrão] A  F#m  D  E  A`,
  },
  {
    id: 'pop-wonderwall', title: 'Wonderwall', artist: 'Oasis', chordsOnly: true, capo: 2,
    genre: 'rock', level: 2, key: 'Em', bpm: 87, strum: 'DDDUDUDU',
    text: `[Intro] Em7  G  Dsus4  A7sus4
[Verso] Em7  G  Dsus4  A7sus4  Em7  G  Dsus4  A7sus4
[Pré-refrão] Cadd9  Dsus4  Em7  Cadd9  Dsus4  Em7  Cadd9  Dsus4  A7sus4
[Refrão] Cadd9  Em7  G  Em7  Cadd9  Em7  G  Em7  Cadd9  Em7  G  Em7`,
  },
  {
    id: 'pop-zombie', title: 'Zombie', artist: 'The Cranberries', chordsOnly: true,
    genre: 'rock', level: 1, key: 'Em', bpm: 84, strum: 'D-D-DUDU',
    text: `[Intro] Em  C  G  D
[Verso] Em  C  G  D  Em  C  G  D
[Refrão] Em  C  G  D  Em  C  G  D`,
  },
  {
    id: 'pop-imagine', title: 'Imagine', artist: 'John Lennon', chordsOnly: true,
    genre: 'pop', level: 1, key: 'C', bpm: 76, strum: 'D-D-D-D-',
    text: `[Verso] C  C7M  F  C  C7M  F
[Verso] C  C7M  F  C  C7M  F
[Ponte] F  Am  Dm  F  G  G7
[Refrão] F  G  C  E7  F  G  C  E7  F  G  C`,
  },
  {
    id: 'pop-wishyou', title: 'Wish You Were Here', artist: 'Pink Floyd', chordsOnly: true,
    genre: 'rock', level: 2, key: 'G', bpm: 60, strum: 'D-DU-UDU',
    text: `[Intro] Em7  G  Em7  G  Em7  A7sus4  Em7  A7sus4  G
[Verso] C  D/F#  Am  G  D/F#  C  Am  G`,
  },
  {
    id: 'pop-hallelujah', title: 'Hallelujah', artist: 'Leonard Cohen', chordsOnly: true,
    genre: 'folk', level: 2, key: 'C', bpm: 56, strum: 'D--DUD',
    text: `[Intro] C  Am  C  Am
[Verso] C  Am  C  Am  F  G  C  G
[Verso] C  F  G  Am  F  G  E7  Am
[Refrão] F  Am  F  C  G  C`,
  },
  {
    id: 'pop-alabama', title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', chordsOnly: true,
    genre: 'rock', level: 1, key: 'D', bpm: 98, strum: 'D-DU-UDU',
    text: `[Intro] D  Cadd9  G  G
[Verso] D  Cadd9  G  G  D  Cadd9  G  G
[Refrão] D  Cadd9  G  G  D  Cadd9  G  G`,
  },
  {
    id: 'pop-riptide', title: 'Riptide', artist: 'Vance Joy', chordsOnly: true,
    genre: 'folk', level: 1, key: 'Am', bpm: 101, strum: 'D-DU-UDU',
    text: `[Verso] Am  G  C  C  Am  G  C  C
[Refrão] Am  G  C  C  Am  G  C  C`,
  },
  {
    id: 'pop-browneyed', title: 'Brown Eyed Girl', artist: 'Van Morrison', chordsOnly: true,
    genre: 'pop', level: 1, key: 'G', bpm: 150, strum: 'D-DU-UDU',
    text: `[Intro] G  C  G  D
[Verso] G  C  G  D  G  C  G  D
[Pré-refrão] C  D  G  Em  C  D
[Refrão] G  C  G  D  G  C  G  D`,
  },
  {
    id: 'pop-rising', title: 'House of the Rising Sun', artist: 'Tradicional (versão The Animals)', chordsOnly: true,
    genre: 'folk', level: 2, key: 'Am', bpm: 76,
    text: `[Dedilhado de cada acorde (6/8)]
${tab('A0 G2 B1 e0 B1 G2 | A3 G0 B1 e0 B1 G0 | D0 G2 B3 e2 B3 G2 | D3 G2 B1 e1 B1 G2')}

[Verso] Am  C  D  F  Am  C  E  E
[Verso] Am  C  D  F  Am  E  Am  E`,
  },
];
