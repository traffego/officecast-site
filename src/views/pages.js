'use strict';
const { html, raw } = require('./html');
const { layout } = require('./layout');
const C = require('./components');
const t = require('../time');
const D = require('../domain');
const { watchUrl, playlistUrl } = require('../youtube');

const { icon, img, player, episodeCard, seriesCard, sectionHead, topicList, socialLinks, badge } = C;

// largura exibida de cada foto da abertura: ~31vw lado a lado (computador), até 340px empilhada (celular)
const HERO_SIZES = '(min-width: 1024px) min(31vw, 540px), (orientation: landscape) and (max-height: 600px) 26vw, min(58vw, 340px)';

// ---------- blocos reutilizáveis ----------

function liveHeading(v) {
  switch (v.kind) {
    case 'live': return 'Ao vivo agora';
    case 'scheduled': return v.future ? 'Próxima transmissão' : 'Transmissão agendada';
    case 'recent': return 'Transmissão recente';
    default: return 'Última transmissão';
  }
}

function liveInfoLine(v) {
  if (v.kind === 'scheduled') {
    if (v.future && v.scheduledAt) return `${t.formatWeekday(v.scheduledAt)}, às ${t.formatTime(v.scheduledAt)} (horário de Brasília)`;
    return 'Aguardando o início da transmissão no YouTube.';
  }
  if (v.kind === 'live') return 'Transmissão acontecendo agora no YouTube.';
  if (v.scheduledAt) return `Transmitido em ${t.formatLongDate(v.scheduledAt)}`;
  return '';
}

// Bloco da transmissão em destaque (página inicial e Assista).
function featuredBlock(c, now, { headingLevel = 2, fallbackToLatest = true, id = 'destaque' } = {}) {
  const v = D.liveView(c.live, now);
  let item = null;
  let heading = '';
  let line = '';
  let badgeEl = '';
  if (v.kind !== 'empty') {
    item = v;
    heading = liveHeading(v);
    line = liveInfoLine(v);
    badgeEl = badge(v.kind === 'live' ? 'live' : v.kind === 'scheduled' ? 'scheduled' : 'replay', v.badge);
  } else if (fallbackToLatest) {
    const latest = D.availableEpisodes(c)[0];
    if (latest) {
      item = { videoId: latest.videoId, title: latest.title, description: latest.summary, embeddable: latest.embeddable !== false, cover: null };
      heading = 'Episódio mais recente';
      line = latest.date ? `Publicado em ${t.formatLongDate(latest.date)}` : '';
      badgeEl = badge('replay', 'Disponível');
    }
  }
  const upcoming = D.upcomingEpisodes(c, now).filter((e) => !item || e.videoId !== item.videoId).slice(0, 3);
  const H = `h${headingLevel}`;
  const Hs = `h${headingLevel + 1}`;
  if (!item) {
    return html`<section class="section section--dark" id="${id}" aria-labelledby="${id}-titulo">
      <div class="container">
        ${raw(`<${H} class="section__title" id="${id}-titulo">`)}Transmissão${raw(`</${H}>`)}
        <div class="empty-state">
          <p class="empty-state__title">Nenhuma transmissão em destaque no momento.</p>
          <p>Acompanhe o canal no YouTube para ver as próximas conversas.</p>
          <a class="btn btn--ghost" href="${c.site.youtube}" target="_blank" rel="noopener">${icon('youtube')} Abrir o canal no YouTube</a>
        </div>
      </div></section>`;
  }
  return html`<section class="section section--dark featured" id="${id}" aria-labelledby="${id}-titulo">
    <div class="container">
      ${raw(`<${H} class="section__title" id="${id}-titulo">`)}${heading}${raw(`</${H}>`)}
      <div class="featured__grid">
        ${player({ videoId: item.videoId, title: item.title, cover: item.cover, embeddable: item.embeddable })}
        <div class="featured__info">
          ${badgeEl}
          ${raw(`<${Hs} class="featured__title">`)}${item.title}${raw(`</${Hs}>`)}
          ${line ? html`<p class="featured__when">${icon('calendar')} ${line}</p>` : ''}
          ${item.description ? html`<p class="featured__desc">${item.description}</p>` : ''}
          <a class="text-link" href="${watchUrl(item.videoId)}" target="_blank" rel="noopener">Abrir no YouTube ${icon('external')}<span class="visually-hidden"> (abre em nova aba)</span></a>
        </div>
      </div>
      ${upcoming.length ? html`<div class="upcoming">
        ${raw(`<${Hs} class="upcoming__title">`)}Próximas transmissões agendadas${raw(`</${Hs}>`)}
        <ul class="upcoming__list">${upcoming.map((e) => {
          const s = e.series ? D.findSeries(c, e.series) : null;
          const prefix = s ? `${s.name}${e.label ? ` ${e.label}` : ''} · ` : '';
          return html`<li>
          <a href="${watchUrl(e.videoId)}" target="_blank" rel="noopener">
            <span class="upcoming__date">${t.formatDate(e.date)} · ${t.formatTime(e.date)}</span>
            <span class="upcoming__name">${prefix}${e.title}</span>
            <span class="visually-hidden"> (lembrete no YouTube, abre em nova aba)</span>
          </a></li>`;
        })}</ul>
        <p class="upcoming__note">Horários de Brasília, conforme agendado no YouTube.</p>
      </div>` : ''}
    </div></section>`;
}

