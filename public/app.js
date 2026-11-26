// Kitchen display.
let S = null; // latest state from the server
let lastVersion = 0;

// ---------- time ----------
// Add ?at=2026-11-23T07:12 to the address to preview another time of day.
const AT = new URLSearchParams(location.search).get('at');
const timeOffset = AT && !isNaN(new Date(AT)) ? new Date(AT).getTime() - Date.now() : 0;
const now = () => new Date(Date.now() + timeOffset);

const fmtClock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtHour = (d) => d.toLocaleTimeString([], { hour: 'numeric' }).replace(' ', ' ');
const fmtLongDate = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShortDate = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const clockParts = (d) => { const [t, ap] = fmtClock(d).split(' '); return { t, ap: ap || '' }; };

// ---------- tabs ----------
let currentView = 'home';
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tabs button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.body.classList.toggle('on-home', name === 'home');
  if (name === 'home') renderHome();
  else { document.body.classList.remove('night'); updateDecor(); }
}
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.action === 'frame' ? startFrame(true) : showView(b.dataset.view)))
);

// ---------- modes ----------
// Morning, day, evening and night each get their own Home screen.
const MODE_TIMES = { morning: '6:00', weekendMorning: '8:00', day: '10:00', evening: '17:00', night: '22:00' };
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h + (m || 0) / 60; };
function modeAt(d) {
  const t = { ...MODE_TIMES, ...((S && S.modes) || {}) };
  const h = d.getHours() + d.getMinutes() / 60;
  const start = hm(d.getDay() % 6 === 0 ? t.weekendMorning : t.morning);
  if (h >= hm(t.night) || h < start) return 'night';
  if (h < hm(t.day)) return 'morning';
  if (h < hm(t.evening)) return 'day';
  return 'evening';
}
// Dusk: from sunset to sunrise the whole screen uses warm, dark colors.
function isDusk(d) {
  const mins = d.getHours() * 60 + d.getMinutes();
  const at = (iso, fallback) => { if (!iso) return fallback; const t = new Date(iso); return t.getHours() * 60 + t.getMinutes(); };
  const sunset = at(wx && wx.daily.sunset[0], 18 * 60);
  const sunrise = at(wx && wx.daily.sunrise[0], 6 * 60 + 30);
  return mins >= sunset || mins < sunrise;
}
function applyTheme() {
  document.body.classList.toggle('dusk', isDusk(now()));
}
let wokeAt = 0; // a tap at night shows the day screen until the screen is left alone again
function currentMode() {
  const m = modeAt(now());
  if (m === 'night' && (wokeAt || severeAlertActive())) return 'day';
  return m;
}

// ---------- calendar helpers ----------
function untilLabel(mins) {
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `in ${h} hr ${m} min` : `in ${h} hr`;
}

// ---------- undo ----------
// Removing a note or checking something off shows "… · Undo" for a few seconds.
let undoState = null;
const hiddenNotes = new Set(); // notes removed on this screen but not yet deleted (still undoable)
function showUndo(label, undo, commit = () => {}) {
  if (undoState) finishUndo();
  const toast = document.getElementById('toast');
  const btn = el('button', { class: 'toast-undo', onclick: () => doUndo() }, 'Undo');
  toast.replaceChildren(el('span', {}, label), btn, el('kbd', { class: 'toast-key' }, 'Ctrl+Z'));
  toast.hidden = false;
  undoState = { undo, commit, timer: setTimeout(finishUndo, 7000) };
}
function finishUndo() {
  if (!undoState) return;
  clearTimeout(undoState.timer);
  const { commit } = undoState;
  undoState = null;
  document.getElementById('toast').hidden = true;
  commit();
}
function doUndo() {
  if (!undoState) return;
  clearTimeout(undoState.timer);
  const { undo } = undoState;
  undoState = null;
  document.getElementById('toast').hidden = true;
  undo();
}
function removeNote(n) {
  hiddenNotes.add(n.id);
  renderAll();
  showUndo('Note removed', () => { hiddenNotes.delete(n.id); renderAll(); },
    () => act(() => api.send('DELETE', `/api/notes/${n.id}`)).then(() => hiddenNotes.delete(n.id)));
}
function toggleChore(c) {
  const wasDone = S.doneToday.includes(c.id);
  act(() => api.send('POST', `/api/chores/${c.id}/toggle`));
  showUndo(`“${c.title}” ${wasDone ? 'unchecked' : 'checked off'}`, () => act(() => api.send('POST', `/api/chores/${c.id}/toggle`)));
}
function toggleGrocery(g) {
  act(() => api.send('POST', `/api/grocery/${g.id}/toggle`));
  showUndo(`“${g.text}” ${g.done ? 'unchecked' : 'checked off'}`, () => act(() => api.send('POST', `/api/grocery/${g.id}/toggle`)));
}

// ---------- event details ----------
function openEvent(e) {
  const dlg = document.getElementById('event-dialog');
  const start = e.allDay ? new Date(`${e.start}T00:00`) : new Date(e.start);
  const end = e.allDay ? new Date(`${e.end}T00:00`) : new Date(e.end);
  let when;
  if (e.allDay) {
    const last = addDays(end, -1);
    when = ymd(last) === ymd(start) ? `${fmtLongDate(start)} · All day` : `${fmtShortDate(start)} – ${fmtShortDate(last)} · All day`;
  } else {
    when = `${fmtLongDate(start)} · ${fmtClock(start)} – ${fmtClock(end)}`;
  }
  dlg.replaceChildren(...[
    el('div', { class: 'ev-head', style: `--c:${e.color || '#C2502A'}` }, el('span', { class: 'ev-dot' }), el('h2', {}, e.title)),
    el('p', { class: 'ev-when' }, when),
    el('p', { class: 'muted' }, [e.person, e.calendar].filter(Boolean).join(' · ')),
    e.location ? el('p', { class: 'ev-loc' }, el('b', {}, 'Where: '), e.location) : null,
    e.description ? el('p', { class: 'ev-desc' }, e.description) : null,
    el('form', { method: 'dialog' }, el('button', { class: 'ev-close' }, 'Close'), el('span', { class: 'muted small' }, ' or press Esc')),
  ].filter(Boolean)); // replaceChildren would print a missing item as the word "null"
  dlg.showModal();
}
const eventAttrs = (e) => ({ onclick: (ev) => { ev.stopPropagation(); openEvent(e); }, title: 'Show details' });

// ---------- quick-add groceries ----------
function quickAdd(max) {
  const items = (S.recentGroceries || []).slice(0, max);
  if (!items.length) return null;
  return el('div', { class: 'quick' }, el('span', { class: 'quick-label' }, 'Add again:'),
    items.map((t) => el('button', { class: 'quick-chip', onclick: () => act(() => api.send('POST', '/api/grocery', { text: t })) }, `+ ${t}`)));
}

