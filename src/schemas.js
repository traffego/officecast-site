'use strict';
// Campos editáveis no painel. Cada esquema serve para validar e para desenhar o formulário.
const { TOPICS, EPISODE_STATUS } = require('./domain');

const live = [
  { name: 'url', type: 'text', label: 'Link do vídeo ou da transmissão no YouTube', max: 500, help: 'Cole o link da live ou do vídeo (ex.: https://www.youtube.com/live/…, youtube.com/watch?v=… ou youtu.be/…). O link do canal @OfficeCast não serve: ele não aponta para uma transmissão específica.' },
  { name: 'title', type: 'text', label: 'Título', max: 160 },
  { name: 'description', type: 'textarea', label: 'Descrição breve', max: 600, rows: 3 },
  { name: 'scheduledAt', type: 'datetime', label: 'Data e horário (horário de Brasília)', help: 'Opcional. Usado para mostrar quando a transmissão começa.' },
  { name: 'status', type: 'select', label: 'Estado', options: { agendado: 'Agendado', ao_vivo: 'Ao vivo agora', replay: 'Replay (já aconteceu)' }, required: true, help: 'O site não detecta sozinho quando a live começa ou termina. Atualize aqui.' },
  { name: 'liveMaxHours', type: 'number', label: 'Ocultar o selo “Ao vivo” após (horas)', integer: true, min: 1, max: 24, empty: 6, help: 'Proteção para o site não ficar mostrando “Ao vivo” se alguém esquecer de atualizar.' },
  { name: 'cover', type: 'image', label: 'Imagem de capa (opcional)', help: 'Se não houver, o site usa a miniatura do próprio YouTube.' },
];

const episodeStatus = EPISODE_STATUS;

function episode(seriesOptions) {
  return [
    { name: 'url', type: 'youtube', label: 'Link do vídeo no YouTube', required: true },
    { name: 'title', type: 'text', label: 'Título', max: 160, required: true },
    { name: 'summary', type: 'textarea', label: 'Resumo (1 a 2 frases)', max: 400, rows: 3 },
    { name: 'series', type: 'select', label: 'Série', options: { '': 'Sem série', ...seriesOptions } },
    { name: 'label', type: 'text', label: 'Rótulo na série (ex.: Ep. 3, #2, Final)', max: 30 },
    { name: 'order', type: 'number', label: 'Ordem dentro da série', integer: true, min: 0, max: 999, empty: 0 },
    { name: 'status', type: 'select', label: 'Estado', options: episodeStatus, required: true, help: 'Marque “disponível” somente quando o vídeo estiver publicado no YouTube. A data, sozinha, não muda o estado.' },
    { name: 'date', type: 'datetime', label: 'Data e horário (Brasília)', help: 'Data da transmissão ou da publicação. Para agendados, o horário previsto.' },
    { name: 'durationMin', type: 'number', label: 'Duração (minutos)', integer: true, min: 0, max: 1000, empty: 0 },
    { name: 'topics', type: 'checks', label: 'Temas', options: TOPICS },
    { name: 'id', type: 'slug', label: 'Endereço da página (identificador)', help: 'Parte final do endereço: /episodios/este-identificador', required: true },
  ];
}

const series = [
  { name: 'name', type: 'text', label: 'Nome da série', max: 80, required: true },
  { name: 'tagline', type: 'text', label: 'Frase de apoio', max: 140 },
  { name: 'description', type: 'textarea', label: 'Descrição', max: 900, rows: 4 },
  { name: 'cover', type: 'image', label: 'Capa (16:9)' },
  { name: 'playlist', type: 'playlist', label: 'Link da playlist no YouTube', help: 'Opcional. Deve conter “list=”.' },
  { name: 'order', type: 'number', label: 'Ordem de exibição', integer: true, min: 0, max: 999, empty: 0 },
  { name: 'published', type: 'bool', label: 'Exibir no site' },
  { name: 'slug', type: 'slug', label: 'Endereço da página (identificador)', required: true },
];

