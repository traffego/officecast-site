'use strict';
// Validação de imagens enviadas pelo painel: tipo real (assinatura do arquivo) e dimensões.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_UPLOAD = 5 * 1024 * 1024;

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, exceto DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function pngSize(buf) {
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function inspectImage(buf) {
  const type = sniff(buf);
  if (!type) return { error: 'Formato não suportado. Envie JPEG, PNG ou WebP.' };
  let size = null;
  try { size = type === 'jpg' ? jpegSize(buf) : type === 'png' ? pngSize(buf) : webpSize(buf); } catch { size = null; }
  if (!size || !(size.w > 0 && size.h > 0) || size.w > 12000 || size.h > 12000) return { error: 'Não foi possível ler as dimensões da imagem.' };
  return { type, ...size };
}

function saveUpload(dataDir, buf) {
  if (buf.length > MAX_UPLOAD) return { error: 'A imagem passa de 5 MB.' };
  const info = inspectImage(buf);
  if (info.error) return info;
  const now = new Date();
  const sub = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(dataDir, 'uploads', ...sub.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${info.type}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return { src: `/media/${sub}/${name}`, w: info.w, h: info.h };
}

module.exports = { inspectImage, saveUpload, MAX_UPLOAD };