// ---------- shared pieces ----------
function notesNodes() {
  return (S.notes || []).filter((n) => !hiddenNotes.has(n.id)).slice().reverse().map((n) =>
    el('div', { class: 'note', style: n.from ? `--c:${personColor(S.people, n.from)}` : '' },
      el('span', { class: 'note-dot' }),
      el('div', { class: 'note-body' },
        el('div', { class: 'note-text' }, n.text),
        el('div', { class: 'note-meta' }, [n.from, timeAgo(n.created)].filter(Boolean).join(' · '))),
      el('button', { class: 'note-x', 'aria-label': 'Remove note', onclick: () => removeNote(n) }, icon('x'))))
    .concat(el('button', { class: 'note-add', onclick: openNoteDialog }, '+ Add a note'));
}
// Post a note from the kitchen screen (the "+ Add a note" button, or press N).
const noteDialog = document.getElementById('note-dialog');
function openNoteDialog() {
  const from = document.getElementById('na-from');
  from.replaceChildren(el('option', { value: '' }, 'From: nobody'), ...S.people.map((p) => el('option', { value: p.name }, `From: ${p.name}`)));
  document.getElementById('note-add').reset();
  noteDialog.showModal();
  document.getElementById('na-text').focus();
}
document.getElementById('note-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('na-text');
  const text = input.value.trim();
  if (!text) return input.focus();
  noteDialog.close();
  act(() => api.send('POST', '/api/notes', {
    text, from: document.getElementById('na-from').value, days: Number(document.getElementById('na-days').value),
  }));
});
document.getElementById('na-cancel').addEventListener('click', () => noteDialog.close());
noteDialog.addEventListener('click', (e) => { if (e.target === noteDialog) noteDialog.close(); }); // tap outside to cancel
// Your own countdowns plus the big holidays from the calendar (yours win if both land on the same day).
function countdownList(max = 5) {
  const mine = upcomingCountdowns(S.countdowns, now());
  const taken = new Set(mine.map((c) => ymd(c.when)));
  // Lunar New Year isn't on every holiday calendar, so it comes from holidays.js too.
  const cal = S.calendar.holidays || [];
  const y = now().getFullYear();
  const lunar = S.holidayDecor === false ? [] : [y, y + 1].map((yr) => LUNAR_NEW_YEAR[yr]).filter(Boolean)
    .filter((date) => !cal.some((h) => h.date === date)).map((date) => ({ title: 'Lunar New Year', date }));
  const holidays = upcomingCountdowns([...cal, ...lunar].filter((h) => !taken.has(h.date)), now());
  return [...mine, ...holidays].sort((a, b) => a.days - b.days).filter((c) => c.days <= S.countdownDays).slice(0, max);
}
function countdownCard(max = 3) {
  const title = 'Coming up';
  const list = countdownList(max);
  if (!list.length) return null;
  return el('section', { class: 'card-w' }, el('h2', {}, title),
    list.map((c) => el('div', { class: 'cd-row' },
      el('div', {}, el('div', { class: 'cd-title' }, c.title), el('div', { class: 'muted small' }, fmtShortDate(c.when))),
      el('div', { class: 'cd-days' }, daysLabel(c.days)))));
}
// What's still on the grocery list, as one short card for the day screen; click it to open the list.
function groceryCard() {
  const left = S.grocery.filter((g) => !g.done);
  if (!left.length) return null;
  return el('button', { class: 'card-w groc-card', onclick: () => showView('grocery') },
    el('div', { class: 'tl-top' }, el('h2', {}, 'Grocery list'), el('span', { class: 'muted' }, `${left.length} to get`)),
    el('div', { class: 'groc-line' }, left.map((g) => g.text).join(' · ')));
}
// Your chores plus the trash nights from config.json.
const allChores = () => [...S.chores, ...(S.trash || [])];
// "from Sat" on a chore carried over from an earlier day.
function lateTag(c) {
  const t = lateLabel(c, now());
  return t ? el('span', { class: 'late-tag' }, t) : null;
}
function choreStats() {
  const todays = choresForToday(allChores(), now());
  const names = S.people.map((p) => p.name);
  // Chores for "Everyone" (or someone no longer in the family list) get their own row at the end.
  const groups = [...S.people.map((p) => ({ ...p, mine: todays.filter((c) => c.person === p.name) })),
    { name: 'Everyone', color: '#8C8174', everyone: true, mine: todays.filter((c) => !names.includes(c.person)) }];
  return groups.map((g) => {
    const left = g.mine.filter((c) => !S.doneToday.includes(c.id));
    return { ...g, total: g.mine.length, done: g.mine.length - left.length, left, stars: S.stars[g.name] || 0 };
  }).filter((p) => p.total);
}
function ring(color, frac) {
  const c = 2 * Math.PI * 15;
  const s = document.createElement('span');
  s.className = 'ring';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" style="stroke:var(--track)" stroke-width="4"/>` +
    (frac > 0 ? `<circle cx="18" cy="18" r="15" fill="none" stroke="${/^#[0-9a-f]{3,8}$/i.test(color) ? color : '#999'}" stroke-width="4" stroke-linecap="round" ` +
    `stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 18 18)"/>` : '') + '</svg>';
  return s;
}
function choresCard() {
  const stats = choreStats();
  if (!stats.length) return null;
  // What's left under each person; click one to check it off. fitChores() trims the list to the space there is.
  return el('section', { class: 'card-w chores-home' }, el('h2', {}, 'Chores today'),
    stats.map((p) => el('div', { class: 'chore-group', style: `--c:${p.color}` },
      el('button', { class: 'ring-row', onclick: () => showView('chores') },
        ring(p.color, p.done / p.total),
        el('span', { class: 'ring-text' }, el('b', {}, p.name), el('span', { class: 'muted' }, p.done === p.total ? 'All done' : `${p.done} of ${p.total} done`)),
        p.everyone ? null : el('span', { class: 'stars' }, `★ ${p.stars}`)),
      p.left.map((c) => el('button', { class: 'mini-chore', onclick: () => toggleChore(c) },
        el('span', { class: 'mini-check' }), el('span', {}, c.title, lateTag(c)))),
      el('button', { class: 'mini-more', hidden: true, onclick: () => showView('chores') }))));
}
// Hide chores (from whoever has the most showing) until the Home column fits, adding "+N more".
function fitChores() {
  const card = document.querySelector('#view-home .chores-home');
  if (!card) {
    // No chores card: still leave out cards at the bottom of the side column rather than cut one in half.
    const side = document.querySelector('#view-home .side');
    for (let next = side && side.lastElementChild; next && next !== side.firstElementChild && side.scrollHeight > side.clientHeight + 1; next = next.previousElementSibling) next.style.display = 'none';
    return;
  }
  const col = card.parentElement;
  const overflowing = () => col.scrollHeight > col.clientHeight + 1 || card.scrollHeight > card.clientHeight + 1;
  const groups = [...card.querySelectorAll('.chore-group')];
  for (let guard = 0; guard < 200 && overflowing(); guard++) {
    const shown = (g) => [...g.querySelectorAll('.mini-chore:not([hidden])')];
    // Swapping someone's only chore for "+1 more" saves no space, so leave those alone.
    const canTrim = groups.filter((x) => shown(x).length > 1 || (shown(x).length === 1 && x.querySelector('.mini-chore[hidden]')));
    if (!canTrim.length) break;
    const g = canTrim.reduce((best, x) => (shown(x).length >= shown(best).length ? x : best), canTrim[0]);
    const vis = shown(g);
    vis[vis.length - 1].hidden = true;
    const more = g.querySelector('.mini-more');
    more.hidden = false;
    more.textContent = `+${g.querySelectorAll('.mini-chore[hidden]').length} more`;
  }
  // Still too tall: drop "+N more" where nothing is listed (the "1 of 3 done" line already says it).
  for (const g of groups) {
    if (!overflowing()) break;
    if (!g.querySelector('.mini-chore:not([hidden])')) g.querySelector('.mini-more').hidden = true;
  }
  // Last resort: leave out the cards below the chores rather than show them cut in half.
  for (let next = col.lastElementChild; next && next !== card && overflowing(); next = next.previousElementSibling) next.style.display = 'none';
  // Then someone's only chore, from the bottom up (their "0 of 1 done" line still says it).
  for (const c of [...card.querySelectorAll('.mini-chore:not([hidden])')].reverse()) {
    if (!overflowing()) break;
    c.hidden = true;
  }
  // And finally the cards above the chores (but not the notes).
  for (let prev = card.previousElementSibling; prev && !prev.classList.contains('notes') && overflowing(); prev = prev.previousElementSibling) prev.style.display = 'none';
}

// ---------- leave-by countdown ----------
function nextDeparture(d) {
  const dow = d.getDay(), mins = d.getHours() * 60 + d.getMinutes();
  let best = null;
  const noSchool = (S.calendar.noSchool || []).includes(ymd(d));
  for (const dep of S.departures || []) {
    if (dep.days && dep.days.length && !dep.days.includes(dow)) continue;
    if (noSchool && schoolDeparture(dep)) continue;
    const [h, m] = dep.time.split(':').map(Number);
    const at = h * 60 + m, left = at - mins;
    if (left < -5) continue; // "Time to go!" stays up for 5 minutes, then it's gone
    if (!best || at < best.at) best = { ...dep, at, left };
  }
  return best;
}
function departureBanner(mode) {
  const dep = nextDeparture(now());
  if (!dep) return null;
  // Mornings show the next departure up to 3 hours ahead; other times, the last hour.
  const showWithin = mode === 'morning' ? 180 : 60;
  if (dep.left > showWithin) return null;
  const at = new Date(now()); at.setHours(Math.floor(dep.at / 60), dep.at % 60, 0, 0);
  const late = dep.left <= 0;
  return el('section', { class: `leave${dep.left <= 10 ? ' soon' : ''}` },
    el('div', { class: 'leave-text' },
      el('span', { class: 'leave-label' }, `${dep.label} · leave by ${fmtClock(at)}`),
      el('span', { class: 'leave-head' }, late ? 'Time to go!' : 'Out the door in')),
    late ? icon('door', 'leave-ico') : el('div', { class: 'leave-num' }, el('b', {}, dep.left), el('span', {}, 'min')));
}

