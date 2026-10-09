'use strict';
const { html, raw } = require('./html');
const t = require('../time');
const D = require('../domain');
const { watchUrl } = require('../youtube');
const { asset } = require('./layout');

const NAV = [
  ['/admin', 'Visão geral', 'painel'],
  ['/admin/transmissao', 'Transmissão', 'transmissao'],
  ['/admin/episodios', 'Episódios', 'episodios'],
  ['/admin/series', 'Séries', 'series'],
  ['/admin/apresentadores', 'Apresentadores', 'apresentadores'],
  ['/admin/inicio', 'Página inicial', 'inicio'],
  ['/admin/audiencia', 'Audiência', 'audiencia'],
  ['/admin/caminhos', 'Por onde começar', 'caminhos'],
  ['/admin/loja', 'Loja', 'loja'],
  ['/admin/mensagens', 'Mensagens', 'mensagens'],
  ['/admin/configuracoes', 'Configurações', 'configuracoes'],
];

function adminLayout({ title, nav = '', body, session, flash }) {
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | Painel Office Cast</title>
<link rel="icon" href="/static/img/marca/icone-32.png" sizes="32x32" type="image/png">
<link rel="stylesheet" href="${asset('css/admin.css')}">
${session ? html`<meta name="csrf-token" content="${session.csrf}">` : ''}
<script src="${asset('js/admin.js')}" defer></script>
</head>
<body class="admin">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${session ? html`<header class="a-header">
  <a class="a-brand" href="/admin"><img src="/static/img/marca/office-cast-logo.png" width="360" height="219" alt="Office Cast"><span>Painel</span></a>
  <nav class="a-nav" aria-label="Seções do painel"><ul>${NAV.map(([href, label, key]) => html`<li><a href="${href}"${key === nav ? raw(' aria-current="page"') : ''}>${label}</a></li>`)}</ul></nav>
  <div class="a-user">
    <a href="/" target="_blank" rel="noopener">Ver site</a>
    <form method="post" action="/admin/sair"><input type="hidden" name="_csrf" value="${session.csrf}"><button type="submit" class="a-btn a-btn--ghost">Sair</button></form>
  </div>
</header>` : ''}
<main id="conteudo" class="a-main" tabindex="-1">
${flash ? html`<div class="a-flash a-flash--${flash.type}" role="${flash.type === 'error' ? 'alert' : 'status'}">${flash.text}</div>` : ''}
${body}
</main>
</body>
</html>`.toString();
}

function login({ error = '', user = '' } = {}) {
  return adminLayout({
    title: 'Entrar',
    body: html`<section class="a-login">
      <img src="/static/img/marca/office-cast-logo.png" width="360" height="219" alt="Office Cast">
      <h1>Painel do Office Cast</h1>
      ${error ? html`<p class="a-flash a-flash--error" role="alert">${error}</p>` : ''}
      <form method="post" action="/admin/entrar" class="a-form">
        <div class="a-field"><label for="u">Usuário</label><input id="u" name="usuario" autocomplete="username" required value="${user}"></div>
        <div class="a-field"><label for="p">Senha</label><input id="p" name="senha" type="password" autocomplete="current-password" required></div>
        <button class="a-btn" type="submit">Entrar</button>
      </form>
    </section>`,
  });
}

function setupNeeded() {
  return adminLayout({
    title: 'Configuração necessária',
    body: html`<section class="a-login"><h1>Senha do painel não configurada</h1>
      <p>Por segurança, o painel só funciona depois que uma senha é criada no servidor.</p>
      <p>No computador onde o site está instalado, execute <strong>“Trocar senha do painel.bat”</strong> (pasta Site) ou o comando <code>node tools/criar-senha.js</code> dentro da pasta <code>app</code>. Depois reinicie o site.</p>
    </section>`,
  });
}

// ---------- campos ----------

function imageEditor(name, value, multiple) {
  const json = value ? JSON.stringify(value) : (multiple ? '[]' : '');
  return html`<div class="a-images" data-images data-multiple="${multiple ? '1' : '0'}">
    <input type="hidden" name="${name}" value="${json}" data-images-value>
    <ul class="a-images__list" data-images-list></ul>
    <label class="a-btn a-btn--ghost a-images__add">${multiple ? 'Adicionar imagens' : 'Enviar imagem'}
      <input type="file" accept="image/jpeg,image/png,image/webp"${multiple ? raw(' multiple') : ''} data-images-file class="visually-hidden"></label>
    <p class="a-help">JPEG, PNG ou WebP até 5 MB. Prefira imagens já otimizadas (até 1600 px de largura).</p>
    <noscript><p class="a-help">É preciso JavaScript para enviar imagens.</p></noscript>
  </div>`;
}

function field(f, values, errors) {
  const id = `f-${f.name}`;
  const v = values[f.name];
  const err = errors[f.name];
  const desc = [f.help ? `${id}-h` : '', err ? `${id}-e` : ''].filter(Boolean).join(' ');
  const aria = raw(`${desc ? ` aria-describedby="${desc}"` : ''}${err ? ' aria-invalid="true"' : ''}`);
  const req = f.required ? raw(' required') : '';
  let control;
  switch (f.type) {
    case 'textarea': case 'paragraphs': case 'lines': case 'videoRefs': {
      let text = v;
      if (Array.isArray(v)) text = v.join(f.type === 'paragraphs' ? '\n\n' : '\n');
      control = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${req}${aria}>${text || ''}</textarea>`;
      break;
    }
    case 'select':
      control = html`<select id="${id}" name="${f.name}"${req}${aria}>${Object.entries(f.options).map(([k, l]) => html`<option value="${k}"${String(v ?? '') === k ? raw(' selected') : ''}>${l}</option>`)}</select>`;
      break;
    case 'checks':
      return html`<fieldset class="a-field${err ? ' a-field--error' : ''}"><legend>${f.label}</legend>
        <div class="a-checks">${Object.entries(f.options).map(([k, l]) => html`<label><input type="checkbox" name="${f.name}" value="${k}"${(v || []).includes(k) ? raw(' checked') : ''}> ${l}</label>`)}</div>
        ${err ? html`<p class="a-error" id="${id}-e">${err}</p>` : ''}</fieldset>`;
    case 'bool':
      return html`<div class="a-field a-field--check"><input id="${id}" type="checkbox" name="${f.name}" value="on"${v ? raw(' checked') : ''}><label for="${id}">${f.label}</label></div>`;
    case 'datetime':
      control = html`<input id="${id}" type="datetime-local" name="${f.name}" value="${t.toLocalInput(v)}"${req}${aria}>`;
      break;
    case 'number': case 'money':
      control = html`<input id="${id}" type="text" inputmode="decimal" name="${f.name}" value="${v ?? ''}"${req}${aria}>`;
      break;
    case 'image': case 'images':
      return html`<div class="a-field${err ? ' a-field--error' : ''}"><span class="a-label">${f.label}${f.required ? ' *' : ''}</span>
        ${imageEditor(f.name, v, f.type === 'images')}
        ${f.help ? html`<p class="a-help" id="${id}-h">${f.help}</p>` : ''}
        ${err ? html`<p class="a-error" id="${id}-e">${err}</p>` : ''}</div>`;
    default: {
      const type = f.type === 'email' ? 'email' : 'text';
      control = html`<input id="${id}" type="${type}" name="${f.name}" value="${v ?? ''}"${f.max ? raw(` maxlength="${f.max}"`) : ''}${req}${aria}>`;
    }
  }
  return html`<div class="a-field${err ? ' a-field--error' : ''}">
    <label for="${id}">${f.label}${f.required ? ' *' : ''}</label>
    ${control}
    ${f.help ? html`<p class="a-help" id="${id}-h">${f.help}</p>` : ''}
    ${err ? html`<p class="a-error" id="${id}-e">${err}</p>` : ''}
  </div>`;
}

