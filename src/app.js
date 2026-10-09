'use strict';
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('./http');
const { openStores } = require('./store');
const { Sessions, RateLimiter, verifyPassword, safeEqual, COOKIE, IDLE_MS } = require('./auth');
const D = require('./domain');
const S = require('./schemas');
const { validate, slugify, clean } = require('./forms');
const yt = require('./youtube');
const { saveUpload, MAX_UPLOAD } = require('./images');
const pages = require('./views/pages');
const A = require('./views/admin');
const { html } = require('./views/html');
const t = require('./time');

const MAX_SUBMISSIONS = 5000;

function createApp(config, { now = () => new Date(), log = console } = {}) {
  const stores = openStores(config);
  const sessions = new Sessions();
  const loginLimiter = new RateLimiter(5, 15 * 60 * 1000);
  const formLimiter = new RateLimiter(6, 10 * 60 * 1000);
  const noindex = !config.publicBaseUrl;

  const content = () => stores.content.get();
  const ctx = () => ({ c: content(), config, now: now() });

  function refreshThumbs(ids) {
    if (!config.fetchRemote) return;
    yt.ensureThumbs(config.dataDir, ids).catch((e) => log.warn('miniaturas:', e.message));
  }
  function allVideoIds(c = content()) {
    return [c.live && c.live.videoId, ...(c.episodes || []).map((e) => e.videoId)].filter(Boolean);
  }

  // ---------------- roteador simples ----------------
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, ...opts });
  };

  const sendPage = (res, status, body) => H.send(res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
  const notFound = (res) => sendPage(res, 404, pages.notFound(ctx()));

  // ---------------- páginas públicas ----------------
  route('GET', '/', (req, res) => sendPage(res, 200, pages.home(ctx())));
  route('GET', '/apresentadores', (req, res) => sendPage(res, 200, pages.hostsIndex(ctx())));
  route('GET', '/apresentadores/:slug', (req, res, p) => {
    const h = (content().hosts || []).find((x) => x.slug === p.slug);
    return h ? sendPage(res, 200, pages.hostPage(ctx(), h)) : notFound(res);
  });
  route('GET', '/assista', (req, res, p, url) => sendPage(res, 200, pages.watch(ctx(), {
    serie: String(url.searchParams.get('serie') || '').slice(0, 90),
    tema: String(url.searchParams.get('tema') || '').slice(0, 40),
  })));
  route('GET', '/episodios/:id', (req, res, p) => {
    const ep = D.findEpisode(content(), p.id);
    return ep && ep.status === 'disponivel' && yt.isVideoId(ep.videoId) ? sendPage(res, 200, pages.episodePage(ctx(), ep)) : notFound(res);
  });
  route('GET', '/series', (req, res) => sendPage(res, 200, pages.seriesIndex(ctx())));
  route('GET', '/series/:slug', (req, res, p) => {
    const s = D.findSeries(content(), p.slug);
    return s ? sendPage(res, 200, pages.seriesPage(ctx(), s)) : notFound(res);
  });
  route('GET', '/para-voce', (req, res) => sendPage(res, 200, pages.pathsIndex(ctx())));
  route('GET', '/para-voce/:slug', (req, res, p) => {
    const path = D.visiblePaths(content()).find((x) => x.slug === p.slug);
    return path ? sendPage(res, 200, pages.pathPage(ctx(), path)) : notFound(res);
  });
  route('GET', '/privacidade', (req, res) => sendPage(res, 200, pages.privacy(ctx())));

  route('GET', '/contato', (req, res, p, url) => {
    const assunto = url.searchParams.get('assunto');
    const values = pages.CONTACT_SUBJECTS[assunto] ? { assunto } : {};
    sendPage(res, 200, pages.contact(ctx(), { values, sent: url.searchParams.get('enviado') === '1' }));
  });
  route('POST', '/contato', async (req, res) => {
    const c = content();
    if (!c.site.contactEnabled) return notFound(res);
    const body = await H.readForm(req, 32 * 1024);
    if (clean(body.site)) return H.redirect(res, '/contato?enviado=1#resultado'); // isca para robôs
    const ip = H.clientIp(req, config.trustProxy);
    const fields = [
      { name: 'nome', type: 'text', max: 120, required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'telefone', type: 'text', max: 30, pattern: /^[0-9()+\-.\s]{8,30}$/, patternMessage: 'Telefone inválido.' },
      { name: 'assunto', type: 'select', options: pages.CONTACT_SUBJECTS, required: true },
      { name: 'mensagem', type: 'textarea', max: 3000, required: true },
      { name: 'consentimento', type: 'bool' },
    ];
    const r = validate(fields, body);
    if (!r.values.consentimento) r.errors.consentimento = 'É preciso concordar para enviar.';
    if (Object.keys(r.errors).length) return sendPage(res, 422, pages.contact(ctx(), { values: body, errors: r.errors }));
    if (formLimiter.blocked(ip)) return sendPage(res, 429, pages.contact(ctx(), { values: body, failed: 'Muitos envios em pouco tempo. Tente novamente mais tarde.' }));
    formLimiter.hit(ip);
    await stores.submissions.update((d) => {
      d.contact = d.contact || [];
      d.contact.push({ id: crypto.randomBytes(8).toString('hex'), at: now().toISOString(), ...r.values, consentimento: true });
      if (d.contact.length > MAX_SUBMISSIONS) d.contact = d.contact.slice(-MAX_SUBMISSIONS);
    });
    H.redirect(res, '/contato?enviado=1#resultado');
  }, { publicPost: true });

  route('GET', '/loja', (req, res, p, url) => sendPage(res, 200, pages.shop(ctx(), { sent: url.searchParams.get('aviso') === 'ok' })));
  route('POST', '/loja/aviso', async (req, res) => {
    const c = content();
    if (!c.shop.waitlistEnabled) return notFound(res);
    const body = await H.readForm(req, 16 * 1024);
    if (clean(body.site)) return H.redirect(res, '/loja?aviso=ok#aviso');
    const ip = H.clientIp(req, config.trustProxy);
    const cats = Object.fromEntries((c.shop.categories || []).map((x) => [x.key, x.name]));
    const r = validate([
      { name: 'nome', type: 'text', max: 120 },
      { name: 'email', type: 'email', required: true },
      { name: 'interesses', type: 'checks', options: cats },
      { name: 'consentimento', type: 'bool' },
    ], body);
    if (!r.values.consentimento) r.errors.consentimento = 'É preciso concordar para se cadastrar.';
    if (Object.keys(r.errors).length) return sendPage(res, 422, pages.shop(ctx(), { values: body, errors: r.errors }));
    if (formLimiter.blocked(ip)) return sendPage(res, 429, pages.shop(ctx(), { values: body, errors: { email: 'Muitos envios em pouco tempo. Tente mais tarde.' } }));
    formLimiter.hit(ip);
    await stores.submissions.update((d) => {
      d.waitlist = d.waitlist || [];
      const existing = d.waitlist.find((w) => w.email === r.values.email);
      if (existing) Object.assign(existing, { nome: r.values.nome || existing.nome, interesses: r.values.interesses, at: now().toISOString() });
      else d.waitlist.push({ id: crypto.randomBytes(8).toString('hex'), at: now().toISOString(), ...r.values, consentimento: true });
      if (d.waitlist.length > MAX_SUBMISSIONS) d.waitlist = d.waitlist.slice(-MAX_SUBMISSIONS);
    });
    H.redirect(res, '/loja?aviso=ok#aviso');
  }, { publicPost: true });

  route('GET', '/thumbs/:id/:size', (req, res, p) => {
    const size = Number(String(p.size).replace(/\.jpg$/, ''));
    if (!yt.isVideoId(p.id) || !yt.THUMB_SIZES.includes(size)) return notFound(res);
    // tenta o tamanho pedido e, se não existir, os demais tamanhos já baixados
    for (const s of [size, ...yt.THUMB_SIZES.filter((x) => x !== size).sort((a, b) => Math.abs(a - size) - Math.abs(b - size))]) {
      const file = yt.thumbPath(config.dataDir, p.id, s);
      if (H.serveFile(req, res, path.dirname(file), path.basename(file), { maxAge: 86400 })) return;
    }
    if (config.fetchRemote) yt.ensureThumbs(config.dataDir, [p.id]).catch(() => {});
    H.serveFile(req, res, config.publicDir, 'img/marca/miniatura-padrao.svg', { maxAge: 300 }) || notFound(res);
  });

  route('GET', '/robots.txt', (req, res) => {
    const body = config.publicBaseUrl
      ? `User-agent: *\nDisallow: /admin\nSitemap: ${config.publicBaseUrl}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n';
    H.send(res, 200, body, 'text/plain; charset=utf-8');
  });
  route('GET', '/sitemap.xml', (req, res) => {
    if (!config.publicBaseUrl) return notFound(res);
    const c = content();
    const urls = ['/', '/apresentadores', '/assista', '/series', '/loja', '/contato', '/para-voce',
      ...(c.hosts || []).map((h) => `/apresentadores/${h.slug}`),
      ...D.publishedSeries(c).map((s) => `/series/${s.slug}`),
      ...D.availableEpisodes(c).map((e) => `/episodios/${e.id}`),
      ...D.visiblePaths(c).map((x) => `/para-voce/${x.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${config.publicBaseUrl}${u}</loc></url>`).join('')}</urlset>`;
    H.send(res, 200, xml, 'application/xml; charset=utf-8');
  });
  route('GET', '/healthz', (req, res) => H.json(res, 200, { ok: true }));

  // ---------------- painel ----------------
  function getSession(req) {
    return sessions.get(H.parseCookies(req)[COOKIE]);
  }
  function takeFlash(s) {
    const f = s.flash; delete s.flash; return f;
  }
  function flashRedirect(res, s, location, text, type = 'success') {
    s.flash = { type, text };
    H.redirect(res, location);
  }

  route('GET', '/admin/entrar', (req, res) => {
    if (!config.adminPasswordHash) return sendPage(res, 503, A.setupNeeded());
    if (getSession(req)) return H.redirect(res, '/admin');
    sendPage(res, 200, A.login());
  }, { public: true });

  route('POST', '/admin/entrar', async (req, res) => {
    if (!config.adminPasswordHash) return sendPage(res, 503, A.setupNeeded());
    if (!H.sameOrigin(req)) return sendPage(res, 403, A.login({ error: 'Origem da requisição não permitida.' }));
    const ip = H.clientIp(req, config.trustProxy);
    if (loginLimiter.blocked(ip)) return sendPage(res, 429, A.login({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }));
    const body = await H.readForm(req, 8 * 1024);
    const user = String(body.usuario || '').slice(0, 80);
    const okUser = safeEqual(user, config.adminUser);
    const okPass = verifyPassword(String(body.senha || '').slice(0, 200), config.adminPasswordHash);
    if (!(okUser && okPass)) {
      loginLimiter.hit(ip);
      return sendPage(res, 401, A.login({ error: 'Usuário ou senha incorretos.', user }));
    }
    loginLimiter.reset(ip);
    const id = sessions.create(user);
    H.setCookie(res, COOKIE, id, { secure: config.cookieSecure, maxAge: Math.floor(IDLE_MS / 1000) * 6, path: '/' });
    H.redirect(res, '/admin');
  }, { public: true });

  route('POST', '/admin/sair', (req, res, p, url, s) => {
    sessions.destroy(H.parseCookies(req)[COOKIE]);
    H.setCookie(res, COOKIE, '', { secure: config.cookieSecure, maxAge: 0, path: '/' });
    H.redirect(res, '/admin/entrar');
  });

  route('GET', '/admin', (req, res, p, url, s) => sendPage(res, 200, A.dashboard({ session: s, flash: takeFlash(s), c: content(), subs: stores.submissions.get(), now: now() })));

  // ----- transmissão -----
  const liveToForm = (l) => ({ url: l.url || (l.videoId ? yt.watchUrl(l.videoId) : ''), title: l.title, description: l.description, scheduledAt: l.scheduledAt, status: l.status && l.status !== 'nenhum' ? l.status : 'agendado', liveMaxHours: l.liveMaxHours || 6, cover: l.cover });
  const renderLive = (res, s, { values, errors = {}, status = 200, check = '' } = {}) => {
    const c = content();
    sendPage(res, status, A.formPage({
      session: s, flash: takeFlash(s), nav: 'transmissao', title: 'Transmissão em destaque',
      intro: 'Cole o link da live do YouTube, ajuste título, horário e estado. O vídeo aparece na página inicial e na página Assista.',
      fields: S.live, values: values || liveToForm(c.live || {}), errors, action: '/admin/transmissao', submit: 'Salvar transmissão',
      extra: A.liveExtra({ session: s, c, now: now(), check }),
    }));
  };
  route('GET', '/admin/transmissao', (req, res, p, url, s) => renderLive(res, s));
  route('POST', '/admin/transmissao', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const r = validate(S.live, body);
    let videoId = '';
    if (!r.errors.url) {
      const parsed = yt.parseYouTubeUrl(r.values.url);
      if (parsed.error) r.errors.url = parsed.error; else videoId = parsed.id;
    }
    if (!r.ok || Object.keys(r.errors).length) return renderLive(res, s, { values: body, errors: r.errors, status: 422 });
    let embeddable = true;
    let title = r.values.title;
    let warn = '';
    if (config.fetchRemote) {
      const chk = await yt.checkOEmbed(videoId);
      if (!chk.ok && chk.reason === 'not_found') {
        return renderLive(res, s, { values: body, errors: { url: 'O YouTube não encontrou esse vídeo. Confira se ele está público ou não listado e se o link está completo.' }, status: 422 });
      }
      if (chk.ok) { embeddable = chk.embeddable; if (!title && chk.title) title = chk.title; }
      else warn = ' Não foi possível confirmar o vídeo no YouTube agora (sem conexão?). Confira a página pública.';
      if (chk.ok && !chk.embeddable) warn = ' Atenção: o YouTube informou que este vídeo não permite incorporação. O site mostrará um link para assistir no YouTube. Ative a incorporação no YouTube Studio.';
    }
    const prev = content().live || {};
    const nowIso = now().toISOString();
    await stores.content.update((c) => {
      const keepSince = prev.status === 'ao_vivo' && prev.videoId === videoId && prev.liveSince;
      c.live = {
        url: r.values.url, videoId, title: title || '', description: r.values.description,
        scheduledAt: r.values.scheduledAt, status: r.values.status, cover: r.values.cover,
        liveSince: r.values.status === 'ao_vivo' ? (keepSince || nowIso) : '',
        liveMaxHours: r.values.liveMaxHours || 6, embeddable, updatedAt: nowIso,
      };
    });
    refreshThumbs([videoId]);
    flashRedirect(res, s, '/admin/transmissao', `Transmissão salva.${warn}`, warn ? 'warning' : 'success');
  });
  route('POST', '/admin/transmissao/estado', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const st = String(body.status || '');
    if (!['ao_vivo', 'replay', 'agendado'].includes(st)) return flashRedirect(res, s, '/admin/transmissao', 'Estado inválido.', 'error');
    if (!yt.isVideoId((content().live || {}).videoId)) return flashRedirect(res, s, '/admin/transmissao', 'Configure um vídeo antes de mudar o estado.', 'error');
    await stores.content.update((c) => {
      c.live.status = st;
      c.live.liveSince = st === 'ao_vivo' ? now().toISOString() : '';
      c.live.updatedAt = now().toISOString();
    });
    flashRedirect(res, s, '/admin/transmissao', st === 'ao_vivo' ? 'Marcado como ao vivo.' : 'Estado atualizado.');
  });
  route('POST', '/admin/transmissao/remover', async (req, res, p, url, s) => {
    await stores.content.update((c) => {
      c.live = { url: '', videoId: '', title: '', description: '', scheduledAt: '', status: 'nenhum', cover: null, liveSince: '', liveMaxHours: (c.live && c.live.liveMaxHours) || 6, embeddable: true, updatedAt: now().toISOString() };
    });
    flashRedirect(res, s, '/admin/transmissao', 'Destaque removido. O site mostra o estado “sem transmissão”.');
  });

  // ----- informação do YouTube (para preencher título) -----
  route('GET', '/admin/youtube-info', async (req, res, p, url) => {
    const parsed = yt.parseYouTubeUrl(url.searchParams.get('url'));
    if (parsed.error) return H.json(res, 400, { error: parsed.error });
    if (!config.fetchRemote) return H.json(res, 200, { id: parsed.id });
    const chk = await yt.checkOEmbed(parsed.id);
    H.json(res, 200, { id: parsed.id, ...chk });
  }, { json: true });

  // ----- episódios -----
  const seriesOptions = () => Object.fromEntries((content().series || []).map((x) => [x.slug, x.name]));
  const epToForm = (e) => ({ ...e, url: e.videoId ? yt.watchUrl(e.videoId) : '', durationMin: e.durationSec ? Math.round(e.durationSec / 60) : 0 });
  route('GET', '/admin/episodios', (req, res, p, url, s) => {
    const c = content();
    const sname = Object.fromEntries((c.series || []).map((x) => [x.slug, x.name]));
    const eps = [...(c.episodes || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    sendPage(res, 200, A.listPage({
      session: s, flash: takeFlash(s), nav: 'episodios', title: 'Episódios', newHref: '/admin/episodios/novo', newLabel: 'Cadastrar episódio',
      intro: 'Somente episódios “disponíveis” aparecem como assistíveis no site. Os “agendados” aparecem nas séries com a data prevista.',
      columns: ['Título', 'Série', 'Estado', 'Data', ''],
      rows: eps.map((e) => [html`<a href="/admin/episodios/${e.id}">${e.title}</a>`, e.series ? `${sname[e.series] || e.series} ${e.label || ''}` : '—', D.EPISODE_STATUS[e.status] || e.status, t.formatDateTime(e.date), A.deleteForm(s, `/admin/episodios/${e.id}/excluir`)]),
    }));
  });
  const renderEpisode = (res, s, { values, errors = {}, status = 200, isNew, id }) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'episodios', title: isNew ? 'Cadastrar episódio' : 'Editar episódio', back: '/admin/episodios',
    intro: 'Dica: cole o link e use “Buscar título no YouTube” para preencher o título.',
    fields: S.episode(seriesOptions()), values, errors, action: isNew ? '/admin/episodios/novo' : `/admin/episodios/${id}`,
  }));
  route('GET', '/admin/episodios/novo', (req, res, p, url, s) => renderEpisode(res, s, { isNew: true, values: { status: 'agendado', order: 0, durationMin: 0, topics: [] } }));
  route('GET', '/admin/episodios/:id', (req, res, p, url, s) => {
    const e = D.findEpisode(content(), p.id);
    return e ? renderEpisode(res, s, { id: e.id, values: epToForm(e) }) : notFound(res);
  });
  const saveEpisode = async (req, res, s, existingId) => {
    const body = await H.readForm(req);
    if (!body.id && body.title) body.id = slugify(body.title);
    const r = validate(S.episode(seriesOptions()), body);
    const c = content();
    if (!r.errors.id && (c.episodes || []).some((e) => e.id === r.values.id && e.id !== existingId)) r.errors.id = 'Já existe um episódio com esse identificador.';
    if (!r.errors.url && (c.episodes || []).some((e) => e.videoId === r.values.url && e.id !== existingId)) r.errors.url = 'Esse vídeo já está cadastrado em outro episódio.';
    if (Object.keys(r.errors).length) return renderEpisode(res, s, { values: body, errors: r.errors, status: 422, isNew: !existingId, id: existingId });
    const prev = existingId ? D.findEpisode(c, existingId) : null;
    let embeddable = prev ? prev.embeddable !== false : true;
    if (config.fetchRemote && (!prev || prev.videoId !== r.values.url)) {
      const chk = await yt.checkOEmbed(r.values.url);
      if (chk.ok) embeddable = chk.embeddable;
    }
    const keepSec = prev && Math.round((prev.durationSec || 0) / 60) === r.values.durationMin;
    const ep = {
      id: r.values.id, videoId: r.values.url, title: r.values.title, summary: r.values.summary,
      date: r.values.date, durationSec: keepSec ? prev.durationSec : (r.values.durationMin || 0) * 60,
      series: r.values.series, label: r.values.label, order: r.values.order || 0, status: r.values.status,
      topics: r.values.topics, embeddable,
    };
    await stores.content.update((d) => {
      const i = d.episodes.findIndex((e) => e.id === existingId);
      if (i >= 0) d.episodes[i] = ep; else d.episodes.push(ep);
    });
    refreshThumbs([ep.videoId]);
    flashRedirect(res, s, `/admin/episodios/${ep.id}`, 'Episódio salvo.');
  };
  route('POST', '/admin/episodios/novo', (req, res, p, url, s) => saveEpisode(req, res, s, null));
  route('POST', '/admin/episodios/:id', (req, res, p, url, s) => (D.findEpisode(content(), p.id) ? saveEpisode(req, res, s, p.id) : notFound(res)));
  route('POST', '/admin/episodios/:id/excluir', async (req, res, p, url, s) => {
    await stores.content.update((d) => { d.episodes = d.episodes.filter((e) => e.id !== p.id); });
    flashRedirect(res, s, '/admin/episodios', 'Episódio excluído.');
  });

  // ----- séries -----
  const seriesToForm = (x) => ({ ...x, playlist: x.playlistId ? yt.playlistUrl(x.playlistId) : '' });
  route('GET', '/admin/series', (req, res, p, url, s) => {
    const c = content();
    sendPage(res, 200, A.listPage({
      session: s, flash: takeFlash(s), nav: 'series', title: 'Séries', newHref: '/admin/series/nova', newLabel: 'Nova série',
      columns: ['Série', 'Episódios cadastrados', 'No site', ''],
      rows: [...(c.series || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((x) => [html`<a href="/admin/series/${x.slug}">${x.name}</a>`, String(D.seriesEpisodes(c, x.slug).length), x.published ? 'Sim' : 'Não', A.deleteForm(s, `/admin/series/${x.slug}/excluir`, 'Excluir', 'Excluir a série? Os episódios continuam cadastrados, sem série.')]),
    }));
  });
  const renderSeries = (res, s, { values, errors = {}, status = 200, slug }) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'series', title: slug ? 'Editar série' : 'Nova série', back: '/admin/series',
    intro: slug ? 'Os episódios da série são vinculados no cadastro de cada episódio.' : '',
    fields: S.series, values, errors, action: slug ? `/admin/series/${slug}` : '/admin/series/nova',
  }));
  route('GET', '/admin/series/nova', (req, res, p, url, s) => renderSeries(res, s, { values: { published: false, order: (content().series || []).length + 1 } }));
  route('GET', '/admin/series/:slug', (req, res, p, url, s) => {
    const x = (content().series || []).find((y) => y.slug === p.slug);
    return x ? renderSeries(res, s, { slug: x.slug, values: seriesToForm(x) }) : notFound(res);
  });
  const saveSeries = async (req, res, s, oldSlug) => {
    const body = await H.readForm(req);
    if (!body.slug && body.name) body.slug = slugify(body.name);
    const r = validate(S.series, body);
    if (!r.errors.slug && (content().series || []).some((x) => x.slug === r.values.slug && x.slug !== oldSlug)) r.errors.slug = 'Já existe uma série com esse identificador.';
    if (Object.keys(r.errors).length) return renderSeries(res, s, { values: body, errors: r.errors, status: 422, slug: oldSlug });
    const item = { slug: r.values.slug, name: r.values.name, tagline: r.values.tagline, description: r.values.description, cover: r.values.cover, playlistId: r.values.playlist, order: r.values.order || 0, published: r.values.published };
    await stores.content.update((d) => {
      const i = d.series.findIndex((x) => x.slug === oldSlug);
      if (i >= 0) d.series[i] = item; else d.series.push(item);
      if (oldSlug && oldSlug !== item.slug) {
        for (const e of d.episodes) if (e.series === oldSlug) e.series = item.slug;
        d.home.featuredSeries = (d.home.featuredSeries || []).map((x) => (x === oldSlug ? item.slug : x));
      }
    });
    flashRedirect(res, s, `/admin/series/${item.slug}`, 'Série salva.');
  };
  route('POST', '/admin/series/nova', (req, res, p, url, s) => saveSeries(req, res, s, null));
  route('POST', '/admin/series/:slug', (req, res, p, url, s) => ((content().series || []).some((x) => x.slug === p.slug) ? saveSeries(req, res, s, p.slug) : notFound(res)));
  route('POST', '/admin/series/:slug/excluir', async (req, res, p, url, s) => {
    await stores.content.update((d) => {
      d.series = d.series.filter((x) => x.slug !== p.slug);
      for (const e of d.episodes) if (e.series === p.slug) e.series = '';
      d.home.featuredSeries = (d.home.featuredSeries || []).filter((x) => x !== p.slug);
    });
    flashRedirect(res, s, '/admin/series', 'Série excluída.');
  });

  // ----- apresentadores -----
  route('GET', '/admin/apresentadores', (req, res, p, url, s) => sendPage(res, 200, A.listPage({
    session: s, flash: takeFlash(s), nav: 'apresentadores', title: 'Apresentadores',
    columns: ['Nome', 'Atuação'], rows: (content().hosts || []).map((h) => [html`<a href="/admin/apresentadores/${h.slug}">${h.name}</a>`, h.role || '']),
  })));
  const hostToForm = (h) => ({ ...h, featured: (h.featured || []).map((v) => yt.watchUrl(v)) });
  const renderHost = (res, s, { values, errors = {}, status = 200, slug }) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'apresentadores', title: `Editar ${values.name || 'apresentador'}`, back: '/admin/apresentadores',
    intro: 'Publique apenas informações confirmadas pelo próprio apresentador.',
    fields: S.host, values, errors, action: `/admin/apresentadores/${slug}`,
  }));
  route('GET', '/admin/apresentadores/:slug', (req, res, p, url, s) => {
    const h = (content().hosts || []).find((x) => x.slug === p.slug);
    return h ? renderHost(res, s, { slug: h.slug, values: hostToForm(h) }) : notFound(res);
  });
  route('POST', '/admin/apresentadores/:slug', async (req, res, p, url, s) => {
    const h = (content().hosts || []).find((x) => x.slug === p.slug);
    if (!h) return notFound(res);
    const body = await H.readForm(req, 512 * 1024);
    const r = validate(S.host, body);
    if (Object.keys(r.errors).length) return renderHost(res, s, { slug: p.slug, values: { ...body, name: body.name || h.name }, errors: r.errors, status: 422 });
    await stores.content.update((d) => {
      const i = d.hosts.findIndex((x) => x.slug === p.slug);
      d.hosts[i] = { ...d.hosts[i], ...r.values };
    });
    flashRedirect(res, s, `/admin/apresentadores/${p.slug}`, 'Dados do apresentador salvos.');
  });

  // ----- página inicial -----
  const renderHome = (res, s, { values, errors = {}, status = 200 } = {}) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'inicio', title: 'Página inicial',
    intro: `Identificadores de séries disponíveis: ${(content().series || []).map((x) => x.slug).join(', ')}.`,
    fields: S.home, values: values || content().home, errors, action: '/admin/inicio',
  }));
  route('GET', '/admin/inicio', (req, res, p, url, s) => renderHome(res, s));
  route('POST', '/admin/inicio', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const r = validate(S.home, body);
    const known = new Set((content().series || []).map((x) => x.slug));
    const unknown = (r.values.featuredSeries || []).filter((x) => !known.has(x));
    if (unknown.length) r.errors.featuredSeries = `Série não encontrada: ${unknown.join(', ')}`;
    if (Object.keys(r.errors).length) return renderHome(res, s, { values: body, errors: r.errors, status: 422 });
    await stores.content.update((d) => { d.home = { ...d.home, ...r.values }; });
    flashRedirect(res, s, '/admin/inicio', 'Página inicial salva.');
  });

  // ----- audiência -----
  const metricsToForm = (m) => {
    const [a = {}, b = {}] = m.items || [];
    return { enabled: m.enabled, value1: a.value, label1: a.label, raw1: a.raw, value2: b.value, label2: b.label, raw2: b.raw, observedAt: a.observedAt || '', reference: m.reference, source: m.source };
  };
  const renderMetrics = (res, s, { values, errors = {}, status = 200 } = {}) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'audiencia', title: 'Números de audiência',
    intro: 'Estes números são históricos e editados manualmente; não são consultados em tempo real. Não some métricas e não apresente visualizações como pessoas.',
    fields: S.metrics, values: values || metricsToForm(content().metrics || {}), errors, action: '/admin/audiencia',
  }));
  route('GET', '/admin/audiencia', (req, res, p, url, s) => renderMetrics(res, s));
  route('POST', '/admin/audiencia', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const r = validate(S.metrics, body);
    if (Object.keys(r.errors).length) return renderMetrics(res, s, { values: body, errors: r.errors, status: 422 });
    const v = r.values;
    await stores.content.update((d) => {
      d.metrics = {
        enabled: v.enabled, reference: v.reference, source: v.source,
        items: [[v.value1, v.label1, v.raw1], [v.value2, v.label2, v.raw2]].filter(([val, lab]) => val && lab)
          .map(([value, label, raw]) => ({ value, label, raw, observedAt: v.observedAt })),
      };
    });
    flashRedirect(res, s, '/admin/audiencia', 'Números salvos.');
  });

  // ----- caminhos (por onde começar) -----
  const pathToForm = (x) => ({ ...x, episodes: (x.episodes || []).map((v) => yt.watchUrl(v)) });
  route('GET', '/admin/caminhos', (req, res, p, url, s) => {
    const c = content();
    sendPage(res, 200, A.listPage({
      session: s, flash: takeFlash(s), nav: 'caminhos', title: 'Por onde começar', newHref: '/admin/caminhos/novo', newLabel: 'Novo caminho',
      intro: 'Seleções de episódios por necessidade. Um caminho só aparece no site se tiver ao menos um episódio disponível.',
      columns: ['Caminho', 'Episódios disponíveis', ''],
      rows: [...(c.paths || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((x) => [html`<a href="/admin/caminhos/${x.slug}">${x.title}</a>`, `${D.pathEpisodes(c, x).length} de ${(x.episodes || []).length}`, A.deleteForm(s, `/admin/caminhos/${x.slug}/excluir`)]),
    }));
  });
  const renderPath = (res, s, { values, errors = {}, status = 200, slug }) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'caminhos', title: slug ? 'Editar caminho' : 'Novo caminho', back: '/admin/caminhos',
    fields: S.pathSchema(), values, errors, action: slug ? `/admin/caminhos/${slug}` : '/admin/caminhos/novo',
  }));
  route('GET', '/admin/caminhos/novo', (req, res, p, url, s) => renderPath(res, s, { values: { order: (content().paths || []).length + 1 } }));
  route('GET', '/admin/caminhos/:slug', (req, res, p, url, s) => {
    const x = (content().paths || []).find((y) => y.slug === p.slug);
    return x ? renderPath(res, s, { slug: x.slug, values: pathToForm(x) }) : notFound(res);
  });
  const savePath = async (req, res, s, oldSlug) => {
    const body = await H.readForm(req);
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const r = validate(S.pathSchema(), body);
    if (!r.errors.slug && (content().paths || []).some((x) => x.slug === r.values.slug && x.slug !== oldSlug)) r.errors.slug = 'Já existe um caminho com esse identificador.';
    const missing = (r.values.episodes || []).filter((v) => !D.episodeByVideo(content(), v));
    if (missing.length) r.errors.episodes = `Cadastre primeiro estes vídeos em Episódios: ${missing.join(', ')}`;
    if (Object.keys(r.errors).length) return renderPath(res, s, { values: body, errors: r.errors, status: 422, slug: oldSlug });
    const item = { slug: r.values.slug, title: r.values.title, lead: r.values.lead, episodes: r.values.episodes, order: r.values.order || 0 };
    await stores.content.update((d) => {
      d.paths = d.paths || [];
      const i = d.paths.findIndex((x) => x.slug === oldSlug);
      if (i >= 0) d.paths[i] = item; else d.paths.push(item);
    });
    flashRedirect(res, s, `/admin/caminhos/${item.slug}`, 'Caminho salvo.');
  };
  route('POST', '/admin/caminhos/novo', (req, res, p, url, s) => savePath(req, res, s, null));
  route('POST', '/admin/caminhos/:slug', (req, res, p, url, s) => ((content().paths || []).some((x) => x.slug === p.slug) ? savePath(req, res, s, p.slug) : notFound(res)));
  route('POST', '/admin/caminhos/:slug/excluir', async (req, res, p, url, s) => {
    await stores.content.update((d) => { d.paths = (d.paths || []).filter((x) => x.slug !== p.slug); });
    flashRedirect(res, s, '/admin/caminhos', 'Caminho excluído.');
  });

  // ----- loja -----
  const money = (cents) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));
  route('GET', '/admin/loja', (req, res, p, url, s) => {
    const c = content();
    const list = A.listPage({
      session: s, flash: takeFlash(s), nav: 'loja', title: 'Loja', newHref: '/admin/loja/produtos/novo', newLabel: 'Novo produto',
      intro: 'A loja está em modo “Em breve”: não há carrinho, pagamento nem frete. Produtos “publicados” aparecem apenas como vitrine, sem compra. Produtos em rascunho não aparecem no site.',
      extra: html`<p><a class="a-btn a-btn--ghost a-btn--small" href="/admin/loja/configurar">Textos da loja e aviso de lançamento</a></p>`,
      columns: ['Produto', 'Categoria', 'Preço', 'Estado', ''],
      rows: (c.products || []).map((x) => [html`<a href="/admin/loja/produtos/${x.slug}">${x.name}</a>`, S.PRODUCT_CATEGORIES[x.category] || x.category, x.price ? `R$ ${money(x.price)}` : '—', x.status === 'publicado' ? 'Publicado (vitrine)' : 'Rascunho', A.deleteForm(s, `/admin/loja/produtos/${x.slug}/excluir`)]),
      empty: 'Nenhum produto cadastrado. O catálogo comercial ainda não foi definido.',
    });
    sendPage(res, 200, list);
  });
  const renderShop = (res, s, { values, errors = {}, status = 200 } = {}) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'loja', title: 'Textos da loja', back: '/admin/loja',
    fields: S.shop, values: values || content().shop, errors, action: '/admin/loja/configurar',
  }));
  route('GET', '/admin/loja/configurar', (req, res, p, url, s) => renderShop(res, s));
  route('POST', '/admin/loja/configurar', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const r = validate(S.shop, body);
    if (Object.keys(r.errors).length) return renderShop(res, s, { values: body, errors: r.errors, status: 422 });
    await stores.content.update((d) => { d.shop = { ...d.shop, ...r.values }; });
    flashRedirect(res, s, '/admin/loja/configurar', 'Textos da loja salvos.');
  });
  const productToForm = (x) => ({ ...x, price: money(x.price) });
  const renderProduct = (res, s, { values, errors = {}, status = 200, slug }) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'loja', title: slug ? 'Editar produto' : 'Novo produto', back: '/admin/loja',
    intro: 'Cadastre só produtos reais e aprovados. Preço, estoque e frete só valem para venda depois que as integrações de pagamento e entrega forem configuradas e testadas.',
    fields: S.product, values, errors, action: slug ? `/admin/loja/produtos/${slug}` : '/admin/loja/produtos/novo',
  }));
  route('GET', '/admin/loja/produtos/novo', (req, res, p, url, s) => renderProduct(res, s, { values: { status: 'rascunho', availability: 'em_breve' } }));
  route('GET', '/admin/loja/produtos/:slug', (req, res, p, url, s) => {
    const x = (content().products || []).find((y) => y.slug === p.slug);
    return x ? renderProduct(res, s, { slug: x.slug, values: productToForm(x) }) : notFound(res);
  });
  const saveProduct = async (req, res, s, oldSlug) => {
    const body = await H.readForm(req, 512 * 1024);
    if (!body.slug && body.name) body.slug = slugify(body.name);
    const r = validate(S.product, body);
    if (!r.errors.slug && (content().products || []).some((x) => x.slug === r.values.slug && x.slug !== oldSlug)) r.errors.slug = 'Já existe um produto com esse identificador.';
    if (Object.keys(r.errors).length) return renderProduct(res, s, { values: body, errors: r.errors, status: 422, slug: oldSlug });
    const item = { ...r.values, updatedAt: now().toISOString() };
    await stores.content.update((d) => {
      d.products = d.products || [];
      const i = d.products.findIndex((x) => x.slug === oldSlug);
      if (i >= 0) d.products[i] = item; else d.products.push(item);
    });
    flashRedirect(res, s, `/admin/loja/produtos/${item.slug}`, 'Produto salvo.');
  };
  route('POST', '/admin/loja/produtos/novo', (req, res, p, url, s) => saveProduct(req, res, s, null));
  route('POST', '/admin/loja/produtos/:slug', (req, res, p, url, s) => ((content().products || []).some((x) => x.slug === p.slug) ? saveProduct(req, res, s, p.slug) : notFound(res)));
  route('POST', '/admin/loja/produtos/:slug/excluir', async (req, res, p, url, s) => {
    await stores.content.update((d) => { d.products = (d.products || []).filter((x) => x.slug !== p.slug); });
    flashRedirect(res, s, '/admin/loja', 'Produto excluído.');
  });

  // ----- mensagens -----
  const cats = () => Object.fromEntries((content().shop.categories || []).map((x) => [x.key, x.name]));
  route('GET', '/admin/mensagens', (req, res, p, url, s) => sendPage(res, 200, A.messages({ session: s, flash: takeFlash(s), subs: stores.submissions.get(), subjects: pages.CONTACT_SUBJECTS, categories: cats() })));
  const csvCell = (v) => {
    let x = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`; // evita fórmulas ao abrir no Excel
    return `"${x.replace(/"/g, '""')}"`;
  };
  const sendCsv = (res, name, header, rows) => {
    const body = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    H.send(res, 200, body, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  };
  route('GET', '/admin/mensagens/contato.csv', (req, res) => {
    const list = stores.submissions.get().contact || [];
    sendCsv(res, 'contato.csv', ['Data', 'Nome', 'E-mail', 'Telefone', 'Assunto', 'Mensagem'], list.map((m) => [t.formatDateTime(m.at), m.nome, m.email, m.telefone, pages.CONTACT_SUBJECTS[m.assunto] || m.assunto, m.mensagem]));
  });
  route('GET', '/admin/mensagens/aviso.csv', (req, res) => {
    const list = stores.submissions.get().waitlist || [];
    const c = cats();
    sendCsv(res, 'aviso-loja.csv', ['Data', 'E-mail', 'Nome', 'Interesses'], list.map((w) => [t.formatDateTime(w.at), w.email, w.nome, (w.interesses || []).map((k) => c[k] || k).join(', ')]));
  });
  route('POST', '/admin/mensagens/:kind/:id/excluir', async (req, res, p, url, s) => {
    const key = p.kind === 'contato' ? 'contact' : p.kind === 'aviso' ? 'waitlist' : null;
    if (!key) return notFound(res);
    await stores.submissions.update((d) => { d[key] = (d[key] || []).filter((m) => m.id !== p.id); });
    flashRedirect(res, s, '/admin/mensagens', 'Registro excluído.');
  });

  // ----- configurações -----
  const renderSite = (res, s, { values, errors = {}, status = 200 } = {}) => sendPage(res, status, A.formPage({
    session: s, flash: takeFlash(s), nav: 'configuracoes', title: 'Configurações gerais',
    intro: 'Deixe em branco o que ainda não foi confirmado (por exemplo, Spotify, e-mail e telefone): campos vazios não aparecem no site.',
    fields: S.site, values: values || content().site, errors, action: '/admin/configuracoes',
  }));
  route('GET', '/admin/configuracoes', (req, res, p, url, s) => renderSite(res, s));
  route('POST', '/admin/configuracoes', async (req, res, p, url, s) => {
    const body = await H.readForm(req);
    const r = validate(S.site, body);
    if (Object.keys(r.errors).length) return renderSite(res, s, { values: body, errors: r.errors, status: 422 });
    await stores.content.update((d) => { d.site = { ...d.site, ...r.values }; });
    flashRedirect(res, s, '/admin/configuracoes', 'Configurações salvas.');
  });

  // ----- envio de imagens -----
  route('POST', '/admin/upload', async (req, res) => {
    const type = String(req.headers['content-type'] || '');
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return H.json(res, 415, { error: 'Envie JPEG, PNG ou WebP.' });
    const buf = await H.readBody(req, MAX_UPLOAD);
    const r = saveUpload(config.dataDir, buf);
    if (r.error) return H.json(res, 400, r);
    H.json(res, 200, r);
  }, { json: true });

  // ---------------- despacho ----------------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    H.securityHeaders(res, { noindex: noindex || pathname.startsWith('/admin') });

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname.startsWith('/static/')) {
        if (H.serveFile(req, res, config.publicDir, pathname.slice('/static/'.length), { maxAge: 3600 })) return;
        return notFound(res);
      }
      if (pathname.startsWith('/media/')) {
        if (H.serveFile(req, res, path.join(config.dataDir, 'uploads'), pathname.slice('/media/'.length), { maxAge: 86400 })) return;
        return notFound(res);
      }
    }

    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let matched = null;
    let params = {};
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      matched = r;
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = ''; } });
      break;
    }
    if (!matched) {
      if (pathMatched) { res.setHeader('Allow', 'GET, POST'); return H.send(res, 405, 'Método não permitido', 'text/plain; charset=utf-8'); }
      if (pathname.startsWith('/admin') && !getSession(req)) return H.redirect(res, '/admin/entrar');
      return notFound(res);
    }

    let session = null;
    if (pathname.startsWith('/admin')) {
      res.setHeader('Cache-Control', 'no-store');
      if (!matched.public) {
        session = getSession(req);
        if (!session) {
          if (method === 'GET' && !matched.json) return H.redirect(res, '/admin/entrar');
          return H.json(res, 401, { error: 'Sessão expirada. Entre novamente.' });
        }
        if (method === 'POST') {
          const header = req.headers['x-csrf-token'];
          let token = header;
          if (!token && String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) {
            // lê o formulário uma vez (fica em cache na requisição para o handler)
            token = (await H.readForm(req, 512 * 1024))._csrf;
          }
          if (!H.sameOrigin(req) || !token || !safeEqual(token, session.csrf)) {
            return H.send(res, 403, 'Requisição bloqueada (token de segurança inválido). Recarregue a página e tente novamente.', 'text/plain; charset=utf-8');
          }
        }
      }
    } else if (matched.publicPost && !H.sameOrigin(req)) {
      return H.send(res, 403, 'Origem não permitida.', 'text/plain; charset=utf-8');
    }
    await matched.handler(req, res, params, url, session);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof H.HttpError) {
        if (!res.headersSent) H.send(res, err.status, err.message, 'text/plain; charset=utf-8');
        return;
      }
      log.error('Erro ao processar', req.method, req.url, err);
      if (!res.headersSent) sendPage(res, 500, pages.serverError(ctx()));
      else res.end();
    });
  });
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;

  return { server, stores, sessions, refreshThumbs, allVideoIds };
}

module.exports = { createApp };