// ---------- weather data + advice ----------
let wx = null; // { cur, daily, hourly, aqi, units }
const RAIN_MIN = 20;
const toUnits = (f) => (wx && wx.units === 'celsius' ? Math.round(((f - 32) * 5) / 9) : f);
function hourlyFrom(d) {
  if (!wx) return [];
  return wx.hourly.time.map((t, i) => ({ t: new Date(t), p: wx.hourly.precipitation_probability[i] ?? 0, temp: wx.hourly.temperature_2m[i] }))
    .filter((h) => ymd(h.t) === ymd(d) && h.t.getTime() > d.getTime() - 3600e3);
}
function rainOutlook(d) {
  const left = hourlyFrom(d);
  if (!left.length) return '';
  const peak = left.reduce((a, b) => (b.p > a.p ? b : a));
  if (peak.p < RAIN_MIN) return 'No rain expected today';
  const first = left.find((h) => h.p >= RAIN_MIN);
  const word = peak.p >= 60 ? 'likely' : 'possible';
  if (first.t <= d) return `Rain ${word} now · ${peak.p}% at ${fmtHour(peak.t)}`;
  return `Rain ${word} from ${fmtHour(first.t)} · up to ${peak.p}%`;
}
// Plain-language tips from today's forecast, e.g. "Rain likely from 2 PM — pack umbrellas".
function weatherAdvice(d, mode) {
  if (!wx) return [];
  const out = [];
  const rest = hourlyFrom(d).filter((h) => h.t.getHours() <= 21);
  const wet = rest.find((h) => h.p >= 50), maybe = rest.find((h) => h.p >= 30);
  if (wet) out.push({ ico: 'umbrella', b: wet.t <= d ? 'Rain likely now' : `Rain likely from ${fmtHour(wet.t)}`, r: '— pack umbrellas' });
  else if (maybe) out.push({ ico: 'umbrella', b: `Chance of rain from ${fmtHour(maybe.t)}`, r: '— maybe bring an umbrella' });
  const next3 = rest.slice(0, 3).map((h) => h.temp);
  const low = next3.length ? Math.min(...next3) : wx.cur.temperature_2m;
  const high = wx.daily.temperature_2m_max[0];
  const start = mode === 'morning' ? 'start' : 'out';
  if (low <= toUnits(32)) out.push({ ico: 'coat', b: 'Freezing', r: '— coats, hats and gloves' });
  else if (low <= toUnits(45)) out.push({ ico: 'coat', b: `Cold ${start}`, r: '— warm coats' });
  else if (low <= toUnits(60)) out.push({ ico: 'coat', b: `Cool ${start}`, r: '— bring a jacket' });
  if (high >= toUnits(95)) out.push({ ico: 'heat', b: 'Hot today', r: '— water bottles and shade' });
  else if (high - low >= (wx.units === 'celsius' ? 11 : 20)) out.push({ ico: 'heat', b: `Warming up to ${Math.round(high)}°`, r: '— dress in layers' });
  if ((wx.daily.uv_index_max[0] ?? 0) >= 8 && d.getHours() < 16) out.push({ ico: 'heat', b: 'Strong sun', r: '— sunscreen and hats' });
  if (wx.aqi != null && wx.aqi > 100) out.push({ ico: 'leaf', b: 'Poor air quality', r: '— keep outdoor play short' });
  return out.slice(0, 3);
}
function tomorrowAdvice() {
  if (!wx || wx.daily.time.length < 2) return [];
  const out = [];
  const p = wx.daily.precipitation_probability_max[1] ?? 0;
  if (p >= 50) out.push({ ico: 'umbrella', b: 'Rain likely tomorrow', r: `— ${p}% chance` });
  else if (p >= 30) out.push({ ico: 'umbrella', b: 'Chance of rain tomorrow', r: `— ${p}%` });
  if (wx.daily.temperature_2m_min[1] <= toUnits(45)) out.push({ ico: 'coat', b: 'Cold morning', r: '— have coats ready' });
  if (wx.daily.temperature_2m_max[1] >= toUnits(95)) out.push({ ico: 'heat', b: 'Hot tomorrow', r: '— pack water bottles' });
  return out;
}
const adviceList = (items) => (items.length
  ? el('ul', { class: 'advice' }, items.map((a) => el('li', {}, icon(a.ico), el('span', {}, el('b', {}, a.b), ` ${a.r}`))))
  : null);

// ---------- Home: day ("Today first") ----------
// Lays out today's timed events on a timeline; overlapping events share the width.
function timeline(d) {
  const all = eventsOn(d);
  const allDay = all.filter((e) => e.allDay);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  const nowH = d.getHours() + d.getMinutes() / 60;
  // Show from two hours ago to the evening (at least 9 hours), so each hour gets room.
  const ends = all.filter((e) => !e.allDay).map((e) => Math.min(24, (new Date(e.end) - dayStart) / 3600e3));
  const to = Math.min(24, Math.max(21, ...ends.map(Math.ceil)));
  const from = Math.max(0, Math.min(Math.max(6, Math.floor(nowH) - 2), to - 9));
  const timed = all.filter((e) => !e.allDay)
    .map((e) => ({ e, s: (new Date(e.start) - dayStart) / 3600e3, f: Math.min(24, (new Date(e.end) - dayStart) / 3600e3) }))
    .filter((x) => x.f > from) // finished before the timeline starts: leave it off
    .map((x) => { const s = Math.max(from, x.s); return { e: x.e, s, f: Math.max(x.f, s + 0.5) }; });
  const span = to - from;
  const pct = (h) => `${(((h - from) / span) * 100).toFixed(2)}%`;
  // Overlap groups: each event gets a column within its group.
  timed.sort((a, b) => a.s - b.s);
  let group = [], groupEnd = -1;
  const flush = () => { const cols = Math.max(...group.map((x) => x.col)) + 1; group.forEach((x) => { x.cols = cols; }); group = []; };
  for (const x of timed) {
    if (x.s >= groupEnd && group.length) flush();
    const used = group.filter((g) => g.f > x.s).map((g) => g.col);
    x.col = 0; while (used.includes(x.col)) x.col++;
    group.push(x); groupEnd = Math.max(groupEnd, x.f);
  }
  if (group.length) flush();

  const lines = [];
  for (let h = from; h <= to; h++) {
    const lab = new Date(dayStart); lab.setHours(h);
    const nearNow = Math.abs(h - nowH) < 0.4; // the "now" time label takes its place
    lines.push(el('div', { class: 'tl-hour', style: `top:${pct(h)}` }, el('span', {}, h === 24 || nearNow ? '' : fmtHour(lab))));
  }
  const blocks = timed.map((x) => {
    const past = x.f <= nowH, live = x.s <= nowH && nowH < x.f;
    const left = `calc(5.2rem + (100% - 5.2rem) * ${x.col / x.cols})`;
    const width = `calc((100% - 5.2rem) / ${x.cols} - 0.4rem)`;
    const short = x.f - x.s < 0.8 ? ' short' : ''; // under ~45 min: one compact line
    return el('button', { class: `tl-ev${past ? ' past' : ''}${short}`, ...eventAttrs(x.e), style: `--c:${x.e.color || '#C2502A'};top:${pct(x.s)};height:calc(${pct(x.f)} - ${pct(x.s)} - 4px);left:${left};width:${width}` },
      el('div', { class: 'tl-ev-text' }, el('b', {}, x.e.title), el('span', {}, `${fmtTime(x.e.start)} – ${fmtTime(x.e.end)}`)),
      live ? el('span', { class: 'now-tag' }, 'Now') : null);
  });
  const nowLine = nowH >= from && nowH <= to
    ? el('div', { class: 'tl-now', style: `top:${pct(nowH)}` }, el('span', {}, clockParts(d).t), el('i'))
    : null;
  return { allDay, body: el('div', { class: 'tl' }, lines, blocks, nowLine) };
}
function nextUp(d) {
  const next = eventsOn(d).filter((e) => !e.allDay && new Date(e.start) > d)[0];
  return next ? `Next up: ${next.title} ${untilLabel(Math.round((new Date(next.start) - d) / 60000))}` : 'Nothing else today';
}
function weekStrip(d) {
  return el('div', { class: 'strip' }, Array.from({ length: 7 }, (_, i) => {
    const day = addDays(d, i);
    const f = forecast && forecast[ymd(day)];
    const evs = eventsOn(day);
    return el('button', { class: `strip-day${i === 0 ? ' is-today' : ''}`, onclick: () => showView('calendar') },
      el('div', { class: 'strip-head' },
        el('span', {}, DAY_NAMES[day.getDay()], ' ', el('b', {}, day.getDate())),
        f ? el('span', { class: 'strip-wx' }, icon(wxKind(f.code)), el('b', {}, `${f.hi}°`), el('span', { class: 'muted' }, `${f.lo}°`)) : null),
      el('span', { class: 'strip-sum' }, evs.length ? evs.slice(0, 2).map((e) => e.title).join(' · ') : 'Nothing planned'));
  }));
}
// A quiet day (two or fewer timed events still to come) puts chores in the big space instead of the calendar.
function quietDay(d) {
  return eventsOn(d).filter((e) => !e.allDay && new Date(e.end) > d).length <= 2 && choreStats().length > 0;
}
// The big chore board: a column per person with every chore for today; click to check off.
function choreBoard() {
  const stats = choreStats();
  return el('section', { class: 'card-w board' },
    el('div', { class: 'tl-top' }, el('h2', {}, 'Chores today'),
      el('button', { class: 'board-link', onclick: () => showView('chores') }, 'Add or change chores')),
    el('div', { class: 'board-cols', style: `--n:${stats.length}` }, stats.map((p) => {
      const ordered = [...p.left, ...p.mine.filter((c) => !p.left.includes(c))];
      return el('div', { class: 'board-col', style: `--c:${p.color}` },
        el('div', { class: 'board-head' }, ring(p.color, p.done / p.total),
          el('div', { class: 'ring-text' },
            el('span', { class: 'board-name' }, el('b', {}, p.name), p.everyone ? null : el('span', { class: 'stars' }, `★ ${p.stars}`)),
            el('span', { class: 'muted nowrap' }, p.done === p.total ? 'All done!' : `${p.done} of ${p.total} done`))),
        ordered.map((c) => {
          const done = S.doneToday.includes(c.id);
          return el('button', { class: `board-chore${done ? ' done' : ''}`, onclick: () => toggleChore(c) },
            el('span', { class: 'board-check' }, done ? icon('check') : null), el('span', {}, c.title, lateTag(c)));
        }));
    })));
}
// Today's events as a short list, for the side column on quiet days. When today has little left,
// tomorrow's events (with times) follow, so there's time to get ready for them.
function todayCard(d) {
  const items = eventsOn(d).filter((e) => e.allDay || new Date(e.end) > d);
  const tmr = addDays(d, 1);
  const next = items.length <= 1 ? eventsOn(tmr) : [];
  const shown = next.slice(0, next.length > 3 ? 2 : 3);
  return el('section', { class: 'card-w' }, el('h2', {}, 'Today'),
    items.length ? agendaList(d, items) : el('p', { class: 'muted' }, 'Nothing else on the calendar'),
    next.length ? el('div', { class: 'ag-next' },
      el('h3', {}, `Tomorrow · ${tmr.toLocaleDateString([], { weekday: 'long' })}`),
      agendaList(d, shown),
      next.length > shown.length ? el('button', { class: 'ag-more', onclick: () => showView('calendar') }, `+${next.length - shown.length} more`) : null) : null);
}
function homeDay(d) {
  const out = rainOutlook(d);
  const banner = departureBanner('day');
  if (quietDay(d)) {
    return el('div', { class: 'home-day' },
      el('header', { class: 'h-head' },
        el('div', {}, el('div', { class: 'h-dayname' }, d.toLocaleDateString([], { weekday: 'long' })),
          el('div', { class: 'h-sub h-subrow' }, d.toLocaleDateString([], { month: 'long', day: 'numeric' }), holidayIcon(d), holidayChip(d))),
        el('div', { class: 'h-right' }, headWeather(d, out), bigClock(d, 'clock-m'))),
      banner,
      el('div', { class: 'day-grid' }, choreBoard(),
        el('div', { class: 'side' }, el('div', { class: 'notes' }, notesNodes()), todayCard(d), groceryCard(), countdownCard(banner ? 1 : 2))),
      weekStrip(d));
  }
  const { allDay, body } = timeline(d);
  return el('div', { class: 'home-day' },
    el('header', { class: 'h-head' },
      el('div', {}, el('div', { class: 'h-dayname' }, d.toLocaleDateString([], { weekday: 'long' })),
        el('div', { class: 'h-sub h-subrow' }, d.toLocaleDateString([], { month: 'long', day: 'numeric' }), holidayIcon(d), holidayChip(d))),
      el('div', { class: 'h-right' }, headWeather(d, out), bigClock(d, 'clock-m'))),
    banner,
    el('div', { class: 'day-grid' },
      el('section', { class: 'card-w tl-card' },
        el('div', { class: 'tl-top' }, el('h2', {}, 'Today'), el('span', { class: 'muted' }, nextUp(d))),
        allDay.length ? el('div', { class: 'allday' }, allDay.map((e) => el('button', { class: 'allday-chip', ...eventAttrs(e), style: `--c:${e.color || '#C2502A'}` }, e.title))) : null,
        body),
      el('div', { class: 'side' }, el('div', { class: 'notes' }, notesNodes()), choresCard(), groceryCard(), countdownCard(banner ? 1 : 2))),
    weekStrip(d));
}

