/* Office Cast — comportamento do site público (aprimoramento progressivo: tudo funciona sem JS) */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  // ----- cabeçalho sobre a abertura: fundo sólido após rolar ou com o menu aberto -----
  var header = document.querySelector('.site-header--overlay');
  var menuOpen = false;
  var updateHeader = function () {
    if (header) header.classList.toggle('is-solid', menuOpen || window.scrollY > 24);
  };
  if (header) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; updateHeader(); });
    }, { passive: true });
    updateHeader();
  }

  // ----- menu no celular -----
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('menu-principal');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
      menuOpen = open;
      updateHeader();
    };
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
    });
  }

  // ----- player do YouTube: só carrega quando o visitante pede -----
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-yt]');
    if (!link) return;
    var id = link.getAttribute('data-yt');
    if (!ID_RE.test(id)) return; // segurança: aceita apenas identificadores válidos
    e.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
    frame.title = 'Player do YouTube: ' + (link.getAttribute('data-title') || 'vídeo do Office Cast');
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.setAttribute('allowfullscreen', '');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.loading = 'eager';
    link.replaceWith(frame);
    frame.focus();
  });

  // ----- foco na mensagem de resultado de formulários -----
  var result = document.getElementById('resultado');
  if (result) { try { result.focus({ preventScroll: false }); } catch (err) { result.focus(); } }
})();