function formPage({ session, flash, nav, title, intro = '', fields, values = {}, errors = {}, action, submit = 'Salvar', extra = '', after = '', back = '' }) {
  const hasErr = Object.keys(errors).length > 0;
  return adminLayout({
    title, nav, session, flash: hasErr ? { type: 'error', text: 'Não foi possível salvar. Revise os campos destacados.' } : flash,
    body: html`<div class="a-page">
      ${back ? html`<p class="a-back"><a href="${back}">← Voltar</a></p>` : ''}
      <h1>${title}</h1>
      ${intro ? html`<p class="a-intro">${intro}</p>` : ''}
      ${extra}
      <form method="post" action="${action}" class="a-form" novalidate>
        <input type="hidden" name="_csrf" value="${session.csrf}">
        ${fields.map((f) => field(f, values, errors))}
        <div class="a-actions"><button class="a-btn" type="submit">${submit}</button></div>
      </form>
      ${after}
    </div>`,
  });
}

function deleteForm(session, action, label = 'Excluir', confirmText = 'Tem certeza? Esta ação não pode ser desfeita.') {
  return html`<form method="post" action="${action}" class="a-inline" data-confirm="${confirmText}">
    <input type="hidden" name="_csrf" value="${session.csrf}"><button class="a-btn a-btn--danger a-btn--small" type="submit">${label}</button></form>`;
}