// ---------- Home: morning ----------
function agendaList(d, items) {
  if (!items.length) return el('p', { class: 'empty' }, 'Nothing on the calendar today');
  return items.map((e) => {
    const past = !e.allDay && new Date(e.end) <= d;
    return el('button', { class: `ag-row${past ? ' past' : ''}`, ...eventAttrs(e), style: `--c:${e.color || '#C2502A'}` },
      el('span', { class: 'ag-time' }, e.allDay ? 'All day' : fmtTime(e.start)),
      el('span', { class: 'ag-dot' }),
      el('span', { class: 'ag-title' }, e.title));
  });
}
function homeMorning(d) {
  const c = wx && wx.cur;
  return el('div', { class: 'home-morning' },
    el('div', { class: 'col' },
      el('div', { class: 'greet' }, greetLine(d, 'Good morning'), bigClock(d, 'clock-xl'), el('span', { class: 'h-sub' }, fmtLongDate(d), holidayIcon(d))),
      el('section', { class: 'card-w wx-card' },
        c ? el('div', { class: 'wx-now' }, icon(wxKind(c.weather_code), 'wx-big'),
          el('div', {}, el('div', { class: 'wx-temp-l' }, `${Math.round(c.temperature_2m)}°`),
            el('div', { class: 'muted' }, `up to ${Math.round(wx.daily.temperature_2m_max[0])}° today · ${WX_WORD(wx.daily.weather_code[0])}`),
            el('div', { class: 'muted' }, nextSun(d))))
          : el('p', { class: 'muted' }, 'Weather is loading…'),
        adviceList(weatherAdvice(d, 'morning'))),
      groceryCard()),
    ...(quietDay(d) ? [
      el('div', { class: 'col' }, departureBanner('morning'), choreBoard()),
      el('div', { class: 'col' }, el('div', { class: 'notes' }, notesNodes()), todayCard(d), countdownCard()),
    ] : [
      el('div', { class: 'col' },
        departureBanner('morning'),
        el('section', { class: 'card-w grow' }, el('h2', {}, 'Today'), agendaList(d, eventsOn(d)))),
      el('div', { class: 'col' }, el('div', { class: 'notes' }, notesNodes()), countdownCard(), choresCard()),
    ]));
}

// ---------- Home: evening ----------
function homeEvening(d) {
  const tmr = addDays(d, 1);
  const todays = choresForToday(allChores(), d).filter((ch) => !S.doneToday.includes(ch.id));
  const byId = Object.fromEntries(allChores().map((ch) => [ch.id, ch.person]));
  const starsToday = {};
  S.doneToday.forEach((cid) => { const p = byId[cid]; if (p) starsToday[p] = (starsToday[p] || 0) + 1; });
  const f1 = forecast && forecast[ymd(tmr)];
  const lowTonight = wx ? Math.round(wx.daily.temperature_2m_min[Math.min(1, wx.daily.time.length - 1)]) : null;
  return el('div', { class: 'home-evening' },
    el('header', { class: 'h-head' },
      el('div', {}, greetLine(d, 'Good evening'),
        el('div', { class: 'h-clockline' }, bigClock(d, 'clock-l'), el('span', { class: 'h-sub' }, fmtLongDate(d), holidayIcon(d)))),
      wx ? el('div', { class: 'pill-wx' }, icon(wxKind(wx.cur.weather_code, isDusk(d))),
        el('div', {}, el('b', {}, `${Math.round(wx.cur.temperature_2m)}°`), lowTonight != null ? el('span', { class: 'muted' }, `low of ${lowTonight}° tonight`) : null,
          el('span', { class: 'muted' }, nextSun(d)))) : null),
    el('div', { class: 'eve-grid' },
      el('section', { class: 'card-w' }, el('h2', {}, 'Before bed'),
        todays.length ? el('div', { class: 'card-scroll bed-list' }, todays.map((ch) => el('button', { class: 'bed-row', onclick: () => toggleChore(ch) },
          el('span', { class: 'avatar sm', style: `--c:${personColor(S.people, ch.person)}` }, (ch.person || '★')[0]),
          el('span', { class: 'bed-text' }, el('b', {}, ch.title, lateTag(ch)), el('span', { class: 'muted' }, ch.person || 'Everyone')),
          el('span', { class: 'bed-check' }))))
          : el('p', { class: 'all-done' }, 'All of today’s chores are done'),
        Object.keys(starsToday).length ? el('div', { class: 'stars-today' }, el('span', { class: 'muted' }, 'Stars earned today'),
          el('div', {}, Object.entries(starsToday).map(([p, n]) => el('span', {}, `${p} ★${n}`)))) : null),
      el('section', { class: 'card-w' },
        el('div', { class: 'tl-top' }, el('h2', {}, `Tomorrow · ${tmr.toLocaleDateString([], { weekday: 'long' })}`),
          f1 ? el('span', { class: 'strip-wx big' }, icon(wxKind(f1.code)), el('b', {}, `${f1.hi}°`), el('span', { class: 'muted' }, `/ ${f1.lo}°`)) : null),
        adviceList(tomorrowAdvice()),
        eventsOn(tmr).length ? eventsOn(tmr).map((e) => el('button', { class: 'tmr-ev', ...eventAttrs(e), style: `--c:${e.color || '#C2502A'}` },
          el('span', { class: 'tmr-time' }, e.allDay ? 'All day' : fmtTime(e.start)), el('b', {}, e.title)))
          : el('p', { class: 'empty' }, 'Nothing on the calendar tomorrow'),
        el('div', { class: 'notes' }, notesNodes())),
      el('section', { class: 'card-w' },
        el('div', { class: 'tl-top' }, el('h2', {}, 'Grocery list'), el('span', { class: 'muted' }, `${S.grocery.filter((g) => !g.done).length} to get`)),
        S.grocery.length ? el('div', { class: 'groc card-scroll' }, S.grocery.map((g) => el('button', { class: `groc-row${g.done ? ' done' : ''}`, onclick: () => toggleGrocery(g) },
          el('span', { class: 'groc-check' }, g.done ? icon('check') : null), el('span', {}, g.text))))
          : el('p', { class: 'empty' }, 'The list is empty'),
        quickAdd(6),
        el('p', { class: 'muted small' }, 'Add more from your phone or the Groceries tab (press 4)'))));
}

