'use strict';
// Cria ou troca a senha do painel e grava apenas o HASH no arquivo .env (fora do repositório).
// Uso:
//   node tools/criar-senha.js                -> pergunta a nova senha
//   node tools/criar-senha.js --gerar        -> gera uma senha aleatória e mostra uma única vez
//   node tools/criar-senha.js --usuario nome -> também define o usuário
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { hashPassword } = require('../src/auth');

const envFile = path.join(__dirname, '..', '.env');
const exampleFile = path.join(__dirname, '..', '.env.example');
const args = process.argv.slice(2);
const userIdx = args.indexOf('--usuario');
const user = userIdx >= 0 ? args[userIdx + 1] : null;

function setVar(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
}

function save(password) {
  if (password.length < 10) {
    console.error('A senha precisa ter pelo menos 10 caracteres.');
    process.exit(1);
  }
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : fs.readFileSync(exampleFile, 'utf8');
  text = setVar(text, 'ADMIN_PASSWORD_HASH', hashPassword(password));
  if (user) text = setVar(text, 'ADMIN_USER', user.replace(/[^\w.@-]/g, ''));
  fs.writeFileSync(envFile, text, { mode: 0o600 });
  console.log('\nSenha do painel salva (apenas o hash foi gravado em app/.env).');
  console.log('Reinicie o site para aplicar.\n');
}

if (args.includes('--gerar')) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const pwd = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  save(pwd);
  console.log(`Senha gerada: ${pwd}`);
  console.log('Anote em local seguro. Ela não fica salva em texto puro em nenhum arquivo.\n');
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Nova senha do painel (mínimo 10 caracteres): ', (a) => {
    rl.question('Repita a senha: ', (b) => {
      rl.close();
      if (a !== b) { console.error('As senhas não conferem.'); process.exit(1); }
      save(a);
    });
  });
}
