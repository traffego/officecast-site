'use strict';
// Verificação rápida: sintaxe de todos os arquivos JS e validade do JSON de conteúdo inicial.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'data'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { failed++; console.error(`ERRO de sintaxe: ${path.relative(root, f)}\n${e.stderr}`); }
}
try { JSON.parse(fs.readFileSync(path.join(root, 'content', 'seed.json'), 'utf8')); } catch (e) { failed++; console.error('content/seed.json inválido:', e.message); }
console.log(`${files.length} arquivos JS verificados, ${failed} problema(s).`);
process.exit(failed ? 1 : 0);
