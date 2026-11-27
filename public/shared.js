// Helpers used by both the display and the phone page.

// "Tap" on touch screens, "Click" with a mouse or touchpad.
const TAP = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
const api = {
  async get(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async send(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// An "Add again" button with a small ✕ beside it that forgets the item.
const quickChip = (text, onAdd, onForget) => el('span', { class: 'quick-pair' },
  el('button', { class: 'quick-chip', onclick: onAdd }, `+ ${text}`),
  el('button', { class: 'quick-forget', title: `Stop suggesting “${text}”`, 'aria-label': `Stop suggesting ${text}`, onclick: onForget }, '✕'));

const DAY_NAMES =['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- countdowns ----------
// Next date a countdown falls on (yearly ones roll over to next year once passed).
function countdownDate(c, today = new Date()) {
  const [y, m, d] = c.date.split('-').map(Number);
  if (!c.yearly) return new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  return next;
}
function daysUntil(date, today = new Date()) {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / 864e5);
}
function daysLabel(n) {
  return n === 0 ? 'Today! 🎉' : n === 1 ? 'Tomorrow' : `${n} days`;
}
// Upcoming countdowns, soonest first.
function upcomingCountdowns(list, today = new Date()) {
  return (list || [])
    .map((c) => { const when = countdownDate(c, today); return { ...c, when, days: daysUntil(when, today) }; })
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
}

// ---------- weather alerts ----------
function activeAlerts(alerts) {
  return (alerts || []).filter((a) => !a.ends || new Date(a.ends).getTime() > Date.now());
}
const isSevere = (a) => a.severity === 'Extreme' || a.severity === 'Severe';
function untilText(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();
  if (ymd(d) === ymd(now)) return `until ${time}`;
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  if (ymd(d) === ymd(tmr)) return `until ${time} tomorrow`;
  return `until ${DAY_NAMES[d.getDay()]} ${time}`;
}
// One banner per alert; tap to show the full National Weather Service text.
function alertBanners(alerts) {
  return activeAlerts(alerts).map((a) => {
    const sev = (a.severity || 'unknown').toLowerCase();
    const details = el('div', { class: 'alert-details', hidden: true },
      a.description ? el('p', {}, a.description) : null,
      a.instruction ? el('p', {}, el('b', {}, 'What to do: '), a.instruction) : null,
      el('p', { class: 'alert-src' }, 'National Weather Service'));
    const more = el('span', { class: 'alert-more' }, `${TAP} for details`);
    const toggle = (e) => {
      details.hidden = !details.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!details.hidden));
      more.textContent = details.hidden ? `${TAP} for details` : `${TAP} to close`;
    };
    return el('div', { class: `alert sev-${sev}`, role: 'alert' },
      el('button', { class: 'alert-line', 'aria-expanded': 'false', onclick: toggle },
        el('span', { class: 'alert-icon' }, isSevere(a) ? '⚠️' : 'ℹ️'),
        el('b', {}, a.event),
        el('span', { class: 'alert-until' }, untilText(a.ends)),
        more),
      details);
  });
}

// Chores with no days set happen every day; one with a date happens that day, and rolls over
// to each next day until someone checks it off. Trash goes out the evening before pickup, and
// still shows on pickup morning (until noon) if nobody did it.
// Late ones come first, then tonight's trash.
function choresForToday(chores, date = new Date()) {
  const dow = date.getDay();
  const day = ymd(date);
  const shown = chores.filter((c) => {
    if (c.pickup) return c.date === day || (c.pickup === day && date.getHours() < 12 && (!c.doneOn || c.doneOn === day));
    if (c.date) return c.date === day || (c.date < day && (!c.doneOn || c.doneOn === day));
    return !c.days || !c.days.length || c.days.includes(dow);
  });
  const rank = (c) => (c.date && c.date < day ? 0 : c.pickup ? 1 : 2);
  return shown.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}
// One-time chores set for tomorrow, shown grayed out under today's so you can see they were added.
// (Repeating chores and trash aren't included; they'd just repeat today's list.)
function choresForTomorrow(chores, date = new Date()) {
  const t = new Date(date); t.setDate(t.getDate() + 1);
  const day = ymd(t);
  return chores.filter((c) => c.date === day && !c.pickup);
}
// "from yesterday", "from Sat", "from Nov 14" for a chore carried over; "pickup today" for missed trash.
function lateLabel(c, today = new Date()) {
  const day = ymd(today);
  if (!c.date || c.date >= day) return '';
  if (c.pickup) return 'pickup today';
  const d = new Date(`${c.date}T12:00`);
  const n = Math.round((new Date(`${day}T12:00`) - d) / 864e5);
  return n === 1 ? 'from yesterday' : n < 7 ? `from ${DAY_NAMES[d.getDay()]}`
    : `from ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

// How often a chore happens, in words: "Daily", "Mon Wed", "Tomorrow only", "Sat, Nov 28 only".
function choreWhen(c, today = new Date()) {
  if (c.date) {
    const d = new Date(`${c.date}T12:00`);
    const n = Math.round((d - new Date(`${ymd(today)}T12:00`)) / 864e5);
    return n === 0 ? 'Today only' : n === 1 ? 'Tomorrow only' : n < 0 ? (c.doneOn ? 'Done (one time)' : `Not done yet, ${lateLabel(c, today)}`)
      : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} only`;
  }
  return c.days && c.days.length ? c.days.map((d) => DAY_NAMES[d]).join(' ') : 'Daily';
}