// ---------- Home: night ----------
let nightPhoto = null, nightPhotoAt = 0;
function homeNight(d) {
  if (S.photos.length && (!nightPhoto || Date.now() - nightPhotoAt > 10 * 60e3 || !S.photos.includes(nightPhoto))) {
    nightPhoto = S.photos[Math.floor(Math.random() * S.photos.length)];
    nightPhotoAt = Date.now();
  }
  const tmr = addDays(d.getHours() < 12 ? addDays(d, -1) : d, 1); // after midnight, "tomorrow" is today
  const f1 = forecast && forecast[ymd(tmr)];
  const evs = eventsOn(tmr).slice(0, 3);
  return el('div', { class: `home-night${S.photos.length ? '' : ' no-photo'}`, onclick: () => { wokeAt = Date.now(); renderHome(); } },
    el('div', { class: 'night-main' },
      nyeLine(d, 'before'),
      bigClock(d, 'clock-night'),
      nyeLine(d, 'after'),
      el('div', { class: 'night-date' }, fmtLongDate(d)),
      el('div', { class: 'night-tmr' },
        el('span', { class: 'night-label' }, d.getHours() < 12 ? 'TODAY' : 'TOMORROW'),
        f1 ? el('div', { class: 'night-line' }, icon(wxKind(f1.code)), [`${f1.hi}°`, WX_WORD(f1.code), nextSun(d).replace(/^S/, 's')].filter(Boolean).join(' · ')) : null,
        evs.map((e) => el('div', { class: 'night-line' }, `${e.allDay ? 'All day' : fmtTime(e.start)} · ${e.title}`)))),
    S.photos.length ? el('div', { class: 'night-photo' }, el('img', { src: `/photos/${encodeURIComponent(nightPhoto)}`, alt: '' })) : null,
    el('div', { class: 'night-hint' }, `${TAP} or press any key to wake`));
}

// ---------- holiday trim (see holidays.js) ----------
function holidayNow(d) { return S && S.holidayDecor !== false ? holidayOn(d) : null; }
// "Happy Thanksgiving" next to the date on the day itself.
function holidayChip(d) {
  const h = holidayNow(d);
  return h && h.greet ? el('span', { class: 'holiday-chip', lang: h.greetingLang, style: `--hc:${h.color}` }, h.greeting) : null;
}
// Mornings and evenings say the holiday greeting instead of "Good morning".
function greetLine(d, normal) {
  const h = holidayNow(d);
  if (!h || !h.greet) return el('span', { class: 'greet-hi' }, normal);
  return el('span', { class: 'greet-hi holiday-greet', style: `--hc:${h.color}` },
    el('span', { lang: h.greetingLang }, h.greeting), h.sub ? el('span', { class: 'holiday-sub' }, h.sub) : null);
}
// New Year's Eve on the night screen: "18 minutes until 2027" above the clock, then "Happy New Year!" after midnight.
function nyeLine(d, where) {
  if (!S || S.holidayDecor === false || !newYearsEveNight(d)) return null;
  if (d.getMonth() === 0) return where === 'before' ? el('div', { class: 'nye-line' }, 'Happy New Year!') : null;
  if (where !== 'after') return null;
  const left = Math.ceil((new Date(d.getFullYear() + 1, 0, 1) - d) / 60000);
  const h = Math.floor(left / 60), m = left % 60;
  const t = h ? `${h} hr ${m} min` : `${m} minute${m === 1 ? '' : 's'}`;
  return el('div', { class: 'nye-line' }, `${t} until ${d.getFullYear() + 1}`);
}
// A small drawing of the holiday next to the date while its decorations are up.
function holidayIcon(d) {
  const h = holidayNow(d);
  if (!h) return null;
  const s = el('span', { class: 'hol-ico' });
  s.innerHTML = holidayIconSvg(h.kind); // fixed drawings from holidays.js
  return s;
}
// The garland goes across the top of every tab, except Home's late-night clock (where only
// New Year's Eve gets it). Between holidays, a thinner one for the season. Holidays also get
// holiday-colored headings and clock, and on Home corner piles and (unless holidayMotion is off)
// twinkling lights and a few pieces drifting down.
// The trim is only rebuilt when it changes, so the motion doesn't restart every minute.
function updateDecor() {
  if (!S) return;
  const d = now();
  let box = document.querySelector('body > .decor');
  if (!box) { box = el('div', { class: 'decor' }); document.body.prepend(box); }
  const h = holidayNow(d);
  const night = currentView === 'home' && currentMode() === 'night';
  let kind = null, quiet = false;
  if (h) kind = night && !(h.kind === 'newyear' && newYearsEveNight(d)) ? null : h.kind;
  else if (!night && S.holidayDecor !== false && S.seasonDecor !== false) { kind = seasonOn(d); quiet = true; }
  const extras = !!kind && !quiet && !night;
  const motion = !!kind && !quiet && S.holidayMotion !== false;
  document.body.classList.toggle('festive', extras);
  document.body.classList.toggle('garlanded', !!kind);
  if (extras) document.body.style.setProperty('--hol', h.color);
  const key = `${kind}|${quiet}|${extras}|${motion}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.classList.toggle('moving', motion);
  box.replaceChildren(...(kind ? [garlandEl(kind, quiet)] : []), ...(extras ? cornerEls(kind) : []), ...(extras && motion ? [fallEl(kind)] : []));
}

// ---------- Home ----------
function bigClock(d, cls) {
  const { t, ap } = clockParts(d);
  return el('div', { class: `bigclock ${cls}` }, el('span', { class: 'bc-t' }, t), el('span', { class: 'bc-ap' }, ap));
}
// Whichever comes next: "Sunrise 6:52 AM" before dawn, "Sunset 5:23 PM" in the day, tomorrow's sunrise after dark.
function nextSun(d) {
  const dd = wx && wx.daily;
  if (!dd || !dd.sunrise) return '';
  const rise = new Date(dd.sunrise[0]), set = new Date(dd.sunset[0]);
  if (ymd(rise) !== ymd(d)) return ''; // forecast is from another day (previews)
  if (d < rise) return `Sunrise ${fmtClock(rise)}`;
  if (d < set) return `Sunset ${fmtClock(set)}`;
  return dd.sunrise[1] ? `Sunrise ${fmtClock(new Date(dd.sunrise[1]))}` : '';
}
function headWeather(d, outlook) {
  if (!wx) return null;
  return el('div', { class: 'h-wx' }, icon(wxKind(wx.cur.weather_code, isDusk(d)), 'wx-mid'),
    el('div', {}, el('div', { class: 'h-wx-t' }, `${Math.round(wx.cur.temperature_2m)}°`),
      el('div', { class: 'muted' }, [`H ${Math.round(wx.daily.temperature_2m_max[0])}° L ${Math.round(wx.daily.temperature_2m_min[0])}°`, outlook, nextSun(d)].filter(Boolean).join(' · '))));
}
let lastHomeKey = '';
function renderHome(force = true) {
  if (!S) return;
  const d = now();
  const mode = currentMode();
  const key = `${mode}|${d.getHours()}:${d.getMinutes()}|${lastVersion}|${wx ? 1 : 0}`;
  if (!force && key === lastHomeKey) return;
  lastHomeKey = key;
  document.body.classList.toggle('night', currentView === 'home' && mode === 'night');
  const box = document.getElementById('view-home');
  const view = { morning: homeMorning, day: homeDay, evening: homeEvening, night: homeNight }[mode](d);
  // Home redraws every minute; keep scrolled lists where they were.
  const scrolled = [...box.querySelectorAll('.card-scroll')].map((e) => [e.className, e.scrollTop]);
  box.replaceChildren(view);
  for (const [cls, top] of scrolled) { const e = box.getElementsByClassName(cls)[0]; if (e) e.scrollTop = top; }
  updateDecor();
  box.dataset.mode = mode;
  fitChores();
}
// Sizes change once the fonts arrive or the window resizes; fit the chores again.
if (document.fonts) document.fonts.ready.then(() => currentView === 'home' && renderHome());
window.addEventListener('resize', () => currentView === 'home' && renderHome());

// ---------- Week tab ----------
function eventChip(e, big) {
  const when = e.allDay ? 'All day' : fmtTime(e.start);
  return el('button', { class: `event${big ? ' big' : ''}`, ...eventAttrs(e), style: `--c:${e.color || '#888'}` },
    el('span', { class: 'when' }, when), el('span', { class: 'what' }, e.title));
}
function dayWeather(d) {
  const f = forecast && forecast[ymd(d)];
  if (!f) return null;
  return el('div', { class: 'day-wx' }, icon(wxKind(f.code)), el('span', {}, `${f.hi}°/${f.lo}°`),
    f.rain >= RAIN_MIN ? el('span', { class: 'rain' }, `${f.rain}%`) : null);
}
function renderCalendar() {
  const today = now();
  const fill = (id, list) => {
    document.getElementById(id).replaceChildren(...(list.length ? list.map((e) => eventChip(e, true)) : [el('p', { class: 'empty' }, 'Nothing scheduled')]));
  };
  fill('today-list', eventsOn(today));
  fill('tomorrow-list', eventsOn(addDays(today, 1)));
  const week = document.getElementById('week');
  week.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    week.append(el('div', { class: `day${i === 0 ? ' is-today' : ''}` },
      el('div', { class: 'day-head' }, el('span', {}, DAY_NAMES[d.getDay()]), el('b', {}, d.getDate())),
      dayWeather(d),
      el('div', { class: 'day-events' }, eventsOn(d).map((e) => eventChip(e)))));
  }
  document.getElementById('notes').replaceChildren(...notesNodes());
  const cds = countdownList(5);
  document.getElementById('countdowns').replaceChildren(...(cds.length ? [el('h2', { class: 'mt' }, 'Coming up'),
    ...cds.map((c) => el('div', { class: 'cd-row' },
      el('div', {}, el('div', { class: 'cd-title' }, c.title), el('div', { class: 'muted small' }, fmtShortDate(c.when))),
      el('div', { class: 'cd-days' }, daysLabel(c.days))))] : []));
  const status = document.getElementById('cal-status');
  if (!S.calendar.fetchedAt) status.textContent = 'Loading calendars…';
  else if (S.calendar.errors.length) status.textContent = `Couldn't update the calendar: ${S.calendar.errors.join('; ')}`;
  else status.textContent = '';
}
function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// ---------- weather alerts ----------
let alertSig = '';
function renderAlerts() {
  const active = activeAlerts(S && S.alerts);
  const sig = active.map((a) => a.id).join('|');
  if (sig === alertSig) return; // unchanged: don't collapse an open alert
  alertSig = sig;
  document.getElementById('alerts').replaceChildren(...alertBanners(active));
  if (active.some(isSevere)) stopFrame();
  if (currentView === 'home') renderHome(); // the bar takes room from Home: fit its cards again
}
const severeAlertActive = () => activeAlerts(S && S.alerts).some(isSevere);