// ---------- páginas ----------

function dashboard({ session, flash, c, subs, now }) {
  const warnings = D.adminWarnings(c, now);
  const v = D.liveView(c.live, now);
  const eps = c.episodes || [];
  const count = (st) => eps.filter((e) => e.status === st).length;
  return adminLayout({
    title: 'Visão geral', nav: 'painel', session, flash,
    body: html`<div class="a-page">
      <h1>Visão geral</h1>
      ${warnings.length ? html`<section class="a-warn" aria-label="Avisos"><h2>Atenção</h2><ul>${warnings.map((w) => html`<li>${w}</li>`)}</ul></section>` : ''}
      <div class="a-cards">
        <a class="a-card" href="/admin/transmissao"><span class="a-card__k">Transmissão em destaque</span>
          <span class="a-card__v">${v.kind === 'empty' ? 'Nenhuma' : v.badge}</span>
          <span class="a-card__d">${v.kind === 'empty' ? 'Nenhum vídeo configurado' : v.title}</span></a>
        <a class="a-card" href="/admin/episodios"><span class="a-card__k">Episódios</span>
          <span class="a-card__v">${eps.length}</span><span class="a-card__d">${count('disponivel')} disponíveis · ${count('agendado')} agendados · ${count('indisponivel')} indisponíveis</span></a>
        <a class="a-card" href="/admin/mensagens"><span class="a-card__k">Mensagens de contato</span>
          <span class="a-card__v">${(subs.contact || []).length}</span><span class="a-card__d">${(subs.waitlist || []).length} cadastro(s) no aviso da loja</span></a>
        <a class="a-card" href="/admin/loja"><span class="a-card__k">Loja</span>
          <span class="a-card__v">Em breve</span><span class="a-card__d">${(c.products || []).length} produto(s) cadastrado(s)</span></a>
      </div>
      <section class="a-box"><h2>Atalhos</h2><ul class="a-links">
        <li><a href="/admin/transmissao">Trocar o link da live</a></li>
        <li><a href="/admin/episodios/novo">Cadastrar episódio</a></li>
        <li><a href="/admin/audiencia">Atualizar números de audiência</a></li>
      </ul></section>
    </div>`,
  });
}

function liveExtra({ session, c, now, check }) {
  const v = D.liveView(c.live, now);
  return html`<section class="a-box a-live">
    <h2>Como está no site agora</h2>
    ${v.kind === 'empty' ? html`<p>Nenhum vídeo em destaque. O site mostra o episódio mais recente na página inicial e uma mensagem de “nenhuma transmissão” na página Assista.</p>`
      : html`<p><strong>${v.badge}</strong>: ${v.title || '(sem título)'}</p>
        <p class="a-help">Vídeo: <a href="${watchUrl(v.videoId)}" target="_blank" rel="noopener">${watchUrl(v.videoId)}</a>${v.embeddable === false ? ' (o YouTube informou que este vídeo não permite incorporação: o site mostra um link para assistir no YouTube)' : ''}</p>`}
    ${check ? html`<p class="a-help">${check}</p>` : ''}
    ${v.kind !== 'empty' ? html`<div class="a-quick">
      <form method="post" action="/admin/transmissao/estado"><input type="hidden" name="_csrf" value="${session.csrf}"><input type="hidden" name="status" value="ao_vivo"><button class="a-btn a-btn--small" type="submit">Marcar “ao vivo agora”</button></form>
      <form method="post" action="/admin/transmissao/estado"><input type="hidden" name="_csrf" value="${session.csrf}"><input type="hidden" name="status" value="replay"><button class="a-btn a-btn--small a-btn--ghost" type="submit">Encerrar (virar replay)</button></form>
      <form method="post" action="/admin/transmissao/remover" data-confirm="Remover o vídeo em destaque?"><input type="hidden" name="_csrf" value="${session.csrf}"><button class="a-btn a-btn--small a-btn--danger" type="submit">Remover destaque</button></form>
    </div>` : ''}
  </section>`;
}

