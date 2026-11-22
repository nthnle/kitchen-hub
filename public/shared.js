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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// Chores with no days set happen every day.
function choresForToday(chores, date = new Date()) {
  const dow = date.getDay();
  return chores.filter((c) => !c.days || !c.days.length || c.days.includes(dow));
}

function personColor(people, name) {
  return (people.find((p) => p.name === name) || {}).color || '#8a8f98';
}