// The "When" control on chore forms: repeat on weekdays, or just once (today, tomorrow, a date).
function whenPicker({ select, days, date, hint, today = () => new Date() }) {
  const dayStr = (n) => { const d = today(); d.setDate(d.getDate() + n); return ymd(d); };
  select.replaceChildren(
    el('option', { value: 'repeat' }, 'Every week'),
    el('option', { value: 'today' }, 'Just today'),
    el('option', { value: 'tomorrow' }, 'Just tomorrow'),
    el('option', { value: 'date' }, 'Just once, on a date…'));
  const sync = () => {
    days.hidden = select.value !== 'repeat';
    if (hint) hint.hidden = select.value !== 'repeat';
    date.hidden = select.value !== 'date';
    date.required = select.value === 'date';
  };
  select.addEventListener('change', () => {
    date.min = dayStr(0);
    if (select.value === 'date' && !date.value) date.value = dayStr(2);
    sync();
  });
  const checks = () => [...days.querySelectorAll('input')];
  const picker = {
    // The fields to send: { days } for a repeating chore, { days: [], date } for a one-time one.
    get() {
      const v = select.value;
      if (v === 'repeat') return { days: checks().filter((i) => i.checked).map((i) => Number(i.value)) };
      return { days: [], date: v === 'today' ? dayStr(0) : v === 'tomorrow' ? dayStr(1) : date.value };
    },
    set(c) {
      checks().forEach((i) => { i.checked = !c.date && (c.days || []).includes(Number(i.value)); });
      select.value = !c.date ? 'repeat' : c.date === dayStr(0) ? 'today' : c.date === dayStr(1) ? 'tomorrow' : 'date';
      date.value = select.value === 'date' ? c.date : '';
      // A late chore keeps its old date unless you change it.
      date.min = c.date && c.date < dayStr(0) ? c.date : dayStr(0);
      sync();
    },
    reset() { picker.set({}); },
  };
  sync();
  return picker;
}

// A leave-by time that's skipped on days with no school (older ones: anything with "school" in its name).
function schoolDeparture(d) {
  return d.school ?? /school/i.test(d.label);
}

function personColor(people, name) {
  return (people.find((p) => p.name === name) || {}).color || '#8a8f98';
}

// ---------- icons (inline SVG; static markup only) ----------
const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#E0952B" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="#FCE3B4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="#F6EEDC" stroke="#8A6A2F" stroke-width="1.6" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  partly: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="3.5" fill="#FCE3B4" stroke="#E0952B"/><path d="M8.5 2.5v1.3M2.5 8.5h1.3M4.3 4.3l.9.9M12.7 4.3l-.9.9" stroke="#E0952B"/><path d="M9 19.5h8.5a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 9.2 11.5 4 4 0 0 0 9 19.5z" fill="#F1ECE4" stroke="#8C8174"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="#F1ECE4" stroke="#8C8174" stroke-width="1.7" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.2 4.4 4.4 0 0 0 7 18z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="#2A6FAA" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.2 4.4 4.4 0 0 0 7 15z" fill="#E3EEF8"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.2 4.4 4.4 0 0 0 7 15z" fill="#E6E2EC" stroke="#6B6478"/><path d="M12.5 15l-2 3.5h3l-2 3.5" stroke="#E0952B"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.2 4.4 4.4 0 0 0 7 15z" fill="#EEF3F8" stroke="#7A8CA0"/><path d="M9 18.5v.01M12 20.5v.01M15 18.5v.01" stroke="#2A6FAA" stroke-width="2.6"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="#8C8174" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h16M6 12h12M4 16h16M8 20h8"/></svg>',
  umbrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v2M4 12a8 8 0 0 1 16 0z"/><path d="M12 12v6a2 2 0 0 0 4 0"/></svg>',
  coat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 3l4 2 4-2 4 3-2 4h-2v11H8V10H6L4 6z"/></svg>',
  heat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 10v6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4a1 1 0 0 1 1-1h9v18"/><path d="M15 3l4 2v16h-4M12 12v.5M3 21h18"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = `ico ${cls}`;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}
// Open-Meteo weather codes → icon.
function wxKind(code, night) {
  if (code === 0 || code === 1) return night ? 'moon' : 'sun';
  if (code === 2) return night ? 'cloud' : 'partly';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloud';
}
const WX_WORD = (code) => ({ sun: 'Sunny', moon: 'Clear', partly: 'Partly cloudy', cloud: 'Cloudy', rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Foggy' })[wxKind(code)];

// ---------- calendar helpers ----------
// Events on a given day from the latest state (S), all-day ones first.
function eventsOn(day) {
  const key = ymd(day);
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return S.calendar.events.filter((e) =>
    e.allDay ? e.start <= key && e.end > key : new Date(e.start) < end && new Date(e.end) > start
  ).sort((a, b) => (a.allDay === b.allDay ? (a.start < b.start ? -1 : 1) : a.allDay ? -1 : 1));
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase();
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
