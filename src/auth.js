'use strict';
// Autenticação do painel: senha com hash scrypt (nunca em texto puro), sessão no servidor,
// token CSRF por sessão e limite de tentativas de login.
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const IDLE_MS = 2 * 3600 * 1000;      // sessão expira após 2 h sem uso
const ABSOLUTE_MS = 12 * 3600 * 1000; // e no máximo 12 h após o login
const COOKIE = 'oc_admin';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64url');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64url'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class Sessions {
  constructor() { this.map = new Map(); }

  create(user) {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.map.set(id, { user, csrf: crypto.randomBytes(24).toString('base64url'), created: now, seen: now });
    return id;
  }

  get(id) {
    if (!id) return null;
    const s = this.map.get(id);
    if (!s) return null;
    const now = Date.now();
    if (now - s.seen > IDLE_MS || now - s.created > ABSOLUTE_MS) { this.map.delete(id); return null; }
    s.seen = now;
    return s;
  }

  destroy(id) { this.map.delete(id); }
}

// Limite simples por chave (IP): N falhas por janela.
class RateLimiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = new Map(); }
  _entry(key) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || now - e.start > this.windowMs) { e = { start: now, count: 0 }; this.hits.set(key, e); }
    return e;
  }
  blocked(key) { return this._entry(key).count >= this.max; }
  hit(key) { this._entry(key).count++; }
  reset(key) { this.hits.delete(key); }
}

module.exports = { hashPassword, verifyPassword, safeEqual, Sessions, RateLimiter, COOKIE, IDLE_MS };
