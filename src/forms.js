'use strict';
// Validação de formulários a partir de esquemas declarativos.
// O mesmo esquema é usado para validar no servidor e para desenhar o formulário do painel.
const { parseLocalDateTime } = require('./time');
const { parseYouTubeUrl, parsePlaylistUrl, isVideoId } = require('./youtube');

const IMG_SRC_RE = /^\/(static\/img|media)\/[A-Za-z0-9/_.-]{1,200}\.(jpg|jpeg|png|webp)$/;

function str(v) {
  if (Array.isArray(v)) v = v[v.length - 1];
  return v === undefined || v === null ? '' : String(v);
}

// Remove caracteres de controle (mantém quebras de linha)
function clean(v) {
  return str(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function validImage(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const src = String(obj.src || '');
  if (!IMG_SRC_RE.test(src) || src.includes('..')) return null;
  const w = Math.round(Number(obj.w)); const h = Math.round(Number(obj.h));
  if (!(w > 0 && w < 20000 && h > 0 && h < 20000)) return null;
  const variants = Array.isArray(obj.variants)
    ? obj.variants.filter((v) => v && IMG_SRC_RE.test(String(v.src || '')) && !String(v.src).includes('..') && Number(v.w) > 0)
      .slice(0, 6).map((v) => ({ src: String(v.src), w: Math.round(Number(v.w)) }))
    : [];
  return { src, w, h, alt: clean(obj.alt).slice(0, 220), variants: variants.length ? variants : [{ src, w }] };
}

function parseJson(v) {
  try { return JSON.parse(str(v) || 'null'); } catch { return undefined; }
}

const validators = {
  text(f, raw) {
    const v = clean(raw).replace(/\n+/g, ' ');
    if (v.length > (f.max || 200)) return { error: `Use no máximo ${f.max || 200} caracteres.` };
    if (f.pattern && v && !f.pattern.test(v)) return { error: f.patternMessage || 'Formato inválido.' };
    return { value: v };
  },
  textarea(f, raw) {
    const v = clean(raw);
    if (v.length > (f.max || 2000)) return { error: `Use no máximo ${f.max || 2000} caracteres.` };
    return { value: v };
  },
  paragraphs(f, raw) {
    const v = clean(raw);
    if (v.length > (f.max || 6000)) return { error: `Use no máximo ${f.max || 6000} caracteres.` };
    return { value: v ? v.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : [] };
  },
  lines(f, raw) {
    const items = clean(raw).split('\n').map((s) => s.trim()).filter(Boolean);
    if (items.length > (f.maxItems || 30)) return { error: `Use no máximo ${f.maxItems || 30} itens.` };
    if (items.some((s) => s.length > (f.maxEach || 160))) return { error: `Cada item pode ter até ${f.maxEach || 160} caracteres.` };
    return { value: items };
  },
  url(f, raw) {
    const v = clean(raw);
    if (!v) return { value: '' };
    if (v.length > 400 || /\s|[<>"']/.test(v)) return { error: 'Link inválido.' };
    let u;
    try { u = new URL(v); } catch { return { error: 'Link inválido. Ele deve começar com https://' }; }
    if (!['https:', 'http:'].includes(u.protocol)) return { error: 'O link deve começar com https://' };
    return { value: u.toString() };
  },
  email(f, raw) {
    const v = clean(raw).toLowerCase();
    if (!v) return { value: '' };
    if (v.length > 160 || !/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(v)) return { error: 'E-mail inválido.' };
    return { value: v };
  },
  number(f, raw) {
    const s = clean(raw).replace(',', '.');
    if (!s) return { value: f.empty === undefined ? null : f.empty };
    const n = Number(s);
    if (!Number.isFinite(n)) return { error: 'Informe um número.' };
    if (f.integer && !Number.isInteger(n)) return { error: 'Informe um número inteiro.' };
    if (f.min !== undefined && n < f.min) return { error: `O mínimo é ${f.min}.` };
    if (f.max !== undefined && n > f.max) return { error: `O máximo é ${f.max}.` };
    return { value: n };
  },
  money(f, raw) {
    const s = clean(raw).replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
    if (!s) return { value: null };
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return { error: 'Informe o valor como 89,90.' };
    return { value: Math.round(Number(s) * 100) }; // centavos
  },
  select(f, raw) {
    const v = clean(raw);
    if (!v && !f.required) return { value: f.empty !== undefined ? f.empty : '' };
    if (!Object.prototype.hasOwnProperty.call(f.options, v)) return { error: 'Escolha uma opção válida.' };
    return { value: v };
  },
  checks(f, raw) {
    const vals = [].concat(raw === undefined ? [] : raw).map(clean).filter(Boolean);
    if (vals.some((v) => !Object.prototype.hasOwnProperty.call(f.options, v))) return { error: 'Opção inválida.' };
    return { value: [...new Set(vals)] };
  },
  bool(f, raw) {
    return { value: str(raw) === 'on' || str(raw) === '1' || str(raw) === 'true' };
  },
  datetime(f, raw) {
    const v = clean(raw);
    if (!v) return { value: '' };
    const d = parseLocalDateTime(v);
    if (!d) return { error: 'Data e horário inválidos.' };
    return { value: d.toISOString() };
  },
  slug(f, raw) {
    const v = clean(raw).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) || v.length > 90) return { error: 'Use apenas letras minúsculas, números e hífens (ex.: minha-serie).' };
    return { value: v };
  },
  youtube(f, raw) {
    const v = clean(raw);
    if (!v && !f.required) return { value: '' };
    const r = parseYouTubeUrl(v);
    return r.error ? { error: r.error } : { value: r.id };
  },
  playlist(f, raw) {
    const r = parsePlaylistUrl(clean(raw));
    return r.error ? { error: r.error } : { value: r.id };
  },
  videoRefs(f, raw) {
    const ids = [];
    for (const line of clean(raw).split('\n').map((s) => s.trim()).filter(Boolean)) {
      const r = parseYouTubeUrl(line);
      if (r.error) return { error: `Linha inválida: “${line.slice(0, 60)}”. ${r.error}` };
      ids.push(r.id);
    }
    if (ids.length > (f.maxItems || 30)) return { error: `Use no máximo ${f.maxItems || 30} vídeos.` };
    return { value: [...new Set(ids)] };
  },
  image(f, raw) {
    const s = str(raw).trim();
    if (!s) return { value: null };
    const obj = parseJson(s);
    const img = validImage(obj);
    if (!img) return { error: 'Imagem inválida. Envie novamente.' };
    return { value: img };
  },
  images(f, raw) {
    const s = str(raw).trim();
    if (!s) return { value: [] };
    const arr = parseJson(s);
    if (!Array.isArray(arr)) return { error: 'Lista de imagens inválida.' };
    const out = arr.map(validImage);
    if (out.some((x) => !x)) return { error: 'Uma das imagens é inválida. Envie novamente.' };
    if (out.length > (f.maxItems || 8)) return { error: `Use no máximo ${f.maxItems || 8} imagens.` };
    return { value: out };
  },
};

function validate(fields, body) {
  const values = {};
  const errors = {};
  for (const f of fields) {
    if (f.type === 'heading' || f.readonly) continue;
    const fn = validators[f.type];
    if (!fn) throw new Error(`Tipo de campo desconhecido: ${f.type}`);
    const r = fn(f, body[f.name]);
    if (r.error) { errors[f.name] = r.error; continue; }
    const empty = r.value === '' || r.value === null || (Array.isArray(r.value) && r.value.length === 0);
    if (f.required && empty) { errors[f.name] = 'Campo obrigatório.'; continue; }
    values[f.name] = r.value;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

module.exports = { validate, validators, validImage, slugify, isVideoId, clean };
