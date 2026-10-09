'use strict';
// Regras de conteúdo independentes de apresentação.
const { isVideoId } = require('./youtube');

const TOPICS = {
  transformacao: 'Transformação pessoal',
  mentalidade: 'Mentalidade e hábitos',
  maturidade: 'Maturidade e caráter',
  fe: 'Fé e propósito',
  relacionamentos: 'Família e relacionamentos',
  disciplina: 'Disciplina e responsabilidade',
  lideranca: 'Liderança e vida profissional',
  financas: 'Finanças e escolhas conscientes',
};

const EPISODE_STATUS = {
  disponivel: 'Disponível',
  agendado: 'Agendado',
  indisponivel: 'Indisponível',
};

const LIVE_STATUS = {
  nenhum: 'Sem vídeo em destaque',
  agendado: 'Agendado',
  ao_vivo: 'Ao vivo',
  replay: 'Replay',
};

const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
const byDateAsc = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));

function publishedSeries(c) {
  return (c.series || []).filter((s) => s.published).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function findSeries(c, slug) {
  return (c.series || []).find((s) => s.slug === slug && s.published) || null;
}

function seriesEpisodes(c, slug) {
  return (c.episodes || [])
    .filter((e) => e.series === slug)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || byDateAsc(a, b));
}

// "Disponível" é um estado editorial definido no painel; nunca deduzido pela data.
function availableEpisodes(c) {
  return (c.episodes || []).filter((e) => e.status === 'disponivel' && isVideoId(e.videoId)).sort(byDateDesc);
}

function upcomingEpisodes(c, now = new Date()) {
  return (c.episodes || [])
    .filter((e) => e.status === 'agendado' && e.date && new Date(e.date) > now)
    .sort(byDateAsc);
}

function findEpisode(c, id) {
  return (c.episodes || []).find((e) => e.id === id) || null;
}

function episodeByVideo(c, videoId) {
  return (c.episodes || []).find((e) => e.videoId === videoId) || null;
}

function pathEpisodes(c, p) {
  return (p.episodes || []).map((v) => episodeByVideo(c, v)).filter((e) => e && e.status === 'disponivel');
}

// Caminhos sem nenhum episódio disponível não aparecem (não prometemos seleção inexistente).
function visiblePaths(c) {
  return (c.paths || [])
    .map((p) => ({ ...p, items: pathEpisodes(c, p) }))
    .filter((p) => p.items.length > 0)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function seriesSummary(c, s, now = new Date()) {
  const eps = seriesEpisodes(c, s.slug);
  const available = eps.filter((e) => e.status === 'disponivel').length;
  const upcoming = eps.filter((e) => e.status === 'agendado' && e.date && new Date(e.date) > now);
  return { total: eps.length, available, upcoming: upcoming.length, next: upcoming.sort(byDateAsc)[0] || null };
}

// Estado público da transmissão em destaque. Controlado manualmente no painel:
// - "agendado" após o horário NÃO vira "ao vivo" sozinho;
// - "ao vivo" deixa de exibir o selo depois de liveMaxHours sem atualização.
function liveView(live, now = new Date()) {
  if (!live || !isVideoId(live.videoId) || !live.status || live.status === 'nenhum') {
    return { kind: 'empty' };
  }
  const base = {
    videoId: live.videoId,
    title: live.title || '',
    description: live.description || '',
    scheduledAt: live.scheduledAt || '',
    cover: live.cover || null,
    embeddable: live.embeddable !== false,
  };
  if (live.status === 'agendado') {
    const when = live.scheduledAt ? new Date(live.scheduledAt) : null;
    if (when && when > now) return { ...base, kind: 'scheduled', badge: 'Agendado', future: true };
    return { ...base, kind: 'scheduled', badge: 'Agendado', future: false };
  }
  if (live.status === 'ao_vivo') {
    const since = live.liveSince ? new Date(live.liveSince) : null;
    const maxMs = Math.max(1, Number(live.liveMaxHours) || 6) * 3600 * 1000;
    if (since && now - since >= 0 && now - since < maxMs) return { ...base, kind: 'live', badge: 'Ao vivo' };
    return { ...base, kind: 'recent', badge: 'Transmissão recente', stale: true };
  }
  return { ...base, kind: 'replay', badge: 'Replay' };
}

// Avisos exibidos no painel para que a equipe mantenha o site coerente.
function adminWarnings(c, now = new Date()) {
  const w = [];
  const lv = liveView(c.live, now);
  if (lv.stale) w.push('A transmissão está marcada como “ao vivo” há mais tempo que o limite configurado. O site parou de mostrar o selo “Ao vivo”. Atualize o estado para “replay” quando a live terminar.');
  if (lv.kind === 'scheduled' && !lv.future) w.push('A transmissão em destaque está “agendada”, mas o horário já passou. Se a live começou, marque “ao vivo”; se terminou, marque “replay”.');
  const late = (c.episodes || []).filter((e) => e.status === 'agendado' && e.date && new Date(e.date) <= now);
  if (late.length) w.push(`${late.length} episódio(s) agendado(s) com data já passada. Confira no YouTube e atualize o estado para “disponível” ou “indisponível”: ${late.map((e) => e.title).join('; ')}.`);
  return w;
}

module.exports = {
  TOPICS, EPISODE_STATUS, LIVE_STATUS,
  publishedSeries, findSeries, seriesEpisodes, availableEpisodes, upcomingEpisodes,
  findEpisode, episodeByVideo, pathEpisodes, visiblePaths, seriesSummary, liveView, adminWarnings,
};
