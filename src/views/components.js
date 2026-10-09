'use strict';
const { html, raw } = require('./html');
const t = require('../time');
const { TOPICS, seriesSummary } = require('../domain');
const { watchUrl, playlistUrl, isVideoId } = require('../youtube');

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.86-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2.2c-2.7 0-3 0-4 .1-3.6.2-5.6 2.2-5.8 5.8-.1 1-.1 1.3-.1 4s0 3 .1 4c.2 3.6 2.2 5.6 5.8 5.8 1 .1 1.3.1 4 .1s3 0 4-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1 .1-1.3.1-4s0-3-.1-4c-.2-3.6-2.2-5.6-5.8-5.8-1-.1-1.3-.1-4-.1Zm0 1.8c2.6 0 2.9 0 4 .1 2.6.1 3.8 1.4 3.9 3.9.1 1 .1 1.3.1 4s0 2.9-.1 4c-.1 2.5-1.3 3.8-3.9 3.9-1 .1-1.4.1-4 .1s-2.9 0-4-.1c-2.6-.1-3.8-1.4-3.9-3.9-.1-1-.1-1.4-.1-4s0-2.9.1-4C4.2 5.5 5.4 4.2 8 4.1c1-.1 1.4-.1 4-.1Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.2 6.2 0 1 0 5.3 6.2V8.4a7.6 7.6 0 0 0 4.4 1.4V6.5a4.4 4.4 0 0 1-4.4-4.5Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.2 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4l4.3-4.3H4a1 1 0 1 1 0-2h13.5l-4.3-4.3a1 1 0 0 1 0-1.4Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 2v2h8V2h2v2h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V2h2Zm11 8H5v9h14v-9Z"/></svg>',
};
const icon = (name) => raw(ICONS[name] || '');

function img(image, { sizes = '100vw', className = '', loading = 'lazy', priority = false } = {}) {
  if (!image || !image.src) return '';
  const variants = (image.variants && image.variants.length ? image.variants : [{ src: image.src, w: image.w }]);
  const srcset = variants.map((v) => `${v.src} ${v.w}w`).join(', ');
  return html`<img class="${className}" src="${image.src}" srcset="${srcset}" sizes="${sizes}" width="${image.w}" height="${image.h}" alt="${image.alt || ''}" loading="${priority ? 'eager' : loading}" decoding="async"${priority ? raw(' fetchpriority="high"') : ''}>`;
}

function thumb(videoId, { alt = '', sizes = '(min-width: 1100px) 360px, (min-width: 700px) 45vw, 92vw', loading = 'lazy', className = '' } = {}) {
  if (!isVideoId(videoId)) return html`<span class="thumb-fallback ${className}" aria-hidden="true"></span>`;
  const b = `/thumbs/${videoId}`;
  return html`<img class="${className}" src="${b}/640.jpg" srcset="${b}/320.jpg 320w, ${b}/640.jpg 640w, ${b}/1280.jpg 1280w" sizes="${sizes}" width="640" height="360" alt="${alt}" loading="${loading}" decoding="async">`;
}

function badge(kind, text) {
  return html`<span class="badge badge--${kind}">${kind === 'live' ? raw('<span class="badge__dot" aria-hidden="true"></span>') : ''}${text}</span>`;
}

// Player com "fachada": nada do YouTube é carregado até o visitante dar play.
// Sem JavaScript, o link abre o vídeo no YouTube.
function player({ videoId, title, cover = null, embeddable = true, priority = false }) {
  const label = title || 'Vídeo do Office Cast';
  const picture = cover ? img(cover, { sizes: '(min-width: 1100px) 760px, 100vw', className: 'player__img', priority })
    : thumb(videoId, { alt: '', sizes: '(min-width: 1100px) 760px, 100vw', className: 'player__img', loading: priority ? 'eager' : 'lazy' });
  if (!embeddable) {
    return html`<div class="player"><a class="player__facade" href="${watchUrl(videoId)}" target="_blank" rel="noopener">
      ${picture}<span class="player__play" aria-hidden="true">${icon('external')}</span>
      <span class="visually-hidden">Assistir no YouTube: ${label} (abre em nova aba)</span></a></div>`;
  }
  return html`<div class="player"><a class="player__facade" href="${watchUrl(videoId)}" data-yt="${videoId}" data-title="${label}">
    ${picture}<span class="player__play" aria-hidden="true">${icon('play')}</span>
    <span class="visually-hidden">Reproduzir: ${label}</span></a></div>`;
}