function metricsBlock(c) {
  const m = c.metrics || {};
  const items = (m.items || []).filter((i) => i.value && i.label);
  if (!m.enabled || !items.length) return '';
  return html`<section class="proof" aria-label="Audiência no YouTube">
    <div class="container proof__inner">
      <ul class="proof__list">${items.map((i) => html`<li><strong>${i.value}</strong> ${i.label}</li>`)}</ul>
      ${m.reference ? html`<p class="proof__ref">${m.reference}</p>` : ''}
    </div></section>`;
}

function pathCards(paths, level = 3) {
  const H = `h${level}`;
  return html`<ul class="paths">${paths.map((p) => html`<li><a class="path-card" href="/para-voce/${p.slug}">
    ${raw(`<${H} class="path-card__title">`)}${p.title}${raw(`</${H}>`)}
    ${p.lead ? html`<p class="path-card__lead">${p.lead}</p>` : ''}
    <span class="path-card__meta">${p.items.length} episódio${p.items.length > 1 ? 's' : ''} ${icon('arrow')}</span>
  </a></li>`)}</ul>`;
}

function hostCard(h, level = 3) {
  const H = `h${level}`;
  return html`<article class="host-card">
    <a class="host-card__link" href="/apresentadores/${h.slug}">
      <div class="host-card__media">${img(h.photo, { sizes: '(min-width: 900px) 40vw, 92vw', className: 'host-card__img' })}</div>
      <div class="host-card__body">
        ${raw(`<${H} class="host-card__name">`)}${h.name}${raw(`</${H}>`)}
        ${h.role ? html`<p class="host-card__role">${h.role}</p>` : ''}
        ${h.summary ? html`<p class="host-card__summary">${h.summary}</p>` : ''}
        <span class="text-link">Conhecer ${h.name} ${icon('arrow')}</span>
      </div>
    </a></article>`;
}

function shopTeaser(c) {
  const s = c.shop || {};
  return html`<section class="section section--light shop-teaser" aria-labelledby="loja-titulo">
    <div class="container shop-teaser__inner">
      <div>
        <p class="eyebrow eyebrow--dark">Em breve</p>
        <h2 class="section__title" id="loja-titulo">${s.title || 'Loja Office Cast'}</h2>
        <p class="section__intro">${s.intro || ''}</p>
        <a class="btn btn--dark" href="/loja${s.waitlistEnabled ? '#aviso' : ''}">${s.waitlistEnabled ? 'Quero ser avisado' : 'Conhecer a loja'}</a>
      </div>
      <ul class="shop-cats">${(s.categories || []).map((cat) => html`<li><span class="shop-cats__name">${cat.name}</span></li>`)}</ul>
    </div></section>`;
}

function page(ctx, opts) { return layout({ c: ctx.c, config: ctx.config, ...opts }).toString(); }

// ---------- páginas ----------

