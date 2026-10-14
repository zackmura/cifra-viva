# 🎸 Cifra Viva

Site de cifras que **escuta o seu violão** e rola a letra sozinho conforme você troca de acorde.

- **🎤 Ouvir violão** – usa o microfone, reconhece o acorde que você está tocando e avança a letra.
- **🎸 Violão virtual** – um violão na tela para testar/praticar sem instrumento: toque os botões dos acordes e a letra só desce quando você toca o **acorde certo**. O braço mostra onde pôr os dedos do próximo acorde.
- **Desenhos dos acordes** com variações (‹ ›), geradas para qualquer acorde, inclusive transposto.
- Transposição de tom, tamanho da letra, rolagem por tempo, cifras salvas no navegador.
- Feito para celular: tela fica ligada enquanto você toca e dá para "instalar" na tela inicial.

## Como abrir

- **Mais fácil:** dê dois cliques em `index.html`.
- **Com servidor local** (recomendado para usar o microfone): `node server.js` e abra http://localhost:5173
- **Online:** publique no GitHub Pages (abaixo) e abra o link no celular.

## Formato das cifras

Cole a cifra em **+ Nova**. Funcionam os dois formatos:

```
[Refrão]
G              D
Saio cedo pela estrada

[G]Saio cedo pela [D]estrada
```

## Desenvolvimento

O código fica em `js/` (módulos). O arquivo `cifra-viva.js` é **gerado** — depois de mexer em `js/`, rode:

```
node build.js
```

| Arquivo | O que faz |
|---|---|
| `js/audio.js` | Microfone → cromagrama (quanto de cada nota está soando), descontando harmônicos |
| `js/follower.js` | Acompanha em que acorde da música você está |
| `js/chords.js` | Nomes de acordes, transposição, notas de cada acorde |
| `js/sheet.js` | Lê a cifra em texto |
| `js/guitar.js` | Formas de acorde no violão (comuns + gerador de variações) |
| `js/diagram.js` | Desenho do acorde (SVG) |
| `js/guitarview.js` | Desenho do violão virtual |
| `js/synth.js` | Som do violão sintetizado |
| `js/app.js` | Interface |
