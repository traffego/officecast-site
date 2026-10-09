'use strict';
// Tudo o que envolve o YouTube: leitura de links, validação do identificador,
// montagem segura da incorporação, verificação via oEmbed e cache de miniaturas.
const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

function isVideoId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// Aceita os formatos usuais de link de vídeo/transmissão e devolve { id } ou { error }.
// Nunca aceita HTML: o campo é apenas um link (ou o próprio identificador de 11 caracteres).
function parseYouTubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { error: 'Cole o link do vídeo ou da transmissão no YouTube.' };
  if (raw.length > 500) return { error: 'O link é longo demais.' };
  if (/[<>"'`\s]/.test(raw)) {
    return { error: 'Cole apenas o link do vídeo (não use código de incorporação ou HTML).' };
  }
  if (isVideoId(raw)) return { id: raw };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: 'Não foi possível ler esse link. Confira se ele foi copiado por completo.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: 'O link precisa começar com https://' };
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { error: 'O link precisa ser do YouTube (youtube.com ou youtu.be).' };

  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (host.endsWith('youtu.be')) {
    id = parts[0];
  } else if (parts[0] === 'watch') {
    id = url.searchParams.get('v');
  } else if (['live', 'embed', 'shorts', 'v', 'e'].includes(parts[0])) {
    id = parts[1];
  } else if (!parts.length && url.searchParams.get('v')) {
    id = url.searchParams.get('v');
  } else if (parts[0] && (parts[0].startsWith('@') || ['channel', 'c', 'user'].includes(parts[0]))) {
    return { error: 'Esse é o link do canal, não de um vídeo. Abra a transmissão no YouTube e copie o link dela (por exemplo, youtube.com/live/…).' };
  } else if (parts[0] === 'playlist') {
    return { error: 'Esse é o link de uma playlist. Para o player, use o link de um vídeo específico.' };
  }
  if (!isVideoId(id)) return { error: 'Não encontramos o identificador do vídeo nesse link. Copie o link diretamente da página do vídeo.' };
  return { id };
}

function parsePlaylistUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { id: '' };
  if (/[<>"'`\s]/.test(raw)) return { error: 'Cole apenas o link da playlist.' };
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!HOSTS.has(url.hostname.toLowerCase())) return { error: 'O link precisa ser do YouTube.' };
    const list = url.searchParams.get('list');
    if (list && /^[A-Za-z0-9_-]{10,64}$/.test(list)) return { id: list };
  } catch { /* cai no erro abaixo */ }
  return { error: 'Link de playlist inválido. Ele deve conter "list=".' };
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
const playlistUrl = (id) => `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
// Domínio sem cookies até o visitante dar play; reprodução sempre iniciada pelo usuário.
function embedUrl(id) {
  if (!isVideoId(id)) throw new Error('ID de vídeo inválido');
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}

// Consulta pública oEmbed: confirma que o vídeo existe e permite incorporação.
async function checkOEmbed(id, { timeoutMs = 7000 } = {}) {
  if (!isVideoId(id)) return { ok: false, reason: 'invalid' };
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 200) {
      const j = await res.json();
      return { ok: true, embeddable: true, title: String(j.title || '').slice(0, 300), author: String(j.author_name || '').slice(0, 120) };
    }
    if (res.status === 401 || res.status === 403) return { ok: true, embeddable: false };
    if (res.status === 404 || res.status === 400) return { ok: false, reason: 'not_found' };
    return { ok: false, reason: 'unavailable', status: res.status };
  } catch (err) {
    return { ok: false, reason: 'network', message: err.message };
  }
}

// Miniaturas: baixadas uma vez e servidas pelo próprio site (sem requisições ao YouTube na navegação).
const THUMB_SOURCES = {
  320: ['mqdefault'],
  640: ['sddefault', 'hqdefault'],
  1280: ['maxresdefault', 'hq720', 'sddefault'],
};
const THUMB_SIZES = Object.keys(THUMB_SOURCES).map(Number);

function thumbPath(dataDir, id, size) {
  if (!isVideoId(id) || !THUMB_SOURCES[size]) return null;
  return path.join(dataDir, 'thumbs', `${id}-${size}.jpg`);
}

async function fetchThumb(dataDir, id, size) {
  const file = thumbPath(dataDir, id, size);
  if (!file) return false;
  if (fs.existsSync(file)) return true;
  for (const name of THUMB_SOURCES[size]) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { signal: AbortSignal.timeout(10000) });
      if (res.status !== 200 || !String(res.headers.get('content-type')).startsWith('image/')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1500 || buf.length > 3 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) continue;
      fs.writeFileSync(file, buf);
      return true;
    } catch { /* tenta a próxima fonte */ }
  }
  return false;
}

async function ensureThumbs(dataDir, ids) {
  let done = 0;
  for (const id of new Set(ids.filter(isVideoId))) {
    for (const size of THUMB_SIZES) if (await fetchThumb(dataDir, id, size)) done++;
  }
  return done;
}

module.exports = {
  isVideoId, parseYouTubeUrl, parsePlaylistUrl, watchUrl, playlistUrl, embedUrl,
  checkOEmbed, thumbPath, fetchThumb, ensureThumbs, THUMB_SIZES,
};
