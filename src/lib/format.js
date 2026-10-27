// Pure helpers: the company clock, the words we use, technician form rules and money. No DOM here.

// ---------- the company's clock ----------
// Times are shown in the company's timezone (reported at sign-in), not the computer's: a dispatcher travelling must still see "10:00" for a 10:00 visit.

let zone = 'UTC';
export const setZone = (value) => { zone = value || 'UTC'; };
export const getZone = () => zone;

const parts = (instant, options) => new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }).formatToParts(instant);
const pick = (list, type) => list.find((p) => p.type === type)?.value;

export const formatTime = (iso) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '-');
export const formatDay = (iso) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)) : '-');
export const formatDateTime = (iso) => (iso ? `${formatDay(iso)}, ${formatTime(iso)}` : '-');

export function todayIn() {
  const p = parts(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${pick(p, 'year')}-${pick(p, 'month')}-${pick(p, 'day')}`;
}
export const dayOf = (iso) => {
  const p = parts(new Date(iso), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${pick(p, 'year')}-${pick(p, 'month')}-${pick(p, 'day')}`;
};
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

function offsetAt(instant) {
  const name = pick(parts(instant, { timeZoneName: 'longOffset' }), 'timeZoneName') || 'GMT';
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return { text: '+00:00', minutes: 0 };
  const minutes = (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === '-' ? -1 : 1);
  return { text: `${match[1]}${match[2]}:${match[3] || '00'}`, minutes };
}

// The timezone-aware text the API wants for a wall-clock time in the company's zone: ("2026-10-20", "09:30") -> "2026-10-20T09:30:00-04:00".
export function zonedIso(day, time) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let offset = offsetAt(new Date(guess));
  offset = offsetAt(new Date(guess - offset.minutes * 60000));
  return `${day}T${time}:00${offset.text}`;
}

export const percent = (share) => (share === null || share === undefined ? '-' : `${Math.round(share * 100)}%`);
export const hours = (minutes) => (minutes / 60).toFixed(1);
export function span(minutes) {
  const m = Math.abs(Math.round(minutes));
  return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function lateness(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes === 0) return 'on time';
  return minutes > 0 ? `${span(minutes)} late` : `${span(minutes)} early`;
}
export function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

// ---------- the words ----------

export const PROGRESS = {
  scheduled: ['Booked', 'info'], en_route: ['On the way', 'warn'], arrived: ['On site', 'warn'],
  completed: ['Done', 'good'], pending: ['Needs a technician', 'neutral'], cancelled: ['Cancelled', 'bad'],
};
export const STATUS = {
  NEW: ['New', 'neutral'], QUALIFYING: ['Being qualified', 'neutral'], QUALIFIED: ['Ready to schedule', 'info'],
  APPOINTMENT_BOOKED: ['Booked', 'info'], IN_PROGRESS: ['In progress', 'warn'], COMPLETED: ['Completed', 'good'], CANCELLED: ['Cancelled', 'bad'],
};
export const PRIORITIES = ['low', 'normal', 'high', 'emergency'];
export const CHANNELS = { webhook: 'Chat webhook', telegram: 'Telegram', email: 'Email', sms: 'Text message' };
export const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
export const REASONS = {
  technician_removed: 'The technician was removed', technician_unavailable: 'The technician is unavailable', no_shift_that_day: 'No shift that day',
  outside_shift: 'Outside the shift', overlaps_break: 'Overlaps a break', missing_skill: 'Skill no longer matches', outside_service_area: 'Area no longer covered',
  invalid_credential: 'Licence no longer valid', travel_conflict: 'Not enough travel time', invalid_booking: 'Booking needs a check',
  no_technician: 'No technician available', no_feasible_qualified_technician: 'No qualified technician can take it', no_feasible_schedule: 'No schedule fits',
  emergency_escalation_required: 'Emergency: a person must handle it', commitment_infeasible: 'An existing booking no longer holds',
  running_late: 'The technician is running late',
};
export const reasonText = (code) => REASONS[code] || String(code).replaceAll('_', ' ');

export const short = (id) => String(id).slice(0, 8);

// ---------- technician form rules (kept pure so they are easy to check) ----------

export const parseList = (text, lower = false) => [...new Set(String(text || '').split(',').map((s) => (lower ? s.trim().toLowerCase() : s.trim())).filter(Boolean))];

export function buildShifts({ from, days, weekdays, start, end }) {
  const shifts = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    if (weekdays.includes(weekdayOf(date))) shifts.push({ date, start: zonedIso(date, start), end: zonedIso(date, end), available: true });
  }
  return shifts;
}

export function shiftProblems({ from, days, weekdays, start, end }) {
  const out = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) out.push('Choose the first day.');
  if (!Number.isInteger(days) || days < 1 || days > 60) out.push('Days must be between 1 and 60.');
  if (!weekdays.length) out.push('Choose at least one weekday.');
  if (!/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) out.push('Enter the start and end times.');
  else if (start >= end) out.push('The shift must end after it starts.');
  return out;
}

// ---------- money (whole minor units: paise/cents; no float ever touches an amount) ----------

// "1,234.50" -> 123450. Anything that is not a plain amount with at most two decimals gives null.
export function parseMoney(text) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(text ?? '').trim().replaceAll(',', ''));
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : null;
}

// "18" or "5.5" (percent) -> basis points 1800 / 550. At most 100% with two decimals, else null.
export function parsePercent(text) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(text ?? '').trim());
  const bps = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : null;
  return bps !== null && bps <= 10000 ? bps : null;
}

export function formatMinor(minor, currency) {
  const sign = minor < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(minor) / 100).toLocaleString('en-US');
  return `${sign}${whole}.${String(Math.abs(minor) % 100).padStart(2, '0')} ${currency || ''}`.trim();
}

export const minorToInput = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
export const bpsToInput = (bps) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2));

// A fresh key for each new payment action: a retry of THE SAME action reuses it, so money is never taken twice.
export const newKey = () => `k-${(globalThis.crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).replaceAll('-', '').slice(0, 30)}`;