const host = [
  { name: 'name', type: 'text', label: 'Nome', max: 80, required: true },
  { name: 'role', type: 'text', label: 'Atuação (linha abaixo do nome)', max: 120 },
  { name: 'summary', type: 'textarea', label: 'Resumo para os cartões', max: 320, rows: 3 },
  { name: 'bio', type: 'paragraphs', label: 'Biografia', max: 6000, rows: 12, help: 'Separe os parágrafos com uma linha em branco.' },
  { name: 'highlight', type: 'textarea', label: 'Texto em destaque (opcional)', max: 400, rows: 2 },
  { name: 'topics', type: 'lines', label: 'Temas abordados (um por linha)', maxItems: 10, maxEach: 80, rows: 4 },
  { name: 'books', type: 'lines', label: 'Livros (um por linha)', maxItems: 10, maxEach: 160, rows: 3 },
  { name: 'instagram', type: 'url', label: 'Instagram' },
  { name: 'tiktok', type: 'url', label: 'TikTok' },
  { name: 'kwai', type: 'url', label: 'Kwai' },
  { name: 'inviteNote', type: 'text', label: 'Orientação para convites', max: 240 },
  { name: 'photo', type: 'image', label: 'Foto principal (retrato)', required: true },
  { name: 'heroPhoto', type: 'image', label: 'Foto da abertura da página inicial', required: true },
  { name: 'gallery', type: 'images', label: 'Galeria (até 4 fotos)', maxItems: 4 },
  { name: 'featured', type: 'videoRefs', label: 'Conteúdos selecionados (links ou IDs do YouTube, um por linha)', maxItems: 6, rows: 4 },
];

const home = [
  { name: 'heroEyebrow', type: 'text', label: 'Linha acima do título', max: 80 },
  { name: 'heroTitle', type: 'text', label: 'Título principal', max: 140, required: true },
  { name: 'heroText', type: 'textarea', label: 'Texto de apoio', max: 400, rows: 3 },
  { name: 'heroCta', type: 'text', label: 'Texto do botão principal', max: 30, required: true },
  { name: 'featuredSeries', type: 'lines', label: 'Séries em destaque (identificadores, um por linha, na ordem)', maxItems: 8, maxEach: 90, rows: 5 },
  { name: 'showPaths', type: 'bool', label: 'Mostrar “Por onde começar”' },
  { name: 'showShop', type: 'bool', label: 'Mostrar apresentação da loja' },
];

const metrics = [
  { name: 'enabled', type: 'bool', label: 'Exibir números de audiência no site' },
  { name: 'value1', type: 'text', label: 'Número 1 (como aparece no site)', max: 40 },
  { name: 'label1', type: 'text', label: 'Descrição do número 1', max: 60 },
  { name: 'raw1', type: 'text', label: 'Valor exato observado (interno)', max: 60 },
  { name: 'value2', type: 'text', label: 'Número 2 (como aparece no site)', max: 40 },
  { name: 'label2', type: 'text', label: 'Descrição do número 2', max: 60 },
  { name: 'raw2', type: 'text', label: 'Valor exato observado (interno)', max: 60 },
  { name: 'observedAt', type: 'text', label: 'Data da observação (AAAA-MM-DD)', max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: 'Use o formato AAAA-MM-DD.', required: true },
  { name: 'reference', type: 'text', label: 'Referência exibida no site', max: 120, help: 'Ex.: Dados do YouTube observados em setembro de 2026.' },
  { name: 'source', type: 'text', label: 'Fonte (interno)', max: 200 },
];

