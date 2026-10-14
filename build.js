// Junta os módulos de js/ em um único arquivo (cifra-viva.js) que funciona até
// abrindo o index.html com duplo clique (o navegador bloqueia módulos em file://).
// Uso: node build.js   (rode sempre que alterar algo em js/)
const fs = require('fs');
const path = require('path');

const ORDER = ['chords', 'sheet', 'audio', 'follower', 'songs', 'guitar', 'diagram', 'synth', 'guitarview', 'app'];

const body = ORDER.map((name) => {
  const src = fs.readFileSync(path.join(__dirname, 'js', name + '.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export (?=const|function|class|let)/gm, '');
  return `// ===== js/${name}.js =====\n${src}`;
}).join('\n');

const out = `// ARQUIVO GERADO por build.js — edite os arquivos em js/ e rode "node build.js".\n(() => {\n'use strict';\n${body}\n})();\n`;
fs.writeFileSync(path.join(__dirname, 'cifra-viva.js'), out);
console.log('cifra-viva.js gerado (' + Math.round(out.length / 1024) + ' KB)');
