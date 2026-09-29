export const SALON_TIME_ZONE = 'America/Sao_Paulo';
export const SALON_NAME = 'VS Instituto de Beleza';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date (YYYY-MM-DD) in the salon's time zone, not UTC. */
export const salonToday = () => isoFormatter.format(new Date());

export const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

const dateAt = (value: string) => new Date(`${value}T12:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options });

export const money = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const capitalizeFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const displayDate = (value: string) =>
  capitalizeFirst(fmt({ weekday: 'long', day: '2-digit', month: 'long' }).format(dateAt(value)));

export const shortDate = (value: string) => fmt({ day: '2-digit', month: '2-digit' }).format(dateAt(value));

export const weekdayShort = (value: string) =>
  fmt({ weekday: 'short' }).format(dateAt(value)).replace('.', '');

export const monthShort = (value: string) =>
  fmt({ month: 'short' }).format(dateAt(value)).replace('.', '');

export const relativeDay = (value: string) => {
  const today = salonToday();
  if (value === today) return 'Hoje';
  if (value === addDays(today, 1)) return 'Amanhã';
  return null;
};

export const duration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** Formats a Brazilian phone while the person types: (27) 99999-9999. */
export const formatPhoneInput = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidPhone = (value: string) => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

export const whatsappLink = (phone: string, message?: string) => {
  const digits = onlyDigits(phone);
  if (digits.length < 10) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
};

/** Extracts the friendly message returned by the API, if any. */
export const apiErrorMessage = (error: unknown, fallback: string) => {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === 'string' && data.error ? data.error : fallback;
};

export const apiErrorStatus = (error: unknown) =>
  (error as { status?: number } | null)?.status ?? null;

type CalendarEvent = { title: string; date: string; time: string; minutes: number; details: string };

const stamp = (date: string, time: string, plusMinutes = 0) => {
  const [hours, minutes] = time.split(':').map(Number);
  const total = hours * 60 + minutes + plusMinutes;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${date.replace(/-/g, '')}T${hh}${mm}00`;
};

export const googleCalendarUrl = (event: CalendarEvent) => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.date, event.time)}/${stamp(event.date, event.time, event.minutes)}`,
    ctz: SALON_TIME_ZONE,
    details: event.details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const downloadIcs = (event: CalendarEvent, fileName: string) => {
  const escape = (value: string) => value.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VS Instituto//Agendamento//PT',
    'BEGIN:VEVENT',
    `UID:${fileName}@vs-instituto`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=${SALON_TIME_ZONE}:${stamp(event.date, event.time)}`,
    `DTEND;TZID=${SALON_TIME_ZONE}:${stamp(event.date, event.time, event.minutes)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.details)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const LAST_CODE_KEY = 'vs:last-booking-code';

export const rememberCode = (code: string) => {
  try {
    localStorage.setItem(LAST_CODE_KEY, code);
  } catch {
    /* storage unavailable: nothing to do */
  }
};

export const lastCode = () => {
  try {
    return localStorage.getItem(LAST_CODE_KEY) ?? '';
  } catch {
    return '';
  }
};

export const formatCode = (code: string) => {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.startsWith('VS') && clean.length > 2 ? `VS-${clean.slice(2)}` : clean;
};
