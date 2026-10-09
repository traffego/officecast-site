'use strict';
// Datas sempre exibidas e informadas no fuso America/Sao_Paulo.
// Armazenamento interno: ISO 8601 em UTC.
const TZ = 'America/Sao_Paulo';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function zonedParts(date) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second,
  };
}

// Diferença (ms) entre o horário local de São Paulo e UTC no instante informado.
function offsetMs(date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

// "2026-10-08T09:00" (horário de Brasília) -> Date (UTC). Retorna null se inválido.
function parseLocalDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(naive - offsetMs(new Date(naive)));
  guess = new Date(naive - offsetMs(guess)); // segunda passada cobre mudanças de horário
  const back = zonedParts(guess);
  if (back.year !== y || back.month !== mo || back.day !== d || back.hour !== h || back.minute !== mi) return null;
  return guess;
}

// Date/ISO -> "2026-10-08T09:00" para campos datetime-local
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = zonedParts(d);
  const z = (n) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const monthYearFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, month: 'long', year: 'numeric' });

const valid = (iso) => iso && !Number.isNaN(new Date(iso).getTime());

function formatDate(iso) { return valid(iso) ? dateFmt.format(new Date(iso)) : ''; }
function formatLongDate(iso) { return valid(iso) ? longDateFmt.format(new Date(iso)) : ''; }
function formatTime(iso) { return valid(iso) ? timeFmt.format(new Date(iso)).replace(':', 'h') : ''; }
function formatWeekday(iso) { return valid(iso) ? weekdayFmt.format(new Date(iso)) : ''; }
function formatMonthYear(iso) { return valid(iso) ? monthYearFmt.format(new Date(iso)) : ''; }
function formatDateTime(iso) { return valid(iso) ? `${formatDate(iso)} às ${formatTime(iso)}` : ''; }

function formatDuration(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return '';
  const total = Math.round(s / 60); // arredonda antes de separar (59 min 50 s = 1 h, não "60 min")
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

module.exports = {
  TZ, parseLocalDateTime, toLocalInput, formatDate, formatLongDate, formatTime, formatWeekday,
  formatMonthYear, formatDateTime, formatDuration, zonedParts,
};