function listPage({ session, flash, nav, title, intro = '', newHref = '', newLabel = 'Adicionar', columns, rows, empty = 'Nada cadastrado ainda.', extra = '' }) {
  return adminLayout({
    title, nav, session, flash,
    body: html`<div class="a-page">
      <div class="a-page__head"><h1>${title}</h1>${newHref ? html`<a class="a-btn" href="${newHref}">${newLabel}</a>` : ''}</div>
      ${intro ? html`<p class="a-intro">${intro}</p>` : ''}
      ${extra}
      ${rows.length ? html`<div class="a-table-wrap"><table class="a-table"><thead><tr>${columns.map((col) => html`<th scope="col">${col}</th>`)}</tr></thead>
        <tbody>${rows.map((r) => html`<tr>${r.map((cell) => html`<td>${cell}</td>`)}</tr>`)}</tbody></table></div>`
        : html`<p class="a-empty">${empty}</p>`}
    </div>`,
  });
}

function messages({ session, flash, subs, subjects, categories }) {
  const contact = [...(subs.contact || [])].reverse();
  const wait = [...(subs.waitlist || [])].reverse();
  return adminLayout({
    title: 'Mensagens', nav: 'mensagens', session, flash,
    body: html`<div class="a-page">
      <h1>Mensagens</h1>
      <p class="a-intro">Mensagens enviadas pelos formulários do site. Elas ficam salvas no servidor; não há envio automático por e-mail nesta versão.</p>
      <section class="a-box"><div class="a-page__head"><h2>Contato (${contact.length})</h2>${contact.length ? html`<a class="a-btn a-btn--ghost a-btn--small" href="/admin/mensagens/contato.csv">Exportar CSV</a>` : ''}</div>
        ${contact.length ? html`<ul class="a-msgs">${contact.map((m) => html`<li class="a-msg">
          <p class="a-msg__head"><strong>${m.nome}</strong> · <a href="mailto:${m.email}">${m.email}</a>${m.telefone ? ` · ${m.telefone}` : ''}</p>
          <p class="a-msg__meta">${subjects[m.assunto] || m.assunto} · ${t.formatDateTime(m.at)}</p>
          <p class="a-msg__body">${m.mensagem}</p>
          ${deleteForm(session, `/admin/mensagens/contato/${m.id}/excluir`, 'Excluir mensagem')}
        </li>`)}</ul>` : html`<p class="a-empty">Nenhuma mensagem recebida.</p>`}
      </section>
      <section class="a-box"><div class="a-page__head"><h2>Aviso de lançamento da loja (${wait.length})</h2>${wait.length ? html`<a class="a-btn a-btn--ghost a-btn--small" href="/admin/mensagens/aviso.csv">Exportar CSV</a>` : ''}</div>
        ${wait.length ? html`<div class="a-table-wrap"><table class="a-table"><thead><tr><th scope="col">E-mail</th><th scope="col">Nome</th><th scope="col">Interesses</th><th scope="col">Data</th><th scope="col"><span class="visually-hidden">Ações</span></th></tr></thead><tbody>
          ${wait.map((w) => html`<tr><td>${w.email}</td><td>${w.nome || '—'}</td><td>${(w.interesses || []).map((k) => categories[k] || k).join(', ') || '—'}</td><td>${t.formatDateTime(w.at)}</td><td>${deleteForm(session, `/admin/mensagens/aviso/${w.id}/excluir`, 'Excluir')}</td></tr>`)}
        </tbody></table></div>` : html`<p class="a-empty">Nenhum cadastro.</p>`}
      </section>
    </div>`,
  });
}

function simple({ session, flash, nav, title, body }) {
  return adminLayout({ title, nav, session, flash, body: html`<div class="a-page"><h1>${title}</h1>${body}</div>` });
}

module.exports = { adminLayout, login, setupNeeded, formPage, listPage, dashboard, liveExtra, messages, deleteForm, simple, field };
