// Phone page: Today, Calendar, Chores, Groceries, and More (the editors).
let S = null;
let lastVersion = 0;
let alertSig = null;

// ---------- kept on the phone ----------
// The last state from the kitchen PC is saved on the phone, so the page opens (and the grocery
// list works) with no signal. Grocery changes made offline wait in a queue and sync later.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or full */ } },
};
let online = true;
let savedAt = 0;
let queue = store.get('kh-queue') || [];
const saveQueue = () => store.set('kh-queue', queue);
const offlineError = (e) => e instanceof TypeError; // fetch couldn't reach the PC at all

async function act(fn) {
  try { await fn(); } catch (e) {
    alert(offlineError(e) ? 'No connection to the Kitchen Hub. Try again when you’re back online.' : `That didn't save: ${e.message}`);
  }
  load(true);
}

// Apply a grocery change to a copy of the state, the way the server will.
function applyOp(st, op) {
  const m = op.url.match(/^\/api\/grocery\/([^/]+)\/toggle$/);
  if (op.url === '/api/grocery') {
    if (op.body.done || !st.grocery.some((g) => !g.done && g.text.toLowerCase() === op.body.text.toLowerCase())) {
      st.grocery.push({ id: op.tmp, text: op.body.text, done: !!op.body.done, pending: true });
    }
  } else if (op.url === '/api/grocery/clear-done') {
    st.grocery = st.grocery.filter((g) => !g.done);
  } else if (m) {
    const g = st.grocery.find((x) => x.id === m[1]);
    if (g) { g.done = op.body.done; g.pending = true; }
  }
}
function groceryChange(op) {
  // Checking off an item that was added offline and hasn't synced: change the waiting "add" instead.
  const m = op.url.match(/^\/api\/grocery\/(tmp-[^/]+)\/toggle$/);
  if (m) {
    const add = queue.find((q) => q.tmp === m[1]);
    const item = S.grocery.find((g) => g.id === m[1]);
    if (add) add.body.done = op.body.done;
    if (item) item.done = op.body.done;
    saveQueue(); render(); return;
  }
  queue.push(op);
  saveQueue();
  applyOp(S, op);
  render();
  flush();
}
let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      try { await api.send('POST', op.url, op.body); } catch (e) {
        if (offlineError(e)) { setOnline(false); return; }
        // The server refused it (e.g. the item was deleted meanwhile): drop it.
      }
      queue.shift();
      saveQueue();
    }
  } finally { flushing = false; }
  load(true);
}
function setOnline(v) {
  const changed = online !== v;
  online = v;
  if (changed && S) render(); // shows or hides "waiting to sync"
  const box = document.getElementById('offline');
  box.hidden = v;
  if (!v) {
    const at = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    box.textContent = `No connection to the Kitchen Hub.${at ? ` Showing what was there at ${at}.` : ''}`
      + (queue.length ? ' Your grocery changes will sync when you’re back online.' : '');
  }
}

function checkItem(text, done, onclick, sub, color) {
  return el('li', {}, el('button', { class: `chore${done ? ' done' : ''}`, onclick, style: color ? `--c:${color}` : null },
    el('span', { class: 'check' }, done ? '✓' : ''),
    el('span', {}, text, sub ? el('span', { class: 'muted small' }, ` · ${sub}`) : null)));
}