function episodeMeta(ep, c, { showSeries = true } = {}) {
  const s = showSeries && ep.series ? (c.series || []).find((x) => x.slug === ep.series && x.published) : null;
  const bits = [];
  if (s) bits.push(`${s.name}${ep.label ? ` ${ep.label}` : ''}`);
  else if (ep.label) bits.push(ep.label);
  if (ep.status === 'agendado') bits.push(ep.date ? `${t.formatDate(ep.date)}, ${t.formatTime(ep.date)}` : 'Data a confirmar');
  else if (ep.date) bits.push(t.formatDate(ep.date));
  if (ep.status === 'disponivel' && ep.durationSec) bits.push(t.formatDuration(ep.durationSec));
  return bits.join(' · ');
}

function episodeCard(ep, c, { showSeries = true, headingLevel = 3, now = new Date() } = {}) {
  const H = `h${headingLevel}`;
  const scheduled = ep.status === 'agendado';
  const pastScheduled = scheduled && (!ep.date || new Date(ep.date) <= now);
  const href = ep.status === 'disponivel' ? `/episodios/${ep.id}` : (scheduled ? watchUrl(ep.videoId) : null);
  const meta = episodeMeta(ep, c, { showSeries });
  const status = scheduled
    ? badge('scheduled', pastScheduled ? 'Aguardando publicação' : 'Agendado')
    : ep.status === 'indisponivel' ? badge('muted', 'Indisponível') : '';
  const inner = html`
    <div class="card__media">${thumb(ep.videoId, { alt: '' })}${status ? html`<span class="card__badge">${status}</span>` : ''}</div>
    <div class="card__body">
      ${raw(`<${H} class="card__title">`)}${ep.title}${raw(`</${H}>`)}
      ${meta ? html`<p class="card__meta">${meta}</p>` : ''}
      ${scheduled && href ? html`<p class="card__hint">Lembrete no YouTube ${icon('external')}</p>` : ''}
    </div>`;
  if (!href) return html`<article class="card card--episode card--disabled">${inner}</article>`;
  const ext = scheduled ? html` target="_blank" rel="noopener"` : '';
  return html`<article class="card card--episode"><a class="card__link" href="${href}"${ext}>${inner}</a></article>`;
}

function seriesCard(s, c, { headingLevel = 3, now = new Date() } = {}) {
  const H = `h${headingLevel}`;
  const sum = seriesSummary(c, s, now);
  let status = '';
  if (sum.next) status = `Próximo episódio: ${t.formatDate(sum.next.date)}`;
  else if (sum.available) status = `${sum.available} episódio${sum.available > 1 ? 's' : ''} disponíve${sum.available > 1 ? 'is' : 'l'}`;
  return html`<article class="card card--series"><a class="card__link" href="/series/${s.slug}">
    <div class="card__media card__media--series">${s.cover ? img(s.cover, { sizes: '(min-width: 1100px) 360px, (min-width: 700px) 45vw, 92vw' })
      : html`<span class="series-art" aria-hidden="true"><span class="series-art__eyebrow">Série</span><span class="series-art__name">${s.name}</span>${s.tagline ? html`<span class="series-art__tag">${s.tagline}</span>` : ''}</span>`}</div>
    <div class="card__body">
      ${raw(`<${H} class="card__title">`)}${s.name}${raw(`</${H}>`)}
      ${s.tagline ? html`<p class="card__text">${s.tagline}</p>` : ''}
      ${status ? html`<p class="card__meta">${status}</p>` : ''}
    </div></a></article>`;
}

function topicList(topics) {
  const items = (topics || []).filter((k) => TOPICS[k]);
  if (!items.length) return '';
  return html`<ul class="chips" aria-label="Temas">${items.map((k) => html`<li><a class="chip" href="/assista?tema=${k}">${TOPICS[k]}</a></li>`)}</ul>`;
}

function sectionHead({ eyebrow = '', title, intro = '', id = '', level = 2 }) {
  const H = `h${level}`;
  return html`<header class="section__head">
    ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
    ${raw(`<${H} class="section__title"${id ? ` id="${id}"` : ''}>`)}${title}${raw(`</${H}>`)}
    ${intro ? html`<p class="section__intro">${intro}</p>` : ''}
  </header>`;
}

function socialLinks(items) {
  const list = items.filter((i) => i.url);
  if (!list.length) return '';
  return html`<ul class="social">${list.map((i) => html`<li><a href="${i.url}" target="_blank" rel="noopener" class="social__link">${icon(i.icon)}<span>${i.label}</span><span class="visually-hidden"> (abre em nova aba)</span></a></li>`)}</ul>`;
}

module.exports = { icon, img, thumb, badge, player, episodeCard, episodeMeta, seriesCard, topicList, sectionHead, socialLinks, watchUrl, playlistUrl };
