'use strict';
// Leitura de configuração: variáveis de ambiente + arquivo .env (sem dependências externas).
const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = path.resolve(__dirname, '..');

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadConfig(overrides = {}) {
  const fileEnv = parseEnvFile(path.join(APP_DIR, '.env'));
  const get = (k, def = '') => {
    if (overrides[k] !== undefined) return String(overrides[k]);
    if (process.env[k] !== undefined && process.env[k] !== '') return process.env[k];
    if (fileEnv[k] !== undefined && fileEnv[k] !== '') return fileEnv[k];
    return def;
  };
  const dataDir = get('DATA_DIR') ? path.resolve(APP_DIR, get('DATA_DIR')) : path.join(APP_DIR, 'data');
  const base = get('PUBLIC_BASE_URL').replace(/\/+$/, '');
  // Trava de segurança para produção: com domínio configurado, os dados precisam ficar FORA da pasta do código.
  // Em hospedagens que recriam a pasta do código a cada publicação (ex.: Node.js gerenciado da Hostinger),
  // dados dentro dela seriam apagados.
  const inside = (dataDir + path.sep).startsWith(APP_DIR + path.sep);
  if (base && inside && get('ALLOW_DATA_INSIDE_APP') !== 'true') {
    throw new Error(
      `DATA_DIR aponta para dentro da pasta do código (${dataDir}). Em produção, defina DATA_DIR ` +
      'com uma pasta fora do código (ex.: /home/USUARIO/officecast-data) para que publicações futuras não apaguem o conteúdo.',
    );
  }
  return {
    appDir: APP_DIR,
    publicDir: path.join(APP_DIR, 'public'),
    seedFile: path.join(APP_DIR, 'content', 'seed.json'),
    dataDir,
    port: Number(get('PORT', '3000')) || 3000,
    host: get('HOST', '127.0.0.1'),
    adminUser: get('ADMIN_USER', 'equipe'),
    adminPasswordHash: get('ADMIN_PASSWORD_HASH'),
    publicBaseUrl: /^https?:\/\/[^\s]+$/i.test(base) ? base : '',
    cookieSecure: get('COOKIE_SECURE', 'false') === 'true',
    trustProxy: get('TRUST_PROXY', 'false') === 'true',
    fetchRemote: get('FETCH_REMOTE', 'true') !== 'false',
    timeZone: 'America/Sao_Paulo',
  };
}

module.exports = { loadConfig, parseEnvFile, APP_DIR };
