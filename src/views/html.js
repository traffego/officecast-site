'use strict';
// Template HTML com escape automático: tudo que for interpolado é escapado,
// exceto valores criados com raw() ou retornados por outro html``.
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function flatten(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(flatten).join('');
  return esc(v);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += flatten(values[i]) + strings[i + 1];
  return new Raw(out);
}

const raw = (s) => new Raw(String(s));
const attrIf = (cond, name, value = '') => (cond ? raw(value === '' ? ` ${name}` : ` ${name}="${esc(value)}"`) : '');

module.exports = { html, raw, esc, Raw, attrIf };
