// Phone editor.
let S = null;
let lastVersion = 0;
let alertSig = null;

async function act(fn) {
  try { await fn(); } catch (e) { alert(`That didn't save: ${e.message}`); }
  load(true);
}

function checkItem(text, done, onclick, sub) {
  return el('li', {}, el('button', { class: `chore${done ? ' done' : ''}`, onclick },
    el('span', { class: 'check' }, done ? '✓' : ''), el('span', {}, text, sub ? el('span', { class: 'muted small' }, ` · ${sub}`) : null)));
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
  // Groceries
  const g = document.getElementById('grocery');
  g.replaceChildren(...S.grocery.map((i) => checkItem(i.text, i.done, () => act(() => api.send('POST', `/api/grocery/${i.id}/toggle`)))));
  if (!S.grocery.length) g.replaceChildren(el('p', { class: 'empty' }, 'The list is empty.'));
  document.getElementById('grocery-clear').hidden = !S.grocery.some((i) => i.done);
  const recent = (S.recentGroceries || []).slice(0, 10);
  document.getElementById('grocery-quick').replaceChildren(...(recent.length ? [el('div', { class: 'quick' }, el('span', { class: 'quick-label' }, 'Add again:'),
    recent.map((t) => el('button', { class: 'quick-chip', onclick: () => act(() => api.send('POST', '/api/grocery', { text: t })) }, `+ ${t}`)))] : []));

  // Today's chores
  const t = document.getElementById('chores-today');
  const todays = choresForToday([...S.chores, ...(S.trash || [])]);
  t.replaceChildren(...todays.map((c) => checkItem(c.title, S.doneToday.includes(c.id),
    () => act(() => api.send('POST', `/api/chores/${c.id}/toggle`)), [c.person || 'Everyone', lateLabel(c)].filter(Boolean).join(' · '))));
  if (!todays.length) t.replaceChildren(el('p', { class: 'empty' }, 'Nothing today.'));

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
    }),
    [el('b', {}, d.label), el('span', { class: 'muted small' }, ` · ${depTime(d.time)} · ${depDays(d.days)}`)],
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
const resetDepDays = () => depDaysBox.querySelectorAll('input').forEach((i) => { i.checked = i.value >= 1 && i.value <= 5; });
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
  saveOrAdd('dep', '/api/departures', { label, time, days });
});

document.getElementById('grocery-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('grocery-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  act(() => api.send('POST', '/api/grocery', { text }));
});
document.getElementById('grocery-clear').addEventListener('click', () => act(() => api.send('POST', '/api/grocery/clear-done')));

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
    if (!force && S) {
      const { version } = await api.get('/api/version');
      if (version === lastVersion) return;
    }
    S = await api.get('/api/state');
    lastVersion = S.version;
    render();
  } catch { /* try again on the next tick */ }
}
load(true);
setInterval(() => load(false), 5000);