// ---------- Chores tab ----------
function renderChores() {
  fillChorePeople();
  const box = document.getElementById('chores');
  const todays = choresForToday(allChores(), now());
  const names = [...S.people.map((p) => p.name)];
  if (todays.some((c) => !c.person || !names.includes(c.person))) names.push('');
  box.replaceChildren(...names.map((name) => {
    const mine = todays.filter((c) => (name ? c.person === name : !names.includes(c.person) || !c.person));
    const color = name ? personColor(S.people, name) : '#8C8174';
    const doneCount = mine.filter((c) => S.doneToday.includes(c.id)).length;
    return el('div', { class: 'chore-col', style: `--c:${color}` },
      el('div', { class: 'chore-head' },
        el('div', { class: 'avatar' }, (name || '★')[0]),
        el('div', {}, el('b', {}, name || 'Everyone'), el('div', { class: 'muted' }, `${doneCount} of ${mine.length} done · ★ ${S.stars[name] || 0} this week`))),
      mine.length ? mine.map((c) => {
        const done = S.doneToday.includes(c.id);
        return el('button', { class: `chore${done ? ' done' : ''}`, onclick: () => toggleChore(c) },
          el('span', { class: 'check' }, done ? icon('check') : null), el('span', {}, c.title, lateTag(c)));
      }) : el('p', { class: 'empty' }, 'No chores today'));
  }));
  if (!S.chores.length) box.replaceChildren(el('p', { class: 'empty big' }, 'No chores yet. Add some from your phone.'));
}

// Add a chore from the kitchen screen (press N on the Chores tab).
const caDays = document.getElementById('ca-days');
DAY_NAMES.forEach((d, i) => caDays.append(el('label', {}, el('input', { type: 'checkbox', value: i }), el('span', {}, d))));
const caWhen = whenPicker({ select: document.getElementById('ca-when'), days: caDays,
  date: document.getElementById('ca-date'), hint: document.getElementById('ca-days-hint'), today: now });
function fillChorePeople() {
  const sel = document.getElementById('ca-person');
  const keep = sel.value;
  sel.replaceChildren(el('option', { value: '' }, 'Everyone'), ...S.people.map((p) => el('option', { value: p.name }, p.name)));
  sel.value = keep;
}
document.getElementById('chore-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('ca-title');
  const title = input.value.trim();
  if (!title) return input.focus();
  const when = caWhen.get();
  if (when.date === '') return document.getElementById('ca-date').focus();
  const person = document.getElementById('ca-person').value;
  input.value = '';
  caWhen.reset();
  act(() => api.send('POST', '/api/chores', { title, person, ...when }));
  document.activeElement?.blur(); // free the keys again: 1–6 switch tabs, N starts the next chore
});

// ---------- Groceries tab ----------
function renderGrocery() {
  const ul = document.getElementById('grocery');
  ul.replaceChildren(...S.grocery.map((g) =>
    el('li', {}, el('button', { class: `chore${g.done ? ' done' : ''}`, onclick: () => toggleGrocery(g) },
      el('span', { class: 'check' }, g.done ? icon('check') : null), el('span', {}, g.text)))));
  if (!S.grocery.length) ul.replaceChildren(el('p', { class: 'empty' }, 'The list is empty.'));
  document.getElementById('grocery-clear').hidden = !S.grocery.some((g) => g.done);
  document.getElementById('grocery-quick').replaceChildren(...[quickAdd(12)].filter(Boolean));
}
document.getElementById('grocery-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('grocery-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  act(() => api.send('POST', '/api/grocery', { text }));
});
document.getElementById('grocery-clear').addEventListener('click', () => act(() => api.send('POST', '/api/grocery/clear-done')));

// ---------- Watch tab ----------
function renderServices() {
  document.getElementById('services').replaceChildren(...S.services.map((s) =>
    el('button', { class: 'service', style: `--c:${s.color || '#333'}`, onclick: () => window.open(s.url, '_blank') }, s.name)));
}

// ---------- weather (Open-Meteo, no key needed) ----------
let forecast = null; // daily forecast by date

// US EPA air quality bands.
function aqiInfo(v) {
  if (v <= 50) return { label: 'Good', cls: 'aq-good' };
  if (v <= 100) return { label: 'Moderate', cls: 'aq-moderate' };
  if (v <= 150) return { label: 'Unhealthy for sensitive groups', cls: 'aq-usg' };
  if (v <= 200) return { label: 'Unhealthy', cls: 'aq-bad' };
  if (v <= 300) return { label: 'Very unhealthy', cls: 'aq-bad' };
  return { label: 'Hazardous', cls: 'aq-bad' };
}
const uvLabel = (v) => (v >= 11 ? 'Extreme' : v >= 8 ? 'Very high' : v >= 6 ? 'High' : 'Moderate');

// Header for the non-Home tabs: "76° · H 78° L 56° · Sunset 5:23 PM · Air 82 Moderate · UV 5"
function renderHeaderWeather() {
  if (!wx) return;
  const d = now(), dd = wx.daily;
  const sunset = new Date(dd.sunset[0]);
  const chips = [];
  chips.push(el('span', { class: 'chip' }, d < sunset ? `Sunset ${fmtClock(sunset)}` : `Sunrise ${fmtClock(new Date(dd.sunrise[1] || dd.sunrise[0]))}`));
  if (wx.aqi != null) { const a = aqiInfo(wx.aqi); chips.push(el('span', { class: `chip ${a.cls}` }, `Air ${Math.round(wx.aqi)} · ${a.label}`)); }
  const uv = Math.round(dd.uv_index_max[0] ?? 0);
  if (uv >= 3 && d < sunset) chips.push(el('span', { class: `chip${uv >= 6 ? ' uv-high' : ''}` }, `UV ${uv} · ${uvLabel(uv)}`));
  const out = rainOutlook(d);
  document.getElementById('weather').replaceChildren(
    icon(wxKind(wx.cur.weather_code, d >= sunset), 'wx-mid'),
    el('span', { class: 'wx-temp' }, `${Math.round(wx.cur.temperature_2m)}°`),
    el('div', { class: 'wx-detail' },
      el('div', {}, `${WX_WORD(wx.cur.weather_code)} · H ${Math.round(dd.temperature_2m_max[0])}° L ${Math.round(dd.temperature_2m_min[0])}°`),
      out ? el('div', { class: out.startsWith('No') ? 'muted' : 'rain' }, out) : null,
      el('div', { class: 'chips' }, chips)));
}

