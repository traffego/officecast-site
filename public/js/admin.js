/* Painel do Office Cast: envio de imagens, confirmação de exclusões e busca de título no YouTube */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="csrf-token"]');
  var csrf = meta ? meta.getAttribute('content') : '';

  // ----- confirmações -----
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ----- editor de imagens -----
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  document.querySelectorAll('[data-images]').forEach(function (box) {
    var input = box.querySelector('[data-images-value]');
    var list = box.querySelector('[data-images-list]');
    var file = box.querySelector('[data-images-file]');
    var multiple = box.getAttribute('data-multiple') === '1';
    var status = el('p', { class: 'a-images__status', role: 'status' });
    box.appendChild(status);

    function read() {
      try {
        var v = JSON.parse(input.value || (multiple ? '[]' : 'null'));
        return multiple ? (Array.isArray(v) ? v : []) : (v ? [v] : []);
      } catch (err) { return []; }
    }
    function write(items) {
      input.value = multiple ? JSON.stringify(items) : (items[0] ? JSON.stringify(items[0]) : '');
      render();
    }
    function render() {
      list.textContent = '';
      read().forEach(function (img, i) {
        var li = el('li', { class: 'a-images__item' });
        var pic = el('img', { src: img.src, alt: '' });
        var altId = 'alt-' + Math.random().toString(36).slice(2);
        var lab = el('label', { for: altId }, 'Descrição da imagem (texto alternativo)');
        var alt = el('input', { id: altId, type: 'text', maxlength: '220' });
        alt.value = img.alt || '';
        alt.addEventListener('input', function () {
          var items = read(); items[i].alt = alt.value;
          input.value = multiple ? JSON.stringify(items) : JSON.stringify(items[0]);
        });
        var rm = el('button', { type: 'button', class: 'a-btn a-btn--danger a-btn--small' }, 'Remover');
        rm.addEventListener('click', function () { var items = read(); items.splice(i, 1); write(items); });
        li.appendChild(pic); li.appendChild(lab); li.appendChild(alt); li.appendChild(rm);
        list.appendChild(li);
      });
    }
    render();

    file.addEventListener('change', function () {
      var files = Array.prototype.slice.call(file.files || []);
      if (!files.length) return;
      status.textContent = 'Enviando…';
      var chain = Promise.resolve();
      var added = [];
      files.forEach(function (f) {
        chain = chain.then(function () {
          if (f.size > 5 * 1024 * 1024) throw new Error('“' + f.name + '” passa de 5 MB.');
          return fetch('/admin/upload', { method: 'POST', headers: { 'Content-Type': f.type, 'X-CSRF-Token': csrf }, body: f, credentials: 'same-origin' })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Falha no envio.'); return j; }); })
            .then(function (j) { added.push({ src: j.src, w: j.w, h: j.h, alt: '', variants: [{ src: j.src, w: j.w }] }); });
        });
      });
      chain.then(function () {
        write(multiple ? read().concat(added) : added.slice(-1));
        status.textContent = 'Imagem enviada. Preencha a descrição e clique em Salvar.';
      }).catch(function (err) {
        if (added.length) write(multiple ? read().concat(added) : added.slice(-1));
        status.textContent = 'Erro: ' + err.message;
      }).then(function () { file.value = ''; });
    });
  });

  // ----- buscar título no YouTube (cadastro de episódio e transmissão) -----
  var urlField = document.getElementById('f-url');
  var titleField = document.getElementById('f-title');
  if (urlField && titleField) {
    var btn = el('button', { type: 'button', class: 'a-btn a-btn--ghost a-btn--small a-fetch' }, 'Buscar título no YouTube');
    var out = el('p', { class: 'a-help', role: 'status' });
    urlField.insertAdjacentElement('afterend', out);
    urlField.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', function () {
      out.textContent = 'Consultando…';
      fetch('/admin/youtube-info?url=' + encodeURIComponent(urlField.value), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.error) { out.textContent = j.error; return; }
          if (j.ok && j.title) {
            if (!titleField.value) titleField.value = j.title;
            out.textContent = 'Vídeo encontrado: “' + j.title + '”' + (j.embeddable === false ? ' — atenção: não permite incorporação.' : '.');
          } else if (j.reason === 'not_found') out.textContent = 'O YouTube não encontrou esse vídeo (confira se é público ou não listado).';
          else out.textContent = 'Link válido (ID ' + j.id + '), mas não foi possível consultar o YouTube agora.';
        })
        .catch(function () { out.textContent = 'Não foi possível consultar agora.'; });
    });
  }
})();