// ---------- tabs ----------
// #today #calendar #chores #groceries #more; old links to a section (#notes, #leave…) open More there.
const TABS = ['today', 'calendar', 'chores', 'groceries', 'more'];
const SECTION_TAB = { notes: 'more', leave: 'more', manage: 'more', countdowns: 'more', 'photo-frame': 'more' };
function route() {
  const h = location.hash.slice(1);
  const tab = TABS.includes(h) ? h : SECTION_TAB[h] || store.get('kh-tab') || 'today';
  document.querySelectorAll('main > .tab').forEach((t) => { t.hidden = t.id !== `tab-${tab}`; });
  document.querySelectorAll('.p-tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  store.set('kh-tab', tab);
  if (SECTION_TAB[h]) document.getElementById(h).scrollIntoView();
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// Tapping the tab you're on goes back to its top.
document.querySelectorAll('.p-tabs a').forEach((a) => a.addEventListener('click', () => {
  if (location.hash === `#${a.dataset.tab}`) window.scrollTo({ top: 0, behavior: 'smooth' });
}));
route();

// ---------- weather (straight from Open-Meteo, like the kitchen screen) ----------
let wx = store.get('kh-wx');
let lastWxTry = 0;
async function loadWeather() {
  const w = S && S.weather;
  if (!w) return;
  lastWxTry = Date.now();
  try {
    const q = new URLSearchParams({ latitude: w.latitude, longitude: w.longitude, current: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max',
      temperature_unit: w.units || 'fahrenheit', timezone: 'auto', forecast_days: 14 });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((res) => res.json());
    const days = {};
    r.daily.time.forEach((t, i) => {
      days[t] = { code: r.daily.weather_code[i], hi: Math.round(r.daily.temperature_2m_max[i]),
        lo: Math.round(r.daily.temperature_2m_min[i]), rain: r.daily.precipitation_probability_max[i] ?? 0 };
    });
    wx = { temp: Math.round(r.current.temperature_2m), code: r.current.weather_code, days, at: Date.now() };
    store.set('kh-wx', wx);
    render();
  } catch { /* keep the last forecast */ }
}
const dayWx = (d) => (wx && wx.days[ymd(d)]) || null;

// ---------- Today ----------
const fmtT = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function rainLine(today) {
  const t = dayWx(today);
  if (t && t.rain >= 40) return `${t.rain}% chance of rain today`;
  for (let i = 1; i <= 3; i++) {
    const d = addDays(today, i), f = dayWx(d);
    if (f && f.rain >= 50) return `Rain ${i === 1 ? 'tomorrow' : d.toLocaleDateString([], { weekday: 'long' })}`;
  }
  return 'No rain expected';
}
function choreGroups(day) {
  const todays = choresForToday([...S.chores, ...(S.trash || [])], day);
  const names = S.people.map((p) => p.name);
  const groups = [...S.people.map((p) => ({ name: p.name, color: p.color, mine: todays.filter((c) => c.person === p.name) })),
    { name: 'Everyone', color: '#8C8174', everyone: true, mine: todays.filter((c) => !names.includes(c.person)) }];
  return groups.map((g) => ({ ...g, done: g.mine.filter((c) => S.doneToday.includes(c.id)).length })).filter((g) => g.mine.length);
}
function ringSvg(color, frac, label) {
  const C = 2 * Math.PI * 14;
  const s = document.createElement('span');
  s.className = 'p-ring';
  s.setAttribute('aria-hidden', 'true');
  // Fixed markup; only numbers and a color from the config go in.
  s.innerHTML = `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--line)" stroke-width="3.5"/>`
    + `<circle cx="18" cy="18" r="14" fill="none" stroke="${String(color).replace(/[^#\w]/g, '')}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 18 18)"/></svg>`;
  s.append(el('b', {}, label));
  return s;
}
function renderToday() {
  const d = new Date();
  const h = d.getHours();
  document.getElementById('today-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('today-greet').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const t = dayWx(d);
  document.getElementById('today-wx').replaceChildren(...(wx ? [icon(wxKind(wx.code, h < 6 || h >= 18)), el('b', {}, `${wx.temp}°`)] : []));
  document.getElementById('today-wx-line').textContent = t ? `${WX_WORD(t.code)} · H ${t.hi}° L ${t.lo}° · ${rainLine(d)}` : '';

  document.getElementById('today-notes').replaceChildren(...S.notes.slice().reverse().map((n) =>
    el('a', { class: 'p-note', href: '#notes', style: `--c:${n.from ? personColor(S.people, n.from) : '#C2502A'}` },
      el('span', { class: 'p-note-dot' }), el('span', {}, n.text, n.from ? el('span', { class: 'muted small' }, ` · ${n.from}`) : null))));

  const evs = eventsOn(d);
  document.getElementById('today-events').replaceChildren(
    el('div', { class: 'p-card-head' }, el('h2', {}, 'Today'), el('span', { class: 'muted small' }, nextCountdown() || '')),
    ...(evs.length ? evs.map((e) => eventRow(e, d)) : [el('p', { class: 'muted' }, 'Nothing on the calendar today')]));

  const groups = choreGroups(d);
  const card = document.getElementById('today-chores');
  card.hidden = !groups.length;
  const all = groups.reduce((n, g) => n + g.mine.length, 0), done = groups.reduce((n, g) => n + g.done, 0);
  card.replaceChildren(
    el('div', { class: 'p-card-head' }, el('h2', {}, 'Chores'), el('span', { class: 'muted small' }, `${done} of ${all} done`)),
    el('div', { class: 'p-rings' }, groups.map((g) => {
      const left = g.mine.length - g.done;
      return el('div', { class: 'p-ring-person' }, ringSvg(g.color, g.done / g.mine.length, left ? String(left) : '✓'),
        el('span', { class: 'p-ring-name' }, g.name), el('span', { class: 'muted small' }, left ? `${left} left` : 'all done'));
    })));

  const left = S.grocery.filter((g) => !g.done);
  document.getElementById('today-grocery').replaceChildren(
    el('div', { class: 'p-card-head' }, el('h2', {}, 'Grocery list'), el('span', { class: 'muted small' }, left.length ? `${left.length} to get` : '')),
    el('p', { class: left.length ? 'p-groc-line' : 'muted' }, left.length ? left.map((g) => g.text).join(' · ') : 'The list is empty'));
}
function nextCountdown() {
  const c = upcomingCountdowns(S.countdowns)[0];
  return c && c.days <= 60 ? `${c.title} ${c.days === 0 ? 'is today' : c.days === 1 ? 'is tomorrow' : `in ${c.days} days`}` : '';
}
// One event: a color bar, the time and the title (dimmed once it's over, "now" while it's on).
function eventRow(e, d) {
  const past = !e.allDay && new Date(e.end) <= d;
  const on = !e.allDay && new Date(e.start) <= d && !past;
  const time = e.allDay ? 'All day' : `${fmtT(e.start)} – ${fmtT(e.end)}`;
  return el('div', { class: `p-ev${past ? ' past' : ''}`, style: `--c:${e.color || '#C2502A'}` },
    el('span', { class: 'p-ev-bar' }),
    el('span', { class: 'p-ev-text' }, el('span', { class: 'p-ev-title' }, e.title, on ? el('span', { class: 'p-now' }, 'now') : null),
      el('span', { class: 'muted small' }, [time, e.location].filter(Boolean).join(' · '))));
}

// ---------- Calendar: the next week as an agenda ----------
let agendaDays = 7;
function renderAgenda() {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < agendaDays; i++) {
    const d = addDays(today, i);
    const evs = eventsOn(d);
    const f = dayWx(d);
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long' });
    days.push(el('div', { class: `p-day${i === 0 ? ' today' : ''}` },
      el('div', { class: 'p-day-head' },
        el('h2', {}, name, el('span', { class: 'muted small' }, ` · ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`)),
        f ? el('span', { class: 'p-day-wx muted small' }, icon(wxKind(f.code)), `${f.hi}° / ${f.lo}°`, f.rain >= 40 ? ` · ${f.rain}%` : '') : null),
      evs.length ? evs.map((e) => eventRow(e, now)) : el('p', { class: 'muted small' }, 'Nothing planned')));
  }
  document.getElementById('agenda').replaceChildren(...days);
  document.getElementById('agenda-more').hidden = agendaDays >= 28;
}
document.getElementById('agenda-more').addEventListener('click', () => { agendaDays += 7; renderAgenda(); });

// ---------- Chores: one list, filtered by person ----------
let choreWho = store.get('kh-who') || 'All';
function renderChores() {
  const d = new Date();
  const groups = choreGroups(d);
  if (choreWho !== 'All' && !groups.some((g) => g.name === choreWho)) choreWho = 'All';
  const total = groups.reduce((n, g) => n + g.mine.length, 0), done = groups.reduce((n, g) => n + g.done, 0);
  document.getElementById('chores-total').textContent = total ? `${done} of ${total} done` : '';
  const chip = (name, color, left) => el('button', { class: 'chip', 'aria-pressed': String(choreWho === name),
    onclick: () => { choreWho = name; store.set('kh-who', name); renderChores(); } },
  el('span', { class: 'chip-dot', style: `background:${color}` }), name === 'All' ? 'All' : `${name} ${left || '✓'}`);
  document.getElementById('chore-chips').replaceChildren(...(groups.length > 1 ? [chip('All', '#B9AC9C'),
    ...groups.map((g) => chip(g.name, g.color, g.mine.length - g.done))] : []));
  const rows = groups.filter((g) => choreWho === 'All' || g.name === choreWho)
    .flatMap((g) => g.mine.map((c) => ({ c, g, done: S.doneToday.includes(c.id) })))
    .sort((a, b) => a.done - b.done);
  const t = document.getElementById('chores-today');
  t.replaceChildren(...rows.map(({ c, g, done: isDone }) => checkItem(c.title, isDone,
    () => act(() => api.send('POST', `/api/chores/${c.id}/toggle`)),
    [choreWho === 'All' ? g.name : '', isDone ? '' : lateLabel(c)].filter(Boolean).join(' · '), g.color)));
  if (!rows.length) t.replaceChildren(el('p', { class: 'empty' }, 'Nothing today.'));
  const stars = S.people.map((p) => [p.name, S.stars[p.name] || 0]).sort((a, b) => b[1] - a[1]);
  document.getElementById('chore-stars').textContent = stars.length ? `★ This week: ${stars.map(([n, s]) => `${n} ${s}`).join(' · ')}` : '';
}

// ---------- editing ----------
// Tapping an item in a list fills its form; the button becomes "Save changes" until saved or cancelled.
const editing = {};
function makeEditable(formId, kind, addLabel, onReset) {
  const form = document.getElementById(formId);
  const submit = form.querySelector('button:not([type="button"])');
  const cancel = el('button', { type: 'button', class: 'ghost', hidden: true, onclick: () => stopEdit(kind) }, 'Cancel');
  submit.after(cancel);
  editing[kind] = { id: null, form, submit, cancel, addLabel, onReset };
}
function startEdit(kind, id, fill) {
  const e = editing[kind];
  e.id = id;
  fill();
  e.submit.textContent = 'Save changes';
  e.cancel.hidden = false;
  e.form.classList.add('editing');
  e.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function stopEdit(kind) {
  const e = editing[kind];
  e.id = null;
  e.form.reset();
  if (e.onReset) e.onReset();
  e.submit.textContent = e.addLabel;
  e.cancel.hidden = true;
  e.form.classList.remove('editing');
}
function saveOrAdd(kind, url, body) {
  const id = editing[kind].id;
  stopEdit(kind);
  return act(() => api.send(id ? 'PUT' : 'POST', id ? `${url}/${id}` : url, body));
}
const setDays = (box, days) => box.querySelectorAll('input').forEach((i) => { i.checked = (days || []).includes(Number(i.value)); });
// A list row whose text opens it for editing.
const editRow = (onEdit, content, onDelete) => el('li', {},
  el('button', { class: 'item-edit', onclick: onEdit, title: 'Edit' }, content),
  el('button', { class: 'x', title: 'Delete', onclick: onDelete }, '✕'));

function render() {
  renderToday();
  renderAgenda();
  renderChores();

  // Groceries: what's left first; changes go through the offline queue.
  const g = document.getElementById('grocery');
  const items = [...S.grocery.filter((i) => !i.done), ...S.grocery.filter((i) => i.done)];
  g.replaceChildren(...items.map((i) => checkItem(i.text, i.done,
    () => groceryChange({ url: `/api/grocery/${i.id}/toggle`, body: { done: !i.done } }),
    i.pending && !online ? 'waiting to sync' : '')));
  if (!S.grocery.length) g.replaceChildren(el('p', { class: 'empty' }, 'The list is empty.'));
  const leftN = S.grocery.filter((i) => !i.done).length;
  document.getElementById('grocery-count').textContent = leftN ? `${leftN} to get` : '';
  document.getElementById('grocery-clear').hidden = !S.grocery.some((i) => i.done);
  const recent = (S.recentGroceries || []).filter((t) => !S.grocery.some((i) => !i.done && i.text.toLowerCase() === t.toLowerCase())).slice(0, 10);
  document.getElementById('grocery-quick').replaceChildren(...(recent.length ? [el('div', { class: 'quick' }, el('span', { class: 'quick-label' }, 'Add again:'),
    recent.map((t) => el('button', { class: 'quick-chip', onclick: () => addGrocery(t) }, `+ ${t}`)))] : []));

  // People dropdown (keep the current choice)
  const sel = document.getElementById('chore-person');
  const keep = sel.value;
  sel.replaceChildren(el('option', { value: '' }, 'Everyone'), ...S.people.map((p) => el('option', { value: p.name }, p.name)));
  sel.value = keep;

  // All chores
  // (Finished one-time chores stay on the server until the week is over, for the star counts, but aren't listed.)
  document.getElementById('chore-list').replaceChildren(...S.chores.filter((c) => !c.date || c.date >= ymd(new Date()) || !c.doneOn).map((c) => editRow(
    () => startEdit('chore', c.id, () => {
      document.getElementById('chore-title').value = c.title;
      document.getElementById('chore-person').value = c.person || '';
      choreWhenPicker.set(c);
    }),
    [el('b', {}, c.title), el('span', { class: 'muted small' }, ` · ${c.person || 'Everyone'} · ${choreWhen(c)}`)],
    () => confirm(`Delete "${c.title}"?`) && act(() => api.send('DELETE', `/api/chores/${c.id}`)))));

  // Weather alerts (only re-drawn when they change, so an open one stays open)
  const sig = activeAlerts(S.alerts).map((a) => a.id).join('|');
  if (sig !== alertSig) { alertSig = sig; document.getElementById('alerts').replaceChildren(...alertBanners(S.alerts)); }

  // Notes
  const from = document.getElementById('note-from');
  const keepFrom = from.value;
  from.replaceChildren(el('option', { value: '' }, 'From: nobody'), ...S.people.map((p) => el('option', { value: p.name }, `From: ${p.name}`)));
  from.value = keepFrom;
  document.getElementById('note-list').replaceChildren(...S.notes.slice().reverse().map((n) => editRow(
    () => startEdit('note', n.id, () => {
      document.getElementById('note-text').value = n.text;
      document.getElementById('note-from').value = n.from || '';
    }),
    [n.text, el('span', { class: 'muted small' }, ` · ${n.from ? `${n.from} · ` : ''}until ${new Date(n.expires).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`)],
    () => act(() => api.send('DELETE', `/api/notes/${n.id}`)))));

  // Leave-by times
  const depTime = (t) => { const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  const depDays = (days) => (!days || !days.length || days.length === 7 ? 'Every day'
    : days.join(',') === '1,2,3,4,5' ? 'Weekdays' : days.join(',') === '0,6' ? 'Weekends' : days.map((d) => DAY_NAMES[d]).join(' '));
  document.getElementById('dep-list').replaceChildren(...(S.departures || []).map((d) => editRow(
    () => startEdit('dep', d.id, () => {
      document.getElementById('dep-label').value = d.label;
      document.getElementById('dep-time').value = d.time;
      setDays(depDaysBox, d.days);
      depSchool.checked = schoolDeparture(d);
      depSchoolTouched = true;
    }),
    [el('b', {}, d.label), el('span', { class: 'muted small' }, ` · ${depTime(d.time)} · ${depDays(d.days)}${schoolDeparture(d) ? ' · skipped on days off' : ''}`)],
    () => confirm(`Delete "${d.label}"?`) && act(() => api.send('DELETE', `/api/departures/${d.id}`)))));

  // Countdowns
  document.getElementById('countdown-list').replaceChildren(...upcomingCountdowns(S.countdowns).map((c) => editRow(
    () => startEdit('countdown', c.id, () => {
      document.getElementById('cd-title').value = c.title;
      document.getElementById('cd-date').value = c.date;
      document.getElementById('cd-yearly').checked = !!c.yearly;
    }),
    [el('b', {}, c.title), el('span', { class: 'muted small' }, ` · ${c.when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${daysLabel(c.days)}${c.yearly ? ' · yearly' : ''}`)],
    () => confirm(`Delete "${c.title}"?`) && act(() => api.send('DELETE', `/api/countdowns/${c.id}`)))));

  // Photos
  document.getElementById('photo-count').textContent = S.photos.length ? `· ${S.photos.length}` : '';
  document.getElementById('photos').replaceChildren(...S.photos.map((name) =>
    el('div', { class: 'thumb' },
      el('img', { src: `/photos/${encodeURIComponent(name)}`, loading: 'lazy', alt: '', onclick: () => viewPhoto(name) }),
      el('button', { class: 'x', title: 'Delete', onclick: () => deletePhoto(name) }, '✕'))));
  if (!S.photos.length) document.getElementById('photos').replaceChildren(el('p', { class: 'empty' }, 'No photos yet.'));
}

// Uploaded photos are named "<time added>-<random>.jpg".
function photoAdded(name) {
  const t = Number(name.split('-')[0]);
  return t > 1e12 ? new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : null;
}
function deletePhoto(name) {
  if (!confirm('Delete this photo from the frame?')) return false;
  act(() => api.send('DELETE', `/api/photos/${encodeURIComponent(name)}`));
  return true;
}
const viewer = document.getElementById('photo-view');
let viewing = null;
function viewPhoto(name) {
  viewing = name;
  document.getElementById('photo-view-img').src = `/photos/${encodeURIComponent(name)}`;
  const added = photoAdded(name);
  document.getElementById('photo-view-info').textContent = added ? `Added ${added}` : '';
  viewer.showModal();
}
document.getElementById('photo-view-close').addEventListener('click', () => viewer.close());
document.getElementById('photo-view-delete').addEventListener('click', () => { if (deletePhoto(viewing)) viewer.close(); });
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });

// Day picker
const daysBox = document.getElementById('chore-days');
DAY_NAMES.forEach((d, i) => {
  daysBox.append(el('label', {}, el('input', { type: 'checkbox', value: i }), el('span', {}, d)));
});
const choreWhenPicker = whenPicker({ select: document.getElementById('chore-when'), days: daysBox,
  date: document.getElementById('chore-date'), hint: document.getElementById('chore-days-hint') });

// Leave-by day picker (weekdays picked by default)
const depDaysBox = document.getElementById('dep-days');
const depSchool = document.getElementById('dep-school');
let depSchoolTouched = false;
const resetDepDays = () => {
  depDaysBox.querySelectorAll('input').forEach((i) => { i.checked = i.value >= 1 && i.value <= 5; });
  depSchool.checked = false;
  depSchoolTouched = false;
};
// "School drop-off" ticks "skip on days with no school" for you, unless you've changed it yourself.
depSchool.addEventListener('change', () => { depSchoolTouched = true; });
document.getElementById('dep-label').addEventListener('input', (e) => {
  if (!depSchoolTouched) depSchool.checked = /school/i.test(e.target.value);
});
DAY_NAMES.forEach((d, i) => {
  depDaysBox.append(el('label', {}, el('input', { type: 'checkbox', value: i }), el('span', {}, d)));
});
resetDepDays();
document.getElementById('dep-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const label = document.getElementById('dep-label').value.trim();
  const time = document.getElementById('dep-time').value;
  const days = [...depDaysBox.querySelectorAll('input:checked')].map((i) => Number(i.value));
  if (!label || !time) return;
  saveOrAdd('dep', '/api/departures', { label, time, days, school: depSchool.checked });
});

document.getElementById('grocery-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('grocery-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addGrocery(text);
});
function addGrocery(text) {
  groceryChange({ url: '/api/grocery', body: { text }, tmp: `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
}
document.getElementById('grocery-clear').addEventListener('click', () => groceryChange({ url: '/api/grocery/clear-done', body: {} }));

document.getElementById('chore-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('chore-title').value.trim();
  const person = document.getElementById('chore-person').value;
  if (!title) return;
  saveOrAdd('chore', '/api/chores', { title, person, ...choreWhenPicker.get() });
});

document.getElementById('note-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('note-text');
  const text = input.value.trim();
  if (!text) return;
  saveOrAdd('note', '/api/notes', {
    text, from: document.getElementById('note-from').value, days: Number(document.getElementById('note-days').value),
  });
});

document.getElementById('countdown-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('cd-title').value.trim();
  const date = document.getElementById('cd-date').value;
  const yearly = document.getElementById('cd-yearly').checked;
  if (!title || !date) return;
  const when = countdownDate({ date, yearly });
  if (!yearly && daysUntil(when) < 0) return alert('That date has already passed. Tick "Repeats every year" for birthdays.');
  saveOrAdd('countdown', '/api/countdowns', { title, date, yearly });
});

makeEditable('chore-form', 'chore', 'Add chore', () => choreWhenPicker.reset());
makeEditable('note-form', 'note', 'Post note');
makeEditable('countdown-form', 'countdown', 'Add countdown');
makeEditable('dep-form', 'dep', 'Add leave-by time', resetDepDays);

document.getElementById('photo-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const status = document.getElementById('upload-status');
  status.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
  const form = new FormData();
  files.forEach((f) => form.append('photos', f));
  try {
    const r = await fetch('/api/photos', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) status.textContent = 'Upload failed.';
    else {
      const skipped = j.skipped || [];
      const rejected = files.length - j.added - skipped.length; // not a supported image type
      status.textContent = [
        `Added ${j.added}.`,
        skipped.length ? `Skipped ${skipped.length} already in the frame.` : '',
        rejected > 0 ? `${rejected} couldn't be added (use JPEG, PNG, WebP or GIF).` : '',
      ].filter(Boolean).join(' ');
    }
  } catch {
    status.textContent = 'Upload failed. Are you on the home Wi-Fi?';
  }
  e.target.value = '';
  load(true);
});