async function loadAirQuality(w) {
  try {
    const q = new URLSearchParams({ latitude: w.latitude, longitude: w.longitude, current: 'us_aqi', timezone: 'auto' });
    const r = await (await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`)).json();
    return r.current && r.current.us_aqi != null ? r.current.us_aqi : null;
  } catch { return null; } // air quality is a nice-to-have; skip it if unavailable
}

let weatherOk = false;
async function loadWeather() {
  const w = S && S.weather;
  if (!w) return;
  try {
    const q = new URLSearchParams({ latitude: w.latitude, longitude: w.longitude, current: 'temperature_2m,weather_code',
      hourly: 'precipitation_probability,temperature_2m',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,uv_index_max',
      temperature_unit: w.units || 'fahrenheit', timezone: 'auto', forecast_days: 7 });
    const [r, aqi] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((res) => res.json()),
      loadAirQuality(w),
    ]);
    const d = r.daily;
    forecast = {};
    d.time.forEach((t, i) => {
      forecast[t] = { code: d.weather_code[i], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]),
        rain: d.precipitation_probability_max[i] ?? 0 };
    });
    wx = { cur: r.current, daily: d, hourly: r.hourly, aqi, units: w.units || 'fahrenheit' };
    applyTheme();
    renderHeaderWeather();
    renderCalendar();
    renderHome();
    weatherOk = true;
    lastWeatherOk = Date.now();
  } catch {
    weatherOk = false; // offline: keep the last reading and try again soon
  }
}

// ---------- photo frame ----------
// Picks a layout from the photos' shapes: landscape photos fill the screen,
// portrait photos sit side by side, and every few slides there's a collage
// (one big photo + two small). Every photo shows once before any repeats.
// Seconds per slide come from config.json ("slideSeconds", default 8); collages get 3 more.
const slideMs = () => Math.max(3, Number(S && S.slideSeconds) || 8) * 1000;
const COLLAGE_EXTRA_MS = 3000, COLLAGE_EVERY = 4;
let frameRun = 0, frameTimer = null, slideCount = 0;
let photoQueue = [], photoBuffer = [], filling = null;

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Wait for a promise, but give up after `ms` so a stuck step can't stall the slideshow.
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

// Loads a photo and shrinks it to about screen size. Phone photos are several
// times larger than the screen, and zooming them is too much for older
// graphics chips (it shows as flickering lines).
async function loadPhoto(name) {
  const img = new Image();
  const ok = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `/photos/${encodeURIComponent(name)}`;
  });
  if (!ok || !img.naturalWidth) return null; // deleted or unreadable: skip it
  const w = img.naturalWidth, h = img.naturalHeight;
  const ratio = w / h;
  const longest = Math.max(screen.width, screen.height, innerWidth, innerHeight) * (devicePixelRatio || 1);
  const scale = Math.min(1, longest / Math.max(w, h));
  if (scale >= 0.9) return { name, src: img.src, ratio };
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await withTimeout(new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)), 5000);
  if (!blob) return { name, src: img.src, ratio };
  return { name, src: URL.createObjectURL(blob), ratio, temp: true };
}
// Videos play full screen, start to finish, then the slideshow moves on.
// Checks the video can actually play here first (e.g. an iPhone's HEVC video may not play in Edge),
// and remembers the ones that can't so they're skipped from then on.
const isVideoName = (name) => /\.(mp4|m4v|mov|webm)$/i.test(name);
const unplayable = new Set();
async function loadVideo(name) {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  const ok = await withTimeout(new Promise((resolve) => {
    v.onloadedmetadata = () => resolve(v.videoWidth > 0);
    v.onerror = () => resolve(false);
    v.src = `/photos/${encodeURIComponent(name)}`;
  }), 15000);
  const item = ok ? { name, video: true, src: v.src, ratio: v.videoWidth / v.videoHeight } : null;
  v.removeAttribute('src'); v.load(); // let go of the file
  if (!item) { unplayable.add(name); console.warn(`Can't play ${name} on this PC; skipping it.`); }
  return item;
}
// Thumbnails for the phone page's grid: phones were slow to grab a still from a video before uploading
// (iPhones often couldn't at all), so the kitchen screen does it once each new video arrives.
const stillTried = new Set();
let makingStills = false;
async function videoStill(src) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto';
  const once = (ev) => new Promise((r) => { v.addEventListener(ev, () => r(true), { once: true }); v.addEventListener('error', () => r(false), { once: true }); });
  try {
    const loaded = once('loadeddata');
    v.src = src;
    if (!(await withTimeout(loaded, 20000))) return null;
    const seeked = once('seeked');
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    if (!(await withTimeout(seeked, 20000)) || !v.videoWidth) return null;
    const scale = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await withTimeout(new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8)), 10000);
  } catch { return null; } finally { v.removeAttribute('src'); v.load(); }
}
async function makeStills() {
  if (makingStills) return;
  makingStills = true;
  try {
    let name;
    while ((name = (S.needStill || []).find((n) => !stillTried.has(n)))) {
      stillTried.add(name); // one try each; a video this PC can't play just keeps the plain tile
      const blob = await videoStill(`/photos/${encodeURIComponent(name)}`);
      if (blob) await fetch(`/api/thumbs/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).catch(() => {});
    }
  } finally { makingStills = false; }
}
const frameMedia = () => [...S.photos, ...(S.videos || []).filter((v) => !unplayable.has(v))];
// Free the shrunk copies, and stop any video, once a slide is gone.
function discardSlide(slide) {
  (slide.tempUrls || []).forEach((u) => URL.revokeObjectURL(u));
  slide.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
  slide.remove();
}
// Keep a few photos loaded ahead, so the layout can be chosen by their shapes.
function fillBuffer(n = 4) {
  return (filling ||= (async () => {
    for (let tries = 0; photoBuffer.length < n && tries < n * 3; tries++) {
      if (!photoQueue.length) photoQueue = shuffled(frameMedia().filter((p) => !photoBuffer.some((b) => b.name === p)));
      if (!photoQueue.length) break;
      const name = photoQueue.shift();
      const p = isVideoName(name) ? await loadVideo(name) : await loadPhoto(name);
      if (p) photoBuffer.push(p);
    }
  })().finally(() => { filling = null; }));
}

const isPortrait = (p) => !p.video && p.ratio < 0.9;
function takeLayout() {
  slideCount++;
  if (photoBuffer[0].video) return { kind: 'video', photos: photoBuffer.splice(0, 1) };
  if (slideCount % COLLAGE_EVERY === 0 && photoBuffer.length >= 3 && !photoBuffer.slice(0, 3).some((p) => p.video)) {
    return { kind: 'collage', photos: photoBuffer.splice(0, 3) };
  }
  if (isPortrait(photoBuffer[0])) {
    const portraits = photoBuffer.filter(isPortrait);
    const wide = innerWidth / innerHeight > 1.5;
    const pick = portraits.slice(0, wide && portraits.length >= 3 ? 3 : Math.min(portraits.length, 2));
    photoBuffer = photoBuffer.filter((p) => !pick.includes(p));
    return { kind: pick.length === 1 ? 'single' : `row${pick.length}`, photos: pick };
  }
  return { kind: 'single', photos: photoBuffer.splice(0, 1) };
}

function buildSlide(layout) {
  const ratio = innerWidth / innerHeight;
  if (layout.kind === 'video') {
    const v = el('video', { src: layout.photos[0].src, preload: 'auto', playsinline: '', class: 'vid' });
    v.muted = !S.videoSound; // sound is off unless "videoSound": true in config.json
    return el('div', { class: 'slide video' }, el('div', { class: 'cell' }, v));
  }
  return el('div', { class: `slide ${layout.kind}` }, layout.photos.map((p) => {
    // A photo on its own that doesn't match the screen's shape is shown whole,
    // over a blurred copy of itself instead of black bars.
    const fit = layout.kind === 'single' && Math.abs(p.ratio - ratio) / ratio > 0.15;
    return el('div', { class: 'cell' },
      fit ? el('div', { class: 'blur', style: `background-image:url("${p.src}")` }) : null,
      el('img', { src: p.src, alt: '', class: `kb kb${Math.floor(Math.random() * 4)}${fit ? ' fit' : ''}` }));
  }));
}

async function showNext(run) {
  await fillBuffer();
  if (run !== frameRun) return; // slideshow was stopped meanwhile
  if (!photoBuffer.length) return stopFrame();
  const layout = takeLayout();
  const ms = slideMs() + (layout.kind === 'collage' ? COLLAGE_EXTRA_MS : 0);
  const slide = buildSlide(layout);
  slide.tempUrls = layout.photos.filter((p) => p.temp).map((p) => p.src);
  slide.style.setProperty('--dur', `${ms + 2000}ms`);
  const video = slide.querySelector('video');
  if (video) {
    // Buffer enough to start smoothly before fading in.
    const ready = await withTimeout(new Promise((r) => { video.oncanplay = () => r(true); video.onerror = () => r(false); }), 10000);
    if (run !== frameRun) return discardSlide(slide);
    if (!ready) { unplayable.add(layout.photos[0].name); discardSlide(slide); return showNext(run); }
  } else {
    // Decode fully before fading in, so a photo never appears half-drawn.
    await withTimeout(Promise.all([...slide.querySelectorAll('img')].map((i) => i.decode().catch(() => {}))), 2000);
  }
  if (run !== frameRun) return discardSlide(slide);
  const box = document.querySelector('#frame .slides');
  const old = [...box.children];
  box.append(slide);
  requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
  setTimeout(() => old.forEach(discardSlide), 1600);
  if (video) playSlideVideo(video, run);
  else frameTimer = setTimeout(() => showNext(run), ms);
  fillBuffer(); // load the next photos while this slide is up
}
// Plays the whole video, then moves on. If the browser won't start it with sound
// (no one has touched the screen since it loaded), it plays muted instead.
function playSlideVideo(v, run) {
  let moved = false;
  const next = () => { if (moved || run !== frameRun) return; moved = true; clearTimeout(frameTimer); showNext(run); };
  v.onended = next;
  v.onerror = next;
  v.play().catch(() => { v.muted = true; return v.play(); }).catch(next);
  // In case it stalls: give up a little after it should have finished.
  if (Number.isFinite(v.duration)) frameTimer = setTimeout(next, v.duration * 1000 + 30000);
}

function startFrame(manual) {
  if (!S || !frameMedia().length) {
    if (manual) alert('No photos yet. Add some from your phone.');
    return;
  }
  const f = document.getElementById('frame');
  if (!f.hidden) return;
  f.hidden = false;
  slideCount = 0;
  showNext(++frameRun);
}
function stopFrame() {
  frameRun++;
  clearTimeout(frameTimer);
  const f = document.getElementById('frame');
  f.hidden = true;
  [...f.querySelector('.slides').children].forEach(discardSlide);
}
document.getElementById('frame').addEventListener('click', stopFrame);

// ---------- monitor off overnight ----------
// From screenOffAt (default midnight) until morning, turn the monitor off once nobody's
// using it. A key press or touchpad touch wakes it; it comes back on in the morning.
let monitorOff = false;
function inScreenOffHours(d) {
  if (!S || !S.screenOffAt) return false;
  const t = { ...MODE_TIMES, ...(S.modes || {}) };
  const h = d.getHours() + d.getMinutes() / 60;
  // Stay on for the New Year's countdown, until 12:30.
  if (S.holidayDecor !== false && ((d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() === 1 && h < 0.5))) return false;
  const off = hm(S.screenOffAt), on = hm(d.getDay() % 6 === 0 ? t.weekendMorning : t.morning);
  return off < on ? h >= off && h < on : h >= off || h < on;
}
function checkMonitor(idleMin, limit) {
  if (timeOffset) return; // never while previewing another time of day
  if (monitorOff && Date.now() - idleSince < 30e3) monitorOff = false; // someone woke it up
  const late = inScreenOffHours(now());
  if (!monitorOff && late && idleMin > limit && !severeAlertActive()) {
    monitorOff = true;
    api.send('POST', '/api/display/off').catch(() => {});
  } else if (monitorOff && (!late || severeAlertActive())) {
    monitorOff = false; // morning (or a severe weather alert): wake the monitor
    api.send('POST', '/api/display/on').catch(() => {});
  }
}

// ---------- when nobody's touching the screen ----------
// Go back to Home. During the day, start the slideshow; mornings keep the
// leave-by countdown visible and nights stay dim.
let idleSince = Date.now();
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach((ev) =>
  window.addEventListener(ev, () => { idleSince = Date.now(); }, { passive: true }));
setInterval(() => {
  renderAlerts(); // drops alerts once they expire
  if (!S) return;
  const idleMin = (Date.now() - idleSince) / 60000;
  const limit = S.idleMinutes > 0 ? S.idleMinutes : 5;
  if (idleMin > limit) {
    document.querySelectorAll('dialog[open]').forEach((dlg) => dlg.close());
    if (wokeAt) { wokeAt = 0; renderHome(); }
    if (currentView !== 'home') showView('home');
    if (S.idleMinutes > 0 && currentMode() === 'day' && !severeAlertActive()) startFrame(false);
  }
  if (currentMode() === 'night' && !document.getElementById('frame').hidden) stopFrame();
  checkMonitor(idleMin, limit);
}, 15000);

// ---------- keyboard (the kitchen PC has a keyboard and touchpad) ----------
// 1–6 switch tabs, H or Esc goes Home, G jumps to the grocery box (or just type on the Groceries tab),
// N starts a new note (a new chore on the Chores tab), Ctrl+Z undoes.
const TAB_KEYS = { 1: 'home', 2: 'calendar', 3: 'chores', 4: 'grocery', 5: 'watch' };
const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
window.addEventListener('keydown', (e) => {
  enterFullscreen();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undoState && !typing(e.target)) { e.preventDefault(); doUndo(); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Any key stops the slideshow or wakes the night screen (and does nothing else).
  if (!document.getElementById('frame').hidden) { e.preventDefault(); stopFrame(); return; }
  if (currentView === 'home' && document.getElementById('view-home').dataset.mode === 'night') { e.preventDefault(); wokeAt = Date.now(); renderHome(); return; }
  if (document.querySelector('dialog[open]')) return; // Esc closes it natively
  if (typing(e.target)) {
    if (e.key === 'Escape') { e.target.blur(); return; }
    // An empty text box lets 1–6 switch tabs, so you're never stuck in one.
    const emptyText = e.target.tagName === 'INPUT' && ['text', 'search'].includes(e.target.type) && !e.target.value;
    if (!(emptyText && /^[1-6]$/.test(e.key))) return;
    e.target.blur();
  }
  // On the Groceries tab, just start typing: a letter goes straight into the "Add an item" box.
  if (currentView === 'grocery' && e.key.length === 1 && /\p{L}/u.test(e.key)) { document.getElementById('grocery-input').focus(); return; }
  const k = e.key.toLowerCase();
  if (TAB_KEYS[k]) {
    e.preventDefault();
    showView(TAB_KEYS[k]);
  }
  else if (k === '6') { e.preventDefault(); startFrame(true); }
  else if (k === 'h' || k === 'escape') { e.preventDefault(); showView('home'); }
  else if (k === 'g') { e.preventDefault(); showView('grocery'); document.getElementById('grocery-input').focus(); }
  else if (k === 'n' && currentView === 'chores') { e.preventDefault(); document.getElementById('ca-title').focus(); }
  else if (k === 'n' && S) { e.preventDefault(); openNoteDialog(); }
});
document.addEventListener('pointerdown', enterFullscreen);

// If the window didn't open full screen (Edge sometimes ignores that at startup),
// go full screen at the first key press or click — browsers only allow it then.
function enterFullscreen() {
  if (document.fullscreenElement || timeOffset) return;
  if (innerHeight >= screen.height - 2 && innerWidth >= screen.width - 2) return; // already full screen
  document.documentElement.requestFullscreen?.().catch(() => {});
}

// Hide the pointer when the touchpad isn't being used.
let cursorTimer = null;
function wakeCursor() {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 4000);
}
window.addEventListener('pointermove', wakeCursor, { passive: true });
wakeCursor();

// ---------- status ----------
// A quiet note in the corner, only when something has stopped updating.
let lastLoadOk = Date.now(), lastWeatherOk = 0, calFailingSince = 0;
const startedAt = Date.now();
function renderStatus() {
  const msgs = [];
  if (Date.now() - lastLoadOk > 60e3) msgs.push('Can’t reach the Kitchen Hub server');
  else if (S) {
    const f = S.calendar.fetchedAt && new Date(S.calendar.fetchedAt);
    // The server retries every minute, so only speak up if it's still failing after 5 minutes.
    if (!S.calendar.errors.length) calFailingSince = 0;
    else if (!calFailingSince) calFailingSince = Date.now();
    if (calFailingSince && Date.now() - calFailingSince > 5 * 60e3) msgs.push('Calendar couldn’t update');
    else if (f && Date.now() - f > 40 * 60e3) msgs.push(`Calendar last updated ${fmtClock(f)}`);
    if (!weatherOk && Date.now() - Math.max(lastWeatherOk, startedAt) > 15 * 60e3) {
      msgs.push(lastWeatherOk ? `Weather last updated ${fmtClock(new Date(lastWeatherOk))}` : 'Weather unavailable');
    }
  }
  const box = document.getElementById('status-badge');
  box.textContent = msgs.join(' · ');
  box.hidden = !msgs.length;
}

function renderAll() {
  if (!S) return;
  renderCalendar(); renderChores(); renderGrocery(); renderHome();
}

// ---------- clock ----------
function tickClock() {
  const d = now();
  document.getElementById('clock').textContent = fmtClock(d);
  document.getElementById('date').replaceChildren(fmtLongDate(d), ...[holidayIcon(d)].filter(Boolean));
  updateDecor(); // the other tabs get the garland too
  document.getElementById('frame-time').textContent = fmtClock(d);
  document.getElementById('frame-date').textContent = fmtLongDate(d);
  applyTheme();
  renderStatus();
  if (currentView === 'home') renderHome(false); // redraws when the minute or mode changes
  // Redraw at midnight so "Today" moves on (not while previewing another time).
  if (S && !timeOffset && S.today !== ymd(d)) load(true);
}

// ---------- data ----------
async function act(fn) {
  try { await fn(); } catch (e) { console.error(e); }
  load(true);
}

async function load(force) {
  try {
    if (!force && S) {
      const { version } = await api.get('/api/version');
      lastLoadOk = Date.now(); // the server answered, even if nothing changed
      if (version === lastVersion) return;
    }
    S = await api.get('/api/state');
    lastVersion = S.version;
    lastLoadOk = Date.now();
    renderCalendar(); renderChores(); renderGrocery(); renderServices();
    renderAlerts(); renderHome(); renderStatus();
    makeStills();
  } catch (e) {
    if (Date.now() - lastLoadOk > 15e3) document.getElementById('cal-status').textContent = 'Can’t reach the Kitchen Hub server. Retrying…';
  }}

tickClock();
setInterval(tickClock, 10000);
// Add ?view=chores (calendar, grocery, watch) to open another tab, for previews.
const VIEW = new URLSearchParams(location.search).get("view");
load(true).then(() => { if (VIEW && document.getElementById(`view-${VIEW}`)) showView(VIEW); tickClock(); }).then(loadWeather);
setInterval(() => load(false), 5000);
// Every 30 minutes, or every 2 minutes while the last attempt failed.
let lastWeatherTry = Date.now();
setInterval(() => {
  if (Date.now() - lastWeatherTry >= (weatherOk ? 30 : 2) * 60000) { lastWeatherTry = Date.now(); loadWeather(); }
}, 30000);
