'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { html, raw } = require('./html');

// "?v=" com a data de alteração do arquivo: o navegador busca a versão nova sempre que o CSS/JS mudar
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
function asset(rel) {
  try { return `/static/${rel}?v=${Math.floor(fs.statSync(path.join(PUBLIC_DIR, rel)).mtimeMs).toString(36)}`; } catch { return `/static/${rel}`; }
}
const { icon, socialLinks } = require('./components');

const NAV = [
  { href: '/', label: 'Início', key: 'inicio' },
  { href: '/apresentadores', label: 'Apresentadores', key: 'apresentadores' },
  { href: '/assista', label: 'Assista', key: 'assista' },
  { href: '/series', label: 'Séries', key: 'series' },
  { href: '/loja', label: 'Loja', key: 'loja' },
  { href: '/contato', label: 'Contato', key: 'contato' },
];

function layout({ c, config, title, description, path = '/', nav = '', body, ogImage = '/static/img/compartilhamento.jpg', ogType = 'website', headerOverlay = false, preloadImages = [], preloadSizes = '' }) {
  const site = c.site || {};
  const fullTitle = title ? `${title} | ${site.name || 'Office Cast'}` : `${site.name || 'Office Cast'} | Conversas para amadurecer, fortalecer a fé e viver com propósito`;
  const desc = description || site.description || '';
  const base = config.publicBaseUrl;
  const canonical = base ? base + path : '';
  const og = base ? base + ogImage : ogImage;
  const year = new Date().getFullYear();
  return html`<!doctype html>
<html lang="pt-BR" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
${base ? '' : raw('<meta name="robots" content="noindex, nofollow">')}
<meta property="og:site_name" content="${site.name || 'Office Cast'}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${og}">
${canonical ? html`<meta property="og:url" content="${canonical}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b1a2b">
<link rel="icon" href="/static/img/marca/icone-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/static/img/marca/icone-180.png">
<link rel="preload" href="/static/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
${preloadImages.map((im) => html`<link rel="preload" as="image" href="${im.src}" imagesrcset="${(im.variants || []).map((v) => `${v.src} ${v.w}w`).join(', ')}" imagesizes="${preloadSizes}" fetchpriority="high">`)}
<link rel="stylesheet" href="${asset('css/site.css')}">
<script src="${asset('js/site.js')}" defer></script>
</head>
<body>
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header${headerOverlay ? ' site-header--overlay' : ''}">
  <div class="container site-header__inner">
    <a class="brand" href="/" aria-label="Office Cast, página inicial">
      <img src="/static/img/marca/office-cast-logo.png" width="360" height="219" alt="Office Cast">
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu-principal">
      <span class="menu-toggle__bars" aria-hidden="true"></span><span class="menu-toggle__label">Menu</span>
    </button>
    <nav class="site-nav" id="menu-principal" aria-label="Menu principal">
      <ul>${NAV.map((n) => html`<li><a href="${n.href}"${n.key === nav ? raw(' aria-current="page"') : ''}>${n.label}</a></li>`)}</ul>
    </nav>
  </div>
</header>
<main id="conteudo" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="container site-footer__grid">
    <div class="site-footer__brand">
      <img src="/static/img/marca/office-cast-logo.png" width="360" height="219" alt="Office Cast" loading="lazy">
      <p>${site.slogan || ''}</p>
    </div>
    <nav aria-label="Rodapé" class="site-footer__nav">
      <ul>${NAV.map((n) => html`<li><a href="${n.href}">${n.label}</a></li>`)}<li><a href="/privacidade">Privacidade</a></li></ul>
    </nav>
    <div class="site-footer__social">
      <p class="site-footer__label">Acompanhe</p>
      ${socialLinks([
        { url: site.youtube, icon: 'youtube', label: 'YouTube' },
        { url: site.instagram, icon: 'instagram', label: 'Instagram' },
        { url: site.instagramCortes, icon: 'instagram', label: 'Cortes no Instagram' },
      ])}
    </div>
  </div>
  <div class="container site-footer__bottom">
    <p>© ${year} Office Cast</p>
    ${(site.credits || []).length ? html`<p class="credits"><span class="credits__label">Produção:<img class="credits__logo" src="/static/img/marca/moovi-estudio.png" width="240" height="66" alt="" loading="lazy" decoding="async"></span><span>${(site.credits || []).map((cr, i) => html`${i ? ' · ' : ''}<a href="${cr.url}" target="_blank" rel="noopener">${cr.label}</a>`)}</span></p>` : ''}
  </div>
</footer>
</body>
</html>`;
}

module.exports = { layout, NAV, icon, asset };