const site = [
  { name: 'description', type: 'textarea', label: 'Descrição do site (buscadores e compartilhamento)', max: 300, rows: 3 },
  { name: 'youtube', type: 'url', label: 'YouTube do Office Cast' },
  { name: 'instagram', type: 'url', label: 'Instagram do Office Cast' },
  { name: 'instagramCortes', type: 'url', label: 'Instagram de cortes' },
  { name: 'spotify', type: 'url', label: 'Spotify (deixe vazio até haver link confirmado)' },
  { name: 'email', type: 'email', label: 'E-mail público de contato (opcional)' },
  { name: 'phone', type: 'text', label: 'Telefone/WhatsApp público (opcional)', max: 30 },
  { name: 'contactEnabled', type: 'bool', label: 'Ativar formulário de contato' },
];

function pathSchema() {
  return [
    { name: 'title', type: 'text', label: 'Título (ex.: Quero recomeçar)', max: 80, required: true },
    { name: 'lead', type: 'text', label: 'Frase de apoio', max: 160 },
    { name: 'episodes', type: 'videoRefs', label: 'Episódios (links ou IDs do YouTube, um por linha)', maxItems: 12, rows: 6, help: 'Só aparecem no site os episódios cadastrados como “disponíveis”. Se nenhum estiver disponível, o caminho fica oculto.' },
    { name: 'order', type: 'number', label: 'Ordem', integer: true, min: 0, max: 99, empty: 0 },
    { name: 'slug', type: 'slug', label: 'Endereço da página (identificador)', required: true },
  ];
}

const PRODUCT_CATEGORIES = { blusas: 'Blusas e camisetas', livros: 'Livros', canecas: 'Canecas', colecoes: 'Futuras coleções' };
const AVAILABILITY = { indisponivel: 'Indisponível', em_breve: 'Em breve', sob_encomenda: 'Sob encomenda', disponivel: 'Disponível' };

const product = [
  { name: 'name', type: 'text', label: 'Nome do produto', max: 120, required: true },
  { name: 'description', type: 'textarea', label: 'Descrição', max: 2000, rows: 5 },
  { name: 'category', type: 'select', label: 'Categoria', options: PRODUCT_CATEGORIES, required: true },
  { name: 'collection', type: 'text', label: 'Coleção/linha (ex.: Linha Office Cast, Série Raízes)', max: 80 },
  { name: 'photos', type: 'images', label: 'Fotografias', maxItems: 8 },
  { name: 'price', type: 'money', label: 'Preço (R$)', help: 'Deixe vazio até o preço ser aprovado.' },
  { name: 'sizes', type: 'lines', label: 'Tamanhos (um por linha)', maxItems: 12, maxEach: 20, rows: 3 },
  { name: 'colors', type: 'lines', label: 'Cores (uma por linha)', maxItems: 12, maxEach: 40, rows: 3 },
  { name: 'sizeChart', type: 'textarea', label: 'Tabela de medidas', max: 2000, rows: 5, help: 'Uma linha por tamanho, ex.: P — tórax 50 cm, comprimento 70 cm' },
  { name: 'availability', type: 'select', label: 'Disponibilidade', options: AVAILABILITY, required: true },
  { name: 'stock', type: 'number', label: 'Estoque (unidades)', integer: true, min: 0, max: 100000, empty: null },
  { name: 'weightGrams', type: 'number', label: 'Peso para envio (gramas)', integer: true, min: 0, max: 100000, empty: null },
  { name: 'dimensions', type: 'text', label: 'Dimensões da embalagem (C × L × A, em cm)', max: 40 },
  { name: 'status', type: 'select', label: 'Estado', options: { rascunho: 'Rascunho (não aparece no site)', publicado: 'Publicado na vitrine' }, required: true },
  { name: 'slug', type: 'slug', label: 'Identificador', required: true },
];

const shop = [
  { name: 'title', type: 'text', label: 'Título da loja', max: 80, required: true },
  { name: 'intro', type: 'textarea', label: 'Texto de apresentação', max: 500, rows: 3 },
  { name: 'waitlistEnabled', type: 'bool', label: 'Ativar cadastro de aviso de lançamento' },
];

module.exports = { live, episode, series, host, home, metrics, site, pathSchema, product, shop, PRODUCT_CATEGORIES, AVAILABILITY };