function home(ctx) {
  const { c, now } = ctx;
  const h = c.home || {};
  const hosts = c.hosts || [];
  const paths = h.showPaths ? D.visiblePaths(c) : [];
  const featured = (h.featuredSeries || []).map((slug) => D.findSeries(c, slug)).filter(Boolean);
  const seriesList = featured.length ? featured : D.publishedSeries(c);
  const hasFeature = D.liveView(c.live, now).kind !== 'empty' || D.availableEpisodes(c).length > 0;
  // título em linhas por frase ("Fé para seguir." / "Sabedoria para viver.")
  const titleLines = String(h.heroTitle || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const body = html`
  <section class="hero" aria-labelledby="hero-titulo">
    <div class="hero__media">${hosts.slice(0, 2).map((p, i) => html`<figure class="hero__person hero__person--${i === 0 ? 'a' : 'b'}">
        ${img(p.heroPhoto || p.photo, { sizes: HERO_SIZES, className: 'hero__img', priority: true })}
        <figcaption class="hero__caption"><a href="/apresentadores/${p.slug}">${p.name}</a></figcaption>
      </figure>`)}</div>
    <div class="hero__shade" aria-hidden="true"></div>
    <div class="container hero__content">
      <div class="hero__text">
        ${h.heroEyebrow ? html`<p class="eyebrow">${h.heroEyebrow}</p>` : ''}
        <h1 class="hero__title" id="hero-titulo">${titleLines.map((l) => html`<span class="hero__line">${l}</span>`)}</h1>
        ${h.heroText ? html`<p class="hero__lead">${h.heroText}</p>` : ''}
        <div class="hero__actions">
          <a class="btn btn--primary btn--large" href="${hasFeature ? '#destaque' : '/assista'}">${icon('play')} ${h.heroCta || 'Assistir ao Office Cast'}</a>
          <a class="text-link text-link--light" href="/apresentadores">Conheça os apresentadores</a>
        </div>
      </div>
    </div>
  </section>
  ${featuredBlock(c, now)}
  ${metricsBlock(c)}
  ${paths.length ? html`<section class="section section--light" aria-labelledby="comecar-titulo">
    <div class="container">
      ${sectionHead({ eyebrow: 'Para a sua vida', title: 'Por onde começar', intro: 'Escolha o momento que você está vivendo e encontre conversas sobre ele.', id: 'comecar-titulo' })}
      ${pathCards(paths)}
    </div></section>` : ''}
  <section class="section section--navy" aria-labelledby="apresentadores-titulo">
    <div class="container">
      ${sectionHead({ eyebrow: 'Quem conduz as conversas', title: 'Apresentadores', id: 'apresentadores-titulo' })}
      <div class="hosts-grid">${hosts.map((p) => hostCard(p))}</div>
    </div></section>
  ${seriesList.length ? html`<section class="section section--light" aria-labelledby="series-titulo">
    <div class="container">
      ${sectionHead({ eyebrow: 'Temporadas temáticas', title: 'Séries', intro: 'Sequências de episódios sobre um mesmo tema, para assistir na ordem.', id: 'series-titulo' })}
      <div class="grid grid--3">${seriesList.map((s) => seriesCard(s, c, { now }))}</div>
      <p class="section__more"><a class="btn btn--dark" href="/series">Ver todas as séries</a></p>
    </div></section>` : ''}
  ${h.showShop ? shopTeaser(c) : ''}
  <section class="section section--navy contact-teaser" aria-labelledby="contato-titulo">
    <div class="container contact-teaser__inner">
      <div>
        <h2 class="section__title" id="contato-titulo">Convites, parcerias e contato</h2>
        <p class="section__intro">Quer convidar Ivan Lucas ou Victor Alves, propor uma parceria ou falar com a equipe do Office Cast?</p>
      </div>
      <a class="btn btn--primary" href="/contato">Fale com o Office Cast</a>
    </div></section>`;
  // a foto principal é baixada com prioridade (antes do CSS terminar de carregar)
  const preload = hosts.slice(0, 2).map((p) => p.heroPhoto || p.photo).filter(Boolean);
  return page(ctx, { title: '', path: '/', nav: 'inicio', body, headerOverlay: true, preloadImages: preload, preloadSizes: HERO_SIZES });
}

function hostsIndex(ctx) {
  const { c } = ctx;
  const hosts = c.hosts || [];
  const body = html`
  <section class="page-hero"><div class="container">
    <p class="eyebrow">Office Cast</p>
    <h1 class="page-hero__title">Apresentadores</h1>
    <p class="page-hero__lead">O Office Cast é apresentado por ${hosts.map((h, i) => html`${i ? (i === hosts.length - 1 ? ' e ' : ', ') : ''}${h.name}`)}. Conheça a trajetória de cada um.</p>
  </div></section>
  <section class="section section--light"><div class="container">
    <div class="hosts-grid hosts-grid--light">${hosts.map((p) => hostCard(p, 2))}</div>
  </div></section>`;
  return page(ctx, { title: 'Apresentadores', description: `Conheça ${hosts.map((h) => h.name).join(' e ')}, apresentadores do Office Cast.`, path: '/apresentadores', nav: 'apresentadores', body });
}

function hostPage(ctx, h) {
  const { c, now } = ctx;
  const others = (c.hosts || []).filter((x) => x.slug !== h.slug);
  const featured = (h.featured || []).map((v) => D.episodeByVideo(c, v)).filter((e) => e && e.status === 'disponivel');
  const subject = `convite-${h.slug}`;
  const body = html`
  <section class="host-hero"><div class="container host-hero__grid">
    <div class="host-hero__media">${img(h.photo, { sizes: '(min-width: 900px) 40vw, 92vw', className: 'host-hero__img', priority: true })}</div>
    <div class="host-hero__text">
      <p class="eyebrow"><a href="/apresentadores">Apresentadores</a></p>
      <h1 class="page-hero__title">${h.name}</h1>
      ${h.role ? html`<p class="host-hero__role">${h.role}</p>` : ''}
      <div class="prose prose--light">${(h.bio || []).map((p) => html`<p>${p}</p>`)}</div>
      ${h.highlight ? html`<p class="host-hero__highlight">${h.highlight}</p>` : ''}
      ${socialLinks([
        { url: h.instagram, icon: 'instagram', label: 'Instagram' },
        { url: h.tiktok, icon: 'tiktok', label: 'TikTok' },
        { url: h.kwai, icon: 'external', label: 'Kwai' },
      ])}
    </div>
  </div></section>
  <section class="section section--light"><div class="container host-details">
    ${(h.topics || []).length ? html`<div><h2 class="h3">Temas</h2><ul class="list-check">${h.topics.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    ${(h.books || []).length ? html`<div><h2 class="h3">Livros</h2><ul class="list-check">${h.books.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    <div><h2 class="h3">Convites</h2><p>${h.inviteNote || 'Use o formulário de contato.'}</p>
      ${c.site.contactEnabled ? html`<a class="btn btn--dark" href="/contato?assunto=${subject}">Enviar convite</a>` : ''}</div>
  </div></section>
  ${featured.length ? html`<section class="section section--light section--tight"><div class="container">
    ${sectionHead({ title: 'Conteúdos selecionados' })}
    <div class="grid grid--3">${featured.map((e) => episodeCard(e, c, { now }))}</div>
  </div></section>` : ''}
  ${(h.gallery || []).length ? html`<section class="section section--light section--tight" aria-label="Fotos de ${h.name}"><div class="container">
    <ul class="gallery">${h.gallery.map((g) => html`<li>${img(g, { sizes: '(min-width: 900px) 30vw, 46vw', className: 'gallery__img' })}</li>`)}</ul>
  </div></section>` : ''}
  ${others.length ? html`<section class="section section--navy section--tight"><div class="container other-host">
    ${others.map((o) => html`<p>Conheça também <a class="text-link text-link--light" href="/apresentadores/${o.slug}">${o.name} ${icon('arrow')}</a></p>`)}
  </div></section>` : ''}`;
  return page(ctx, { title: h.name, description: h.summary || `${h.name}, apresentador do Office Cast.`, path: `/apresentadores/${h.slug}`, nav: 'apresentadores', body, ogImage: h.photo ? h.photo.src : undefined, ogType: 'profile' });
}

function watch(ctx, { serie = '', tema = '' } = {}) {
  const { c, now } = ctx;
  const series = D.publishedSeries(c);
  let list = D.availableEpisodes(c);
  const sObj = serie ? D.findSeries(c, serie) : null;
  if (serie === 'avulsos') list = list.filter((e) => !e.series || !D.findSeries(c, e.series));
  else if (sObj) list = list.filter((e) => e.series === sObj.slug);
  if (tema && D.TOPICS[tema]) list = list.filter((e) => (e.topics || []).includes(tema));
  const filtered = Boolean((serie && (sObj || serie === 'avulsos')) || (tema && D.TOPICS[tema]));
  const paths = D.visiblePaths(c);
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <h1 class="page-hero__title">Assista</h1>
    <p class="page-hero__lead">Transmissões e episódios do Office Cast no YouTube, para assistir aqui mesmo.</p>
  </div></section>
  ${featuredBlock(c, now, { fallbackToLatest: false, id: 'transmissao' })}
  <section class="section section--light" aria-labelledby="episodios-titulo"><div class="container">
    ${sectionHead({ title: 'Episódios', id: 'episodios-titulo' })}
    <form class="filters" method="get" action="/assista#episodios-titulo" role="search" aria-label="Filtrar episódios">
      <div class="field field--inline"><label for="f-serie">Série</label>
        <select id="f-serie" name="serie"><option value="">Todas</option>
          ${series.map((s) => html`<option value="${s.slug}"${s.slug === serie ? raw(' selected') : ''}>${s.name}</option>`)}
          <option value="avulsos"${serie === 'avulsos' ? raw(' selected') : ''}>Episódios avulsos</option>
        </select></div>
      <div class="field field--inline"><label for="f-tema">Tema</label>
        <select id="f-tema" name="tema"><option value="">Todos</option>
          ${Object.entries(D.TOPICS).map(([k, v]) => html`<option value="${k}"${k === tema ? raw(' selected') : ''}>${v}</option>`)}
        </select></div>
      <button class="btn btn--dark btn--small" type="submit">Filtrar</button>
      ${filtered ? html`<a class="text-link" href="/assista#episodios-titulo">Limpar filtros</a>` : ''}
    </form>
    <p class="results-count" role="status">${list.length} episódio${list.length === 1 ? '' : 's'}${filtered ? ' encontrados' : ''}</p>
    ${list.length ? html`<div class="grid grid--3">${list.map((e) => episodeCard(e, c, { now }))}</div>`
      : html`<div class="empty-state empty-state--light"><p class="empty-state__title">Nenhum episódio encontrado com esses filtros.</p><a class="text-link" href="/assista#episodios-titulo">Ver todos os episódios</a></div>`}
    <p class="section__more"><a class="text-link" href="${c.site.youtube}" target="_blank" rel="noopener">Todos os vídeos no canal do YouTube ${icon('external')}</a></p>
  </div></section>
  ${paths.length ? html`<section class="section section--navy section--tight" aria-labelledby="caminhos-titulo"><div class="container">
    ${sectionHead({ title: 'Por onde começar', id: 'caminhos-titulo' })}
    ${pathCards(paths)}
  </div></section>` : ''}`;
  return page(ctx, { title: 'Assista', description: 'Assista às transmissões e aos episódios do Office Cast.', path: '/assista', nav: 'assista', body });
}

function episodePage(ctx, ep) {
  const { c, now } = ctx;
  const s = ep.series ? D.findSeries(c, ep.series) : null;
  const siblings = s ? D.seriesEpisodes(c, s.slug) : [];
  const idx = siblings.findIndex((e) => e.id === ep.id);
  const prev = idx > 0 ? siblings.slice(0, idx).reverse().find((e) => e.status === 'disponivel') : null;
  const next = idx >= 0 ? siblings.slice(idx + 1).find((e) => e.status === 'disponivel') : null;
  const more = s ? siblings.filter((e) => e.id !== ep.id).slice(0, 6) : D.availableEpisodes(c).filter((e) => e.id !== ep.id && !e.series).slice(0, 3);
  const meta = [];
  if (ep.date) meta.push(t.formatLongDate(ep.date));
  if (ep.durationSec) meta.push(t.formatDuration(ep.durationSec));
  const body = html`
  <section class="section section--dark episode"><div class="container">
    <nav class="breadcrumb" aria-label="Você está em"><a href="/assista">Assista</a>${s ? html` / <a href="/series/${s.slug}">${s.name}</a>` : ''}</nav>
    <div class="episode__grid">
      ${player({ videoId: ep.videoId, title: ep.title, embeddable: ep.embeddable !== false, priority: true })}
      <div class="episode__info">
        ${s ? html`<p class="eyebrow">Série ${s.name}${ep.label ? ` · ${ep.label}` : ''}</p>` : ''}
        <h1 class="episode__title">${ep.title}</h1>
        ${meta.length ? html`<p class="featured__when">${meta.join(' · ')}</p>` : ''}
        ${ep.summary ? html`<p class="featured__desc">${ep.summary}</p>` : ''}
        ${topicList(ep.topics)}
        <a class="text-link" href="${watchUrl(ep.videoId)}" target="_blank" rel="noopener">Assistir no YouTube ${icon('external')}<span class="visually-hidden"> (abre em nova aba)</span></a>
      </div>
    </div>
    ${prev || next ? html`<nav class="pager" aria-label="Episódios da série">
      ${prev ? html`<a class="pager__prev" href="/episodios/${prev.id}"><span>Anterior</span>${prev.title}</a>` : raw('<span></span>')}
      ${next ? html`<a class="pager__next" href="/episodios/${next.id}"><span>Próximo</span>${next.title}</a>` : ''}
    </nav>` : ''}
  </div></section>
  ${more.length ? html`<section class="section section--light section--tight"><div class="container">
    ${sectionHead({ title: s ? `Mais da série ${s.name}` : 'Outros episódios' })}
    <div class="grid grid--3">${more.map((e) => episodeCard(e, c, { now, showSeries: !s }))}</div>
  </div></section>` : ''}`;
  return page(ctx, { title: ep.title, description: ep.summary || `Episódio do Office Cast: ${ep.title}`, path: `/episodios/${ep.id}`, nav: 'assista', body, ogImage: `/thumbs/${ep.videoId}/1280.jpg`, ogType: 'video.episode' });
}

function seriesIndex(ctx) {
  const { c, now } = ctx;
  const list = D.publishedSeries(c);
  const pls = (c.playlists || []).filter((p) => p.playlistId);
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <h1 class="page-hero__title">Séries</h1>
    <p class="page-hero__lead">Sequências de conversas sobre um mesmo tema, para assistir na ordem.</p>
  </div></section>
  <section class="section section--light"><div class="container">
    ${list.length ? html`<div class="grid grid--3">${list.map((s) => seriesCard(s, c, { now, headingLevel: 2 }))}</div>`
      : html`<div class="empty-state empty-state--light"><p class="empty-state__title">As séries serão publicadas em breve.</p></div>`}
  </div></section>
  ${pls.length ? html`<section class="section section--navy section--tight" aria-labelledby="playlists-titulo"><div class="container">
    ${sectionHead({ title: 'Mais séries e playlists no YouTube', id: 'playlists-titulo', intro: 'Outras temporadas do Office Cast, disponíveis no canal.' })}
    <ul class="link-list">${pls.map((p) => html`<li><a href="${playlistUrl(p.playlistId)}" target="_blank" rel="noopener">${p.title} ${icon('external')}<span class="visually-hidden"> (abre no YouTube, em nova aba)</span></a></li>`)}</ul>
  </div></section>` : ''}`;
  return page(ctx, { title: 'Séries', description: 'Séries do Office Cast: Sabedoria, Renovo, Forja, Amanhecer, Raízes e outras temporadas.', path: '/series', nav: 'series', body });
}

function seriesPage(ctx, s) {
  const { c, now } = ctx;
  const eps = D.seriesEpisodes(c, s.slug);
  const body = html`
  <section class="series-hero"><div class="container series-hero__grid">
    <div class="series-hero__media">${s.cover ? img(s.cover, { sizes: '(min-width: 900px) 50vw, 92vw', priority: true })
      : html`<span class="series-art series-art--large" aria-hidden="true"><span class="series-art__eyebrow">Série</span><span class="series-art__name">${s.name}</span>${s.tagline ? html`<span class="series-art__tag">${s.tagline}</span>` : ''}</span>`}</div>
    <div>
      <p class="eyebrow"><a href="/series">Séries</a></p>
      <h1 class="page-hero__title">${s.name}</h1>
      ${s.tagline ? html`<p class="series-hero__tagline">${s.tagline}</p>` : ''}
      ${s.description ? html`<p class="page-hero__lead">${s.description}</p>` : ''}
      ${s.playlistId ? html`<a class="text-link text-link--light" href="${playlistUrl(s.playlistId)}" target="_blank" rel="noopener">Playlist no YouTube ${icon('external')}<span class="visually-hidden"> (abre em nova aba)</span></a>` : ''}
    </div>
  </div></section>
  <section class="section section--light" aria-labelledby="lista-titulo"><div class="container">
    ${sectionHead({ title: 'Episódios', id: 'lista-titulo' })}
    ${eps.length ? html`<ol class="ep-list">${eps.map((e) => {
      const scheduled = e.status === 'agendado';
      const past = scheduled && (!e.date || new Date(e.date) <= now);
      const st = e.status === 'disponivel' ? badge('replay', 'Disponível') : scheduled ? badge('scheduled', past ? 'Aguardando publicação' : 'Agendado') : badge('muted', 'Indisponível');
      const when = scheduled ? (past ? '' : `${t.formatWeekday(e.date)}, ${t.formatTime(e.date)}`) : (e.date ? t.formatDate(e.date) : '');
      const dur = e.status === 'disponivel' && e.durationSec ? t.formatDuration(e.durationSec) : '';
      const inner = html`<span class="ep-list__label">${e.label || ''}</span>
        <span class="ep-list__main"><span class="ep-list__title">${e.title}</span>
        <span class="ep-list__meta">${st}${when ? html` <span>${when}</span>` : ''}${dur ? html` <span>${dur}</span>` : ''}${scheduled && !past ? html` <span class="ep-list__hint">Lembrete no YouTube ${icon('external')}</span>` : ''}</span></span>`;
      if (e.status === 'disponivel') return html`<li><a class="ep-list__item" href="/episodios/${e.id}">${inner}</a></li>`;
      if (scheduled) return html`<li><a class="ep-list__item" href="${watchUrl(e.videoId)}" target="_blank" rel="noopener">${inner}<span class="visually-hidden"> (abre no YouTube)</span></a></li>`;
      return html`<li><div class="ep-list__item ep-list__item--muted">${inner}</div></li>`;
    })}</ol>` : html`<div class="empty-state empty-state--light"><p class="empty-state__title">Os episódios desta série ainda não foram cadastrados.</p>${s.playlistId ? html`<a class="text-link" href="${playlistUrl(s.playlistId)}" target="_blank" rel="noopener">Ver a playlist no YouTube</a>` : ''}</div>`}
  </div></section>`;
  return page(ctx, { title: `Série ${s.name}`, description: s.description || s.tagline || `Série ${s.name} do Office Cast.`, path: `/series/${s.slug}`, nav: 'series', body, ogImage: s.cover ? s.cover.src : undefined });
}

function pathsIndex(ctx) {
  const { c } = ctx;
  const paths = D.visiblePaths(c);
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <h1 class="page-hero__title">Por onde começar</h1>
    <p class="page-hero__lead">Seleções de episódios para diferentes momentos da vida.</p>
  </div></section>
  <section class="section section--light"><div class="container">
    ${paths.length ? pathCards(paths, 2) : html`<div class="empty-state empty-state--light"><p class="empty-state__title">As seleções estão sendo preparadas.</p><a class="text-link" href="/assista">Ver todos os episódios</a></div>`}
  </div></section>`;
  return page(ctx, { title: 'Por onde começar', path: '/para-voce', nav: 'assista', body });
}

function pathPage(ctx, p) {
  const { c, now } = ctx;
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <p class="eyebrow"><a href="/para-voce">Por onde começar</a></p>
    <h1 class="page-hero__title">${p.title}</h1>
    ${p.lead ? html`<p class="page-hero__lead">${p.lead}</p>` : ''}
  </div></section>
  <section class="section section--light"><div class="container">
    <div class="grid grid--3">${p.items.map((e) => episodeCard(e, c, { now, headingLevel: 2 }))}</div>
    <p class="section__more"><a class="text-link" href="/para-voce">Outras seleções</a></p>
  </div></section>`;
  return page(ctx, { title: p.title, description: p.lead || '', path: `/para-voce/${p.slug}`, nav: 'assista', body });
}

function formField({ id, label, name, type = 'text', value = '', error = '', required = false, autocomplete = '', help = '', attrs = '' }) {
  const desc = [help ? `${id}-ajuda` : '', error ? `${id}-erro` : ''].filter(Boolean).join(' ');
  const control = type === 'textarea'
    ? html`<textarea id="${id}" name="${name}" rows="6"${required ? raw(' required') : ''}${desc ? raw(` aria-describedby="${desc}"`) : ''}${error ? raw(' aria-invalid="true"') : ''}${raw(attrs)}>${value}</textarea>`
    : html`<input id="${id}" name="${name}" type="${type}" value="${value}"${autocomplete ? raw(` autocomplete="${autocomplete}"`) : ''}${required ? raw(' required') : ''}${desc ? raw(` aria-describedby="${desc}"`) : ''}${error ? raw(' aria-invalid="true"') : ''}${raw(attrs)}>`;
  return html`<div class="field${error ? ' field--error' : ''}">
    <label for="${id}">${label}${required ? html` <span class="req" aria-hidden="true">*</span>` : html` <span class="opt">(opcional)</span>`}</label>
    ${control}
    ${help ? html`<p class="field__help" id="${id}-ajuda">${help}</p>` : ''}
    ${error ? html`<p class="field__error" id="${id}-erro">${error}</p>` : ''}
  </div>`;
}

const CONTACT_SUBJECTS = {
  'convite-office-cast': 'Convite para o Office Cast',
  'convite-ivan-lucas': 'Convite para Ivan Lucas',
  'convite-victor-alves': 'Convite para Victor Alves',
  parceria: 'Parceria',
  imprensa: 'Imprensa',
  outro: 'Outro assunto',
};

function contact(ctx, { values = {}, errors = {}, sent = false, failed = '' } = {}) {
  const { c } = ctx;
  const site = c.site || {};
  const hasErrors = Object.keys(errors).length > 0;
  const form = site.contactEnabled ? (sent
    ? html`<div class="notice notice--success" role="status" tabindex="-1" id="resultado">
        <p class="notice__title">Mensagem registrada.</p>
        <p>Sua mensagem foi salva e ficará disponível para a equipe do Office Cast no painel do site.</p>
        <a class="text-link" href="/">Voltar ao início</a></div>`
    : html`<form class="form" method="post" action="/contato" novalidate>
        ${hasErrors ? html`<div class="notice notice--error" role="alert" tabindex="-1" id="resultado"><p class="notice__title">Revise os campos destacados.</p></div>` : ''}
        ${failed ? html`<div class="notice notice--error" role="alert"><p>${failed}</p></div>` : ''}
        ${formField({ id: 'c-nome', label: 'Nome', name: 'nome', value: values.nome, error: errors.nome, required: true, autocomplete: 'name' })}
        ${formField({ id: 'c-email', label: 'E-mail', name: 'email', type: 'email', value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
        ${formField({ id: 'c-telefone', label: 'Telefone ou WhatsApp', name: 'telefone', type: 'tel', value: values.telefone, error: errors.telefone, autocomplete: 'tel' })}
        <div class="field${errors.assunto ? ' field--error' : ''}"><label for="c-assunto">Assunto <span class="req" aria-hidden="true">*</span></label>
          <select id="c-assunto" name="assunto" required${errors.assunto ? raw(' aria-invalid="true" aria-describedby="c-assunto-erro"') : ''}>
            <option value="">Selecione</option>
            ${Object.entries(CONTACT_SUBJECTS).map(([k, v]) => html`<option value="${k}"${values.assunto === k ? raw(' selected') : ''}>${v}</option>`)}
          </select>${errors.assunto ? html`<p class="field__error" id="c-assunto-erro">${errors.assunto}</p>` : ''}</div>
        ${formField({ id: 'c-mensagem', label: 'Mensagem', name: 'mensagem', type: 'textarea', value: values.mensagem, error: errors.mensagem, required: true })}
        <div class="field field--hp" aria-hidden="true"><label for="c-site">Não preencha este campo</label><input id="c-site" name="site" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="field field--check${errors.consentimento ? ' field--error' : ''}">
          <input id="c-consent" name="consentimento" type="checkbox" value="on"${values.consentimento ? raw(' checked') : ''}${errors.consentimento ? raw(' aria-invalid="true" aria-describedby="c-consent-erro"') : ''}>
          <label for="c-consent">Concordo que meus dados sejam usados para responder a este contato, conforme a <a href="/privacidade">política de privacidade</a>.</label>
          ${errors.consentimento ? html`<p class="field__error" id="c-consent-erro">${errors.consentimento}</p>` : ''}
        </div>
        <button class="btn btn--dark" type="submit">Enviar mensagem</button>
      </form>`)
    : html`<div class="notice"><p>O formulário de contato está temporariamente desativado. Fale com o Office Cast pelo Instagram.</p></div>`;
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <h1 class="page-hero__title">Contato</h1>
    <p class="page-hero__lead">Convites, parcerias e mensagens para o Office Cast, Ivan Lucas e Victor Alves.</p>
  </div></section>
  <section class="section section--light"><div class="container contact-grid">
    <div>${form}</div>
    <aside class="contact-aside" aria-label="Redes sociais">
      <h2 class="h3">Pelas redes</h2>
      ${socialLinks([
        { url: site.instagram, icon: 'instagram', label: 'Office Cast no Instagram' },
        { url: site.youtube, icon: 'youtube', label: 'Office Cast no YouTube' },
        ...(c.hosts || []).map((h) => ({ url: h.instagram, icon: 'instagram', label: `${h.name} no Instagram` })),
      ])}
      ${site.email ? html`<p>E-mail: <a href="mailto:${site.email}">${site.email}</a></p>` : ''}
      ${site.phone ? html`<p>Telefone: ${site.phone}</p>` : ''}
    </aside>
  </div></section>`;
  return page(ctx, { title: 'Contato', description: 'Fale com o Office Cast: convites, parcerias e mensagens.', path: '/contato', nav: 'contato', body });
}

function shop(ctx, { values = {}, errors = {}, sent = false } = {}) {
  const { c } = ctx;
  const s = c.shop || {};
  const products = (c.products || []).filter((p) => p.status === 'publicado');
  const cats = s.categories || [];
  const hasErrors = Object.keys(errors).length > 0;
  const interests = [].concat(values.interesses || []);
  const waitlist = s.waitlistEnabled ? html`<section class="section section--navy" id="aviso" aria-labelledby="aviso-titulo"><div class="container waitlist">
    <div>
      <h2 class="section__title" id="aviso-titulo">Aviso de lançamento</h2>
      <p class="section__intro">Deixe seu e-mail para saber quando a loja abrir. Não enviamos cobranças nem pedimos dados de pagamento.</p>
    </div>
    ${sent ? html`<div class="notice notice--success" role="status" tabindex="-1" id="resultado"><p class="notice__title">Cadastro registrado.</p><p>Seu e-mail foi salvo na lista de aviso de lançamento da loja.</p></div>`
      : html`<form class="form form--dark" method="post" action="/loja/aviso#aviso" novalidate>
      ${hasErrors ? html`<div class="notice notice--error" role="alert" tabindex="-1" id="resultado"><p class="notice__title">Revise os campos destacados.</p></div>` : ''}
      ${formField({ id: 'w-nome', label: 'Nome', name: 'nome', value: values.nome, error: errors.nome, autocomplete: 'name' })}
      ${formField({ id: 'w-email', label: 'E-mail', name: 'email', type: 'email', value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
      <fieldset class="field"><legend>Tenho interesse em <span class="opt">(opcional)</span></legend>
        <div class="checks">${cats.map((cat) => html`<label class="check"><input type="checkbox" name="interesses" value="${cat.key}"${interests.includes(cat.key) ? raw(' checked') : ''}> ${cat.name}</label>`)}</div>
      </fieldset>
      <div class="field field--hp" aria-hidden="true"><label for="w-site">Não preencha este campo</label><input id="w-site" name="site" type="text" tabindex="-1" autocomplete="off"></div>
      <div class="field field--check${errors.consentimento ? ' field--error' : ''}">
        <input id="w-consent" name="consentimento" type="checkbox" value="on"${values.consentimento ? raw(' checked') : ''}${errors.consentimento ? raw(' aria-invalid="true" aria-describedby="w-consent-erro"') : ''}>
        <label for="w-consent">Concordo em receber o aviso de lançamento da loja, conforme a <a href="/privacidade">política de privacidade</a>.</label>
        ${errors.consentimento ? html`<p class="field__error" id="w-consent-erro">${errors.consentimento}</p>` : ''}
      </div>
      <button class="btn btn--primary" type="submit">Quero ser avisado</button>
    </form>`}
  </div></section>` : '';
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    ${badge('scheduled', 'Em breve')}
    <h1 class="page-hero__title">${s.title || 'Loja Office Cast'}</h1>
    <p class="page-hero__lead">${s.intro || ''}</p>
  </div></section>
  <section class="section section--light" aria-labelledby="categorias-titulo"><div class="container">
    ${sectionHead({ title: 'O que estamos preparando', id: 'categorias-titulo' })}
    <ul class="grid grid--4 cat-grid">${cats.map((cat) => html`<li class="cat-card"><h3 class="cat-card__name">${cat.name}</h3>${cat.text ? html`<p>${cat.text}</p>` : ''}</li>`)}</ul>
    ${products.length ? html`<h2 class="section__title section__title--sub">Vitrine</h2>
      <p class="section__intro">Produtos apresentados para conhecimento. As compras pelo site ainda não estão abertas.</p>
      <div class="grid grid--3">${products.map((p) => html`<article class="card card--product">
        <div class="card__media card__media--square">${p.photos && p.photos[0] ? img(p.photos[0], { sizes: '(min-width: 1100px) 360px, 92vw' }) : html`<span class="thumb-fallback" aria-hidden="true"></span>`}</div>
        <div class="card__body"><h3 class="card__title">${p.name}</h3>${p.description ? html`<p class="card__text">${p.description}</p>` : ''}<p class="card__meta">Em breve</p></div>
      </article>`)}</div>` : ''}
    <p class="shop-note">Ainda não há vendas pelo site: não aceitamos pedidos nem pagamentos nesta página.</p>
  </div></section>
  ${waitlist}`;
  return page(ctx, { title: 'Loja', description: 'Loja Office Cast: em breve, blusas, livros, canecas e coleções.', path: '/loja', nav: 'loja', body });
}

function privacy(ctx) {
  const body = html`
  <section class="page-hero page-hero--compact"><div class="container">
    <h1 class="page-hero__title">Privacidade</h1>
  </div></section>
  <section class="section section--light"><div class="container prose">
    <h2>Quais dados coletamos</h2>
    <p>Coletamos apenas os dados que você envia pelos formulários do site: no contato, nome, e-mail, telefone (opcional), assunto e mensagem; no aviso de lançamento da loja, e-mail, nome (opcional) e interesses.</p>
    <h2>Para que usamos</h2>
    <p>Os dados do contato são usados para responder à sua mensagem. Os dados do aviso de lançamento são usados apenas para informar a abertura da loja. Não vendemos nem compartilhamos esses dados para fins de publicidade.</p>
    <h2>Vídeos do YouTube</h2>
    <p>Os vídeos são exibidos pelo player do YouTube no modo de privacidade aprimorada. O player só é carregado quando você clica para assistir; a partir daí, aplicam-se as políticas do YouTube.</p>
    <h2>Seus direitos</h2>
    <p>Você pode pedir acesso, correção ou exclusão dos seus dados enviando uma mensagem pelo formulário de contato, com o assunto “Outro assunto”.</p>
    <h2>Cookies</h2>
    <p>O site não usa cookies de publicidade ou de análise. Um cookie técnico é usado apenas na área administrativa da equipe.</p>
  </div></section>`;
  return page(ctx, { title: 'Privacidade', path: '/privacidade', body });
}

function notFound(ctx) {
  const body = html`<section class="page-hero"><div class="container">
    <p class="eyebrow">Erro 404</p>
    <h1 class="page-hero__title">Página não encontrada</h1>
    <p class="page-hero__lead">O endereço pode ter mudado ou o conteúdo ainda não foi publicado.</p>
    <a class="btn btn--primary" href="/">Ir para o início</a>
  </div></section>`;
  return page(ctx, { title: 'Página não encontrada', body });
}

function serverError(ctx) {
  const body = html`<section class="page-hero"><div class="container">
    <p class="eyebrow">Erro</p>
    <h1 class="page-hero__title">Algo deu errado</h1>
    <p class="page-hero__lead">Não foi possível carregar esta página agora. Tente novamente em instantes.</p>
    <a class="btn btn--primary" href="/">Ir para o início</a>
  </div></section>`;
  return page(ctx, { title: 'Erro', body });
}

module.exports = {
  home, hostsIndex, hostPage, watch, episodePage, seriesIndex, seriesPage, pathsIndex, pathPage,
  contact, shop, privacy, notFound, serverError, CONTACT_SUBJECTS,
};