document.getElementById('cal-refresh').addEventListener('click', async (e) => {
  e.target.textContent = 'Updating…';
  try {
    const r = await api.send('POST', '/api/calendar/refresh');
    e.target.textContent = r.errors.length ? `Problem: ${r.errors.join('; ')}` : 'Updated ✓';
  } catch {
    e.target.textContent = 'Couldn’t reach the Kitchen Hub';
  }
  setTimeout(() => { e.target.textContent = 'Update calendar now'; }, 4000);
});

async function load(force) {
  try {
    if (!force && S && online && !queue.length) {
      const { version } = await api.get('/api/version');
      if (version === lastVersion) return;
    }
    const fresh = await api.get('/api/state');
    lastVersion = fresh.version;
    savedAt = Date.now();
    store.set('kh-state', { S: fresh, at: savedAt });
    S = fresh;
    queue.forEach((op) => applyOp(S, op)); // changes still waiting to sync
    setOnline(true);
    render();
    if (queue.length) flush();
    if (Date.now() - lastWxTry > (wx && Date.now() - wx.at < 3600e3 ? 30 : 5) * 60e3) loadWeather();
  } catch {
    setOnline(false);
  }
}
// Show the saved copy right away, then catch up.
const saved = store.get('kh-state');
if (saved && saved.S) {
  S = saved.S;
  savedAt = saved.at;
  queue.forEach((op) => applyOp(S, op));
  render();
}
load(true);
setInterval(() => load(false), 5000);
// Coming back to the page (e.g. reopening it in the store): check right away.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
window.addEventListener('online', () => load(true));

// Opens with no signal too, once the page is served over HTTPS (service workers need it).
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
