'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Política de segurança: scripts e estilos apenas do próprio site; player só do domínio youtube-nocookie.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(res, { noindex } = {}) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(body);
}

function redirect(res, location, status = 303) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.end();
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HttpError(413, 'Conteúdo grande demais.')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Conteúdo grande demais.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Formulários HTML (application/x-www-form-urlencoded). Campos repetidos viram lista.
// O resultado fica guardado na requisição: a verificação de CSRF e o handler podem ler o mesmo corpo.
async function readForm(req, limit = 256 * 1024) {
  if (req.formCache) return req.formCache;
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/x-www-form-urlencoded')) throw new HttpError(415, 'Formato de envio não suportado.');
  const buf = await readBody(req, limit);
  const params = new URLSearchParams(buf.toString('utf8'));
  const out = Object.create(null);
  for (const [k, v] of params) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  req.formCache = out;
  return out;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, { maxAge, secure, httpOnly = true, sameSite = 'Strict', path: p = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${p}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}

// Serve arquivos de uma pasta, bloqueando acesso fora dela.
function serveFile(req, res, rootDir, relPath, { maxAge = 0 } = {}) {
  let decoded;
  try { decoded = decodeURIComponent(relPath); } catch { return false; }
  if (decoded.includes('\0')) return false;
  const file = path.resolve(rootDir, '.' + path.posix.normalize('/' + decoded));
  if (!file.startsWith(path.resolve(rootDir) + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return false;
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', maxAge ? `public, max-age=${maxAge}` : 'no-cache');
  if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return true; }
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

// Atrás de um proxy (HTTPS da hospedagem), o IP real vem em X-Forwarded-For.
// Só confiamos nesse cabeçalho com TRUST_PROXY=true; usamos o último item, que é o
// endereço visto pelo proxy (os anteriores podem ser forjados pelo visitante).
function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'desconhecido';
}

// Confere se o POST veio do próprio site (proteção adicional contra envios de outros domínios).
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin) {
    const ref = req.headers.referer;
    if (!ref) return true; // navegadores antigos/privacidade: o token CSRF continua sendo exigido
    try { return new URL(ref).host === host; } catch { return false; }
  }
  if (origin === 'null') return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

module.exports = {
  MIME, securityHeaders, send, redirect, json, HttpError, readBody, readForm, parseCookies, setCookie,
  serveFile, clientIp, sameOrigin,
};
