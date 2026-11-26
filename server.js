// Kitchen Hub: a local server for the kitchen display and the phone editor.
// Data lives in data/ (state.json + photos/). Settings live in config.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const ical = require('node-ical');
// Makes the phone page's thumbnails. If it isn't installed yet (pulled an update but didn't run
// npm install), the grid falls back to the full-size photos instead of the server failing to start.
let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('sharp is missing: run "npm install" for fast photo thumbnails.'); }
// Converts videos into a light copy for the slideshow (see "slideshow copies of videos" below).
let ffmpeg = null;
try { ffmpeg = require('ffmpeg-static'); if (!ffmpeg || !fs.existsSync(ffmpeg)) ffmpeg = null; } catch { /* not installed */ }
if (!ffmpeg) console.warn('ffmpeg-static is missing: run "npm install" so slideshow videos play smoothly.');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const THUMB_DIR = path.join(DATA_DIR, 'thumbs'); // small copies for the phone page's grid
const UPLOAD_TMP = path.join(DATA_DIR, 'upload-tmp'); // video stills on their way to thumbs/
const SLIDE_DIR = path.join(DATA_DIR, 'slideshow'); // 1080p 30 fps copies of videos, for the kitchen screen
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const CONFIG_EXAMPLE = path.join(ROOT, 'config.example.json');

fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });
fs.mkdirSync(SLIDE_DIR, { recursive: true });
for (const f of fs.readdirSync(SLIDE_DIR)) if (f.endsWith('.tmp.mp4')) fs.rmSync(path.join(SLIDE_DIR, f), { force: true }); // cut off mid-conversion
fs.rmSync(UPLOAD_TMP, { recursive: true, force: true }); // leftovers from an interrupted upload
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_EXAMPLE, CONFIG_FILE);

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const PORT = config.port || 8080;

// ---------- state (chores, grocery list) ----------
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { chores: [], done: {}, grocery: [] };
  }
}
let state = loadState();
state.countdowns ||= [];
state.notes ||= [];
state.departures ||= [];
state.groceryHistory ||= {};
// Seed quick-add buttons from anything already on the list.
for (const g of state.grocery) state.groceryHistory[g.text.toLowerCase()] ||= { text: g.text, count: 1, last: 0 };
function saveState() {
  // Write to a temp file first so a power cut can't leave half a file.
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  version++;
}
let version = 1; // bumped on every change so screens know to refresh

const id = () => crypto.randomBytes(6).toString('hex');
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- calendars ----------
// "Sam: Soccer" or "Sam - Soccer" → Sam's color, shown as "Soccer".
// "Sam's recital" → Sam's color, title kept as is.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function personFromTitle(title) {
  for (const p of config.people || []) {
    const name = escapeRe(p.name);
    const prefix = title.match(new RegExp(`^\\s*${name}\\s*[:\\-–—]\\s*(.+)$`, 'i'));
    if (prefix) return { person: p.name, title: prefix[1].trim() };
    if (new RegExp(`^\\s*${name}(['’]s)?\\b`, 'i').test(title)) return { person: p.name, title };
  }
  return { person: '', title };
}
const personColorOf = (name) => ((config.people || []).find((p) => p.name === name) || {}).color || '';
// Event descriptions can contain HTML (Google) or long meeting boilerplate; keep plain, short text.
function cleanDescription(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
}

let calendarCache = { events: [], holidays: [], noSchool: [], fetchedAt: null, errors: [] };

// Days with no school, so "School drop-off" can skip them. On a calendar marked "school": true in config.json,
// days off are events like "Student Holiday", "Thanksgiving Break" or "Staff Development Day". Big US holidays
// from any calendar count too.
const NO_SCHOOL = /\b(no school|no classes|student holiday|holidays?|break|vacation|closed|closure|teacher|staff|professional (development|learning)|in-?service|work ?day|planning day|bad weather|inclement|non-?instructional)\b/i;
const NOT_A_DAY_OFF = /\b(early (release|dismissal)|half day|minimum day|first day|last day|appreciation|picture|report card|meeting|board|game)\b/i;
const NO_SCHOOL_HOLIDAYS = ["new year's day", 'martin luther king jr. day', 'memorial day', 'independence day', 'labor day',
  'thanksgiving day', 'christmas eve', 'christmas day', "new year's eve"];
// Or list them in config.json, for districts with no calendar link: "schoolDaysOff": ["2026-09-07", "2026-11-23..2026-11-27"].
function configDaysOff() {
  const days = [];
  for (const entry of Array.isArray(config.schoolDaysOff) ? config.schoolDaysOff : []) {
    const [a, b = a] = String(entry).split('..').map((s) => s.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) continue;
    const d = new Date(`${a}T12:00`);
    for (let n = 0; localDate(d) <= b && n < 60; n++) { days.push(localDate(d)); d.setDate(d.getDate() + 1); }
  }
  return days;
}
function noSchoolDays(item, cal, title) {
  const isOff = (cal.school && NO_SCHOOL.test(title) && !NOT_A_DAY_OFF.test(title)) || NO_SCHOOL_HOLIDAYS.includes(normTitle(title));
  if (!isOff) return [];
  const days = [];
  const d = new Date(item.start);
  d.setHours(12, 0, 0, 0);
  const end = new Date(item.end || item.start);
  // An all-day event's end is the morning after its last day.
  do { days.push(localDate(d)); d.setDate(d.getDate() + 1); } while (d < end && days.length < 30);
  return days;
}

// Holidays that get a countdown automatically, matched against event titles in any calendar
// (e.g. Google's US holidays calendar). "holidayCountdowns" in config.json replaces the list; false turns it off.
const DEFAULT_HOLIDAY_COUNTDOWNS = ["New Year's Day", "Valentine's Day", 'Easter Sunday', "Mother's Day", 'Memorial Day',
  "Father's Day", 'Independence Day', 'Labor Day', 'Halloween', 'Thanksgiving Day', 'Christmas Day'];
const normTitle = (s) => String(s).replace(/[’‘]/g, "'").trim().toLowerCase();
const holidayNames = () => new Set((config.holidayCountdowns === false ? []
  : Array.isArray(config.holidayCountdowns) ? config.holidayCountdowns : DEFAULT_HOLIDAY_COUNTDOWNS).map(normTitle));

async function refreshCalendars() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 49);

  // Holiday countdowns look a year ahead, further than the events shown on the calendar.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearOut = new Date(today);
  yearOut.setDate(yearOut.getDate() + 370);
  const wanted = holidayNames();

  const events = [];
  const holidays = new Map(); // date -> { title, date }
  const noSchool = new Set();
  const errors = [];
  for (const cal of config.calendars || []) {
    if (!cal.url || cal.url.includes('PASTE')) continue;
    try {
      const url = cal.url.replace(/^webcal:/i, 'https:');
      const data = await ical.async.fromURL(url);
      for (const item of Object.values(data)) {
        if (item.type !== 'VEVENT') continue;
        const text = (v) => (v && typeof v === 'object' ? v.val : v) || '';
        if (wanted.has(normTitle(text(item.summary)))) {
          for (const inst of ical.expandRecurringEvent(item, { from: today, to: yearOut })) {
            const date = localDate(inst.start);
            if (!holidays.has(date)) holidays.set(date, { title: text(inst.summary) || text(item.summary), date });
          }
        }
        const instances = ical.expandRecurringEvent(item, { from, to, expandOngoing: true });
        for (const inst of instances) {
          const raw = text(inst.summary) || text(item.summary) || '(no title)';
          const { person, title } = personFromTitle(raw);
          for (const day of noSchoolDays(inst, cal, raw)) noSchool.add(day);
          events.push({
            title,
            person,
            calendar: cal.name,
            color: person ? personColorOf(person) : cal.color,
            location: text(inst.location || item.location).slice(0, 200),
            description: cleanDescription(text(inst.description || item.description)),
            allDay: inst.isFullDay,
            // All-day events are sent as plain dates so time zones can't shift them a day.
            start: inst.isFullDay ? localDate(inst.start) : inst.start.toISOString(),
            end: inst.isFullDay ? localDate(inst.end) : inst.end.toISOString(),
          });
        }
      }
    } catch (err) {
      errors.push(`${cal.name}: ${err.message}`);
      console.error(`Calendar "${cal.name}" failed:`, err.message);
    }
  }
  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  // Keep the last good copy of a calendar if this fetch failed for every calendar.
  if (events.length || !errors.length) {
    calendarCache.events = events;
    calendarCache.holidays = [...holidays.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    calendarCache.noSchool = [...noSchool].sort();
  }
  calendarCache.fetchedAt = new Date().toISOString();
  calendarCache.errors = errors;
  version++;
}

// ---------- weather alerts (National Weather Service; US locations only) ----------
let alertsCache = { alerts: [], fetchedAt: null, error: null };
const SEVERITY_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

// NWS text is hard-wrapped at ~70 characters; keep paragraph breaks, join the rest.
const unwrap = (s) => (s || '').replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');

async function refreshAlerts() {
  const w = config.weather;
  if (!w || w.latitude == null || w.longitude == null) return;
  try {
    const point = `${Number(w.latitude).toFixed(4)},${Number(w.longitude).toFixed(4)}`;
    const r = await fetch(`https://api.weather.gov/alerts/active?point=${point}`, {
      headers: { 'User-Agent': 'KitchenHub/1.0 (home kitchen display)', Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`weather.gov answered ${r.status}`);
    const j = await r.json();
    const alerts = (j.features || [])
      .map((f) => f.properties)
      .filter((p) => p.status === 'Actual' && p.messageType !== 'Cancel')
      .map((p) => ({
        id: p.id,
        event: p.event,
        severity: p.severity,
        headline: p.headline || '',
        description: unwrap(p.description),
        instruction: unwrap(p.instruction),
        ends: p.ends || p.expires || null,
      }))
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4));
    const changed = JSON.stringify(alerts) !== JSON.stringify(alertsCache.alerts);
    alertsCache = { alerts, fetchedAt: new Date().toISOString(), error: null };
    if (changed) version++;
  } catch (err) {
    // Keep showing the last alerts we had; the screens drop them once they expire.
    alertsCache.error = err.message;
    console.error('Weather alerts failed:', err.message);
  }
}

// ---------- monitor off overnight (Windows) ----------
// The kitchen screen asks for this when it's late and nobody's using it. Any key or
// touchpad touch wakes the monitor; in the morning the screen asks for it to come back on.
const { execFile } = require('child_process');
function setMonitor(on) {
  if (process.platform !== 'win32') return;
  const api = `Add-Type -Namespace KH -Name Mon -MemberDefinition '` +
    `[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);` +
    `[DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);';`;
  // PostMessage (not SendMessage) so one unresponsive window can't hang the call.
  const cmd = on
    ? `${api} [KH.Mon]::mouse_event(1, 1, 0, 0, [UIntPtr]::Zero); [KH.Mon]::mouse_event(1, -1, 0, 0, [UIntPtr]::Zero); [void][KH.Mon]::PostMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr](-1))`
    : `${api} [void][KH.Mon]::PostMessage([IntPtr]0xffff, 0x0112, [IntPtr]0xF170, [IntPtr]2)`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 20000 }, (err) => {
    if (err) console.error(`Monitor ${on ? 'on' : 'off'} failed:`, err.message);
  });
}

// ---------- tidy-up: expired notes, past countdowns and old one-time chores ----------
function prune() {
  const now = Date.now();
  const today = localDate();
  const notes = state.notes.filter((n) => new Date(n.expires).getTime() > now);
  const countdowns = state.countdowns.filter((c) => c.yearly || c.date >= today);
  // One-time chores roll over until they're done; done ones stay (hidden) until the week is over, so their stars still count.
  const since = weekStart();
  const chores = state.chores.filter((c) => {
    if (!c.date || c.date >= since) return true;
    const done = doneOn(c);
    return !done || done >= since;
  });
  if (notes.length !== state.notes.length || countdowns.length !== state.countdowns.length || chores.length !== state.chores.length) {
    state.notes = notes;
    state.countdowns = countdowns;
    state.chores = chores;
    saveState();
  }
}

// This PC's address on the home network, printed when the server starts.
const VIRTUAL_ADAPTER = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Bluetooth|Tailscale|ZeroTier/i;
function lanAddress() {
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) found.push(a.address);
    }
  }
  // Prefer the usual home-router ranges.
  return found.find((ip) => ip.startsWith('192.168.')) || found.find((ip) => ip.startsWith('10.')) || found[0] || os.hostname().toLowerCase();
}

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/photos', express.static(PHOTO_DIR, { maxAge: '1d' }));
app.get('/phone', (req, res) => res.sendFile(path.join(ROOT, 'public', 'phone.html')));

// Everything a screen needs, in one request.
app.get('/api/state', (req, res) => {
  const today = localDate();
  res.json({
    version,
    today,
    people: config.people || [],
    services: config.services || [],
    weather: config.weather || null,
    idleMinutes: config.photoFrameAfterMinutes ?? 5,
    slideSeconds: config.slideSeconds ?? 8,
    screenOffAt: config.screenOffAt === undefined ? '0:00' : config.screenOffAt, // false = never
    calendar: { ...calendarCache, noSchool: [...new Set([...calendarCache.noSchool, ...configDaysOff()])].sort() },
    chores: state.chores.map((c) => (c.date ? { ...c, doneOn: doneOn(c) } : c)),
    trash: trashChores(),
    doneToday: state.done[today] || [],
    stars: starCounts(),
    grocery: state.grocery,
    countdowns: state.countdowns,
    departures: state.departures,
    modes: config.modes || null,
    countdownDays: config.showCountdownsWithinDays ?? 60,
    holidayDecor: config.holidayDecor !== false,
    seasonDecor: config.seasonDecor !== false,
    holidayMotion: config.holidayMotion !== false,
    notes: state.notes.filter((n) => new Date(n.expires).getTime() > Date.now()),
    alerts: alertsCache.alerts,
    photos: listPhotos(),
    videos: listVideos(),
    // Videos still without a thumbnail; the kitchen screen makes them (see makeStills in app.js).
    // (With ffmpeg the server makes them itself, so only videos it couldn't convert are left to the screen.)
    needStill: sharp ? listVideos().filter((n) => !fs.existsSync(thumbPath(n)) && (!ffmpeg || convertFailed.has(n))) : [],
    // Videos the slideshow should wait for while their light copy is made (null: no ffmpeg, play originals).
    videosConverting: ffmpeg ? listVideos().filter((n) => !slideReady(n) && !convertFailed.has(n)) : null,
    videoSound: config.videoSound === true,
    recentGroceries: recentGroceries(),
  });
});
app.get('/api/version', (req, res) => res.json({ version }));

// Only the kitchen screen itself (on this PC) may switch the monitor.
app.post('/api/display/:state', (req, res) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local) return res.status(403).json({ error: 'only from the kitchen screen' });
  if (!['on', 'off'].includes(req.params.state)) return res.status(400).json({ error: 'on or off' });
  setMonitor(req.params.state === 'on');
  res.json({ ok: true });
});

// Each "add" form also has an edit (PUT) that takes the same fields.
const cleanDays = (days) => [...new Set((Array.isArray(days) ? days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
const findOr404 = (list, req, res) => {
  const item = list.find((x) => x.id === req.params.id);
  if (!item) res.status(404).json({ error: 'not found' });
  return item;
};

// Chores
// A chore repeats on its weekdays (none = every day), or happens once on "date" (YYYY-MM-DD).
function choreFields(body) {
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
  return { title, person: String(body.person || '').slice(0, 40), days: date ? [] : cleanDays(body.days), date };
}
app.post('/api/chores', (req, res) => {
  const f = choreFields(req.body);
  if (!f) return res.status(400).json({ error: 'title required' });
  state.chores.push({ id: id(), ...f });
  saveState();
  res.json({ ok: true });
});
app.put('/api/chores/:id', (req, res) => {
  const f = choreFields(req.body);
  if (!f) return res.status(400).json({ error: 'title required' });
  const item = findOr404(state.chores, req, res);
  if (!item) return;
  Object.assign(item, f);
  saveState();
  res.json({ ok: true });
});
app.delete('/api/chores/:id', (req, res) => {
  state.chores = state.chores.filter((c) => c.id !== req.params.id);
  saveState();
  res.json({ ok: true });
});
app.post('/api/chores/:id/toggle', (req, res) => {
  const today = localDate();
  const list = (state.done[today] ||= []);
  const i = list.indexOf(req.params.id);
  if (i >= 0) list.splice(i, 1);
  else list.push(req.params.id);
  // Forget completions older than 60 days.
  const cutoff = localDate(new Date(Date.now() - 60 * 864e5));
  for (const d of Object.keys(state.done)) if (d < cutoff) delete state.done[d];
  saveState();
  res.json({ ok: true });
});

// The first day a one-time chore was checked off, on or after its date (so moving it to a new date starts it fresh).
function doneOn(c) {
  return Object.keys(state.done).sort().find((d) => d >= c.date && state.done[d].includes(c.id));
}

// Trash pickup: "trash": [{ "name": "Trash", "days": ["Mon", "Thu"], "person": "Dad" }, …] in config.json.
// Each pickup becomes a "Put out the trash" chore the evening before, still showing on pickup morning if nobody did it.
const DAY_WORDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const trashList = () => (Array.isArray(config.trash) ? config.trash : []).map((t) => ({
  name: String(t.name || 'Trash'),
  person: String(t.person || ''),
  days: (Array.isArray(t.days) ? t.days : []).map((d) => (typeof d === 'number' ? d : DAY_WORDS.indexOf(String(d).slice(0, 3).toLowerCase()))).filter((d) => d >= 0 && d <= 6),
}));
function trashChores() {
  const out = [];
  const list = trashList();
  // A few days either side, so ?at= previews work too.
  for (let n = -2; n <= 8; n++) {
    const pickup = new Date();
    pickup.setDate(pickup.getDate() + n);
    const eve = new Date(pickup);
    eve.setDate(pickup.getDate() - 1);
    list.forEach((t, i) => {
      if (!t.days.includes(pickup.getDay())) return;
      const cid = `trash-${localDate(pickup)}-${i}`;
      const done = [localDate(eve), localDate(pickup)].find((d) => (state.done[d] || []).includes(cid));
      out.push({ id: cid, title: `Put out the ${t.name.toLowerCase()}`, person: t.person, days: [], date: localDate(eve), pickup: localDate(pickup), doneOn: done });
    });
  }
  return out;
}
function trashPerson(cid) {
  const m = /^trash-\d{4}-\d{2}-\d{2}-(\d+)$/.exec(cid);
  return m ? (trashList()[Number(m[1])] || {}).person : undefined;
}

// Stars this week (since Sunday), per person.
function weekStart() {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  return localDate(start);
}
function starCounts() {
  const since = weekStart();
  const byId = Object.fromEntries(state.chores.map((c) => [c.id, c.person]));
  const counts = {};
  for (const [day, ids] of Object.entries(state.done)) {
    if (day < since) continue;
    for (const cid of ids) {
      const p = byId[cid] ?? trashPerson(cid);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
  }
  return counts;
}

// Grocery
app.post('/api/grocery', (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 80);
  if (!text) return res.status(400).json({ error: 'text required' });
  // Already on the list and not checked off? Don't add it twice.
  // (A phone that was offline may send an item it added and then checked off: { done: true }.)
  const done = req.body.done === true;
  if (done || !state.grocery.some((g) => !g.done && g.text.toLowerCase() === text.toLowerCase())) {
    state.grocery.push({ id: id(), text, done });
  }
  // Remember what gets bought, for one-tap "add again" buttons.
  const key = text.toLowerCase();
  const h = (state.groceryHistory[key] ||= { text, count: 0, last: 0 });
  h.text = text; h.count++; h.last = Date.now();
  saveState();
  res.json({ ok: true });
});
// Most often (and recently) added items that aren't on the list right now.
function recentGroceries(limit = 10) {
  const onList = new Set(state.grocery.filter((g) => !g.done).map((g) => g.text.toLowerCase()));
  const weekMs = 7 * 864e5;
  return Object.entries(state.groceryHistory)
    .filter(([key]) => !onList.has(key))
    .map(([, h]) => ({ text: h.text, score: h.count + Math.max(0, 4 - (Date.now() - h.last) / weekMs) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.text);
}
app.delete('/api/grocery-history/:text', (req, res) => {
  delete state.groceryHistory[String(req.params.text).toLowerCase()];
  saveState();
  res.json({ ok: true });
});
app.post('/api/grocery/:id/toggle', (req, res) => {
  const item = state.grocery.find((g) => g.id === req.params.id);
  // A phone that was offline sends what it set ({ done }), so a replay can't flip it back.
  if (item) item.done = typeof req.body?.done === 'boolean' ? req.body.done : !item.done;
  saveState();
  res.json({ ok: true });
});
app.post('/api/grocery/clear-done', (req, res) => {
  state.grocery = state.grocery.filter((g) => !g.done);
  saveState();
  res.json({ ok: true });
});

// Countdowns
function countdownFields(body) {
  const title = String(body.title || '').trim().slice(0, 60);
  const date = String(body.date || '');
  return title && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { title, date, yearly: !!body.yearly } : null;
}
app.post('/api/countdowns', (req, res) => {
  const f = countdownFields(req.body);
  if (!f) return res.status(400).json({ error: 'title and date required' });
  state.countdowns.push({ id: id(), ...f });
  saveState();
  res.json({ ok: true });
});
app.put('/api/countdowns/:id', (req, res) => {
  const f = countdownFields(req.body);
  if (!f) return res.status(400).json({ error: 'title and date required' });
  const item = findOr404(state.countdowns, req, res);
  if (!item) return;
  Object.assign(item, f);
  saveState();
  res.json({ ok: true });
});
app.delete('/api/countdowns/:id', (req, res) => {
  state.countdowns = state.countdowns.filter((c) => c.id !== req.params.id);
  saveState();
  res.json({ ok: true });
});

// Leave-by times ("School drop-off, 7:40 on weekdays"), shown as a countdown.
function departureFields(body) {
  const label = String(body.label || '').trim().slice(0, 40);
  const time = String(body.time || '');
  return label && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? { label, time, days: cleanDays(body.days), school: !!body.school } : null;
}
app.post('/api/departures', (req, res) => {
  const f = departureFields(req.body);
  if (!f) return res.status(400).json({ error: 'label and time (HH:MM) required' });
  state.departures.push({ id: id(), ...f });
  state.departures.sort((a, b) => (a.time < b.time ? -1 : 1));
  saveState();
  res.json({ ok: true });
});
app.put('/api/departures/:id', (req, res) => {
  const f = departureFields(req.body);
  if (!f) return res.status(400).json({ error: 'label and time (HH:MM) required' });
  const item = findOr404(state.departures, req, res);
  if (!item) return;
  Object.assign(item, f);
  state.departures.sort((a, b) => (a.time < b.time ? -1 : 1));
  saveState();
  res.json({ ok: true });
});
app.delete('/api/departures/:id', (req, res) => {
  state.departures = state.departures.filter((d) => d.id !== req.params.id);
  saveState();
  res.json({ ok: true });
});

// Notes
app.post('/api/notes', (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'text required' });
  const days = [1, 3, 7].includes(Number(req.body.days)) ? Number(req.body.days) : 1;
  state.notes.push({
    id: id(),
    text,
    from: String(req.body.from || '').slice(0, 40),
    created: new Date().toISOString(),
    expires: new Date(Date.now() + days * 864e5).toISOString(),
  });
  saveState();
  res.json({ ok: true });
});
// Editing a note keeps when it was posted; "days" (if sent) restarts how long it stays up.
app.put('/api/notes/:id', (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'text required' });
  const item = findOr404(state.notes, req, res);
  if (!item) return;
  item.text = text;
  item.from = String(req.body.from || '').slice(0, 40);
  if ([1, 3, 7].includes(Number(req.body.days))) item.expires = new Date(Date.now() + Number(req.body.days) * 864e5).toISOString();
  saveState();
  res.json({ ok: true });
});
app.delete('/api/notes/:id', (req, res) => {
  state.notes = state.notes.filter((n) => n.id !== req.params.id);
  saveState();
  res.json({ ok: true });
});

// Photos and videos (both live in data/photos)
const PHOTO_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const MEDIA_TYPES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/x-m4v': '.m4v', 'video/quicktime': '.mov', 'video/webm': '.webm',
};
const MAX_UPLOAD_MB = 500; // phone videos are big; a minute of 4K is several hundred MB
// "photos" are the files themselves; "posters" are optional video stills that older phone pages sent
// (named "<index>.jpg", matching the video's place in "photos"). Stills now come from the kitchen screen.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'posters' ? UPLOAD_TMP : PHOTO_DIR),
    filename: (req, file, cb) => {
      let ext = path.extname(file.originalname).toLowerCase();
      if (!PHOTO_EXT.test(ext) && !VIDEO_EXT.test(ext)) ext = MEDIA_TYPES[file.mimetype];
      cb(null, `${Date.now()}-${id()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.fieldname === 'posters' ? file.mimetype === 'image/jpeg' : !!MEDIA_TYPES[file.mimetype]),
});

// Thumbnails: about 20 KB instead of a several-MB photo. Made the first time they're asked for,
// then kept in data/thumbs. A video's comes from a still the kitchen screen grabs after it's uploaded
// (phones were slow at it and iPhones often couldn't), or from an older phone page that sent one.
const thumbPath = (name) => path.join(THUMB_DIR, `${name}.jpg`);
async function makeThumb(input, out) {
  const tmp = `${out}.${id()}.tmp`;
  await sharp(input, { failOn: 'none' }).rotate().resize(360, 360, { fit: 'cover' }).jpeg({ quality: 72, mozjpeg: true }).toFile(tmp);
  fs.renameSync(tmp, out);
}
const making = new Map(); // one job per thumbnail, even if the grid asks twice at once
app.get('/thumbs/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const out = thumbPath(name);
  if (!fs.existsSync(out)) {
    const src = path.join(PHOTO_DIR, name);
    if (!PHOTO_EXT.test(name) || !fs.existsSync(src)) return res.sendStatus(404);
    if (!sharp) return res.sendFile(src, { maxAge: '1d' });
    if (!making.has(name)) making.set(name, makeThumb(src, out).finally(() => making.delete(name)));
    try { await making.get(name); } catch { return res.sendStatus(404); }
  }
  res.sendFile(out, { maxAge: '30d', immutable: true }); // names never change, so phones can keep them
});
// The kitchen screen sends a still from each new video here.
app.post('/api/thumbs/:name', express.raw({ type: 'image/jpeg', limit: '2mb' }), async (req, res) => {
  const name = path.basename(req.params.name);
  if (!sharp || !VIDEO_EXT.test(name) || !fs.existsSync(path.join(PHOTO_DIR, name)) || !Buffer.isBuffer(req.body) || !req.body.length) return res.sendStatus(400);
  try { await makeThumb(req.body, thumbPath(name)); } catch { return res.sendStatus(400); }
  version++;
  res.json({ ok: true });
});
// ---------- slideshow copies of videos ----------
// Phones record at 60 or 120 fps (slow motion), sometimes in HEVC, which the kitchen PC's 2014 graphics
// can't decode smoothly. Each video gets a 1080p 30 fps H.264 copy for the slideshow, one at a time,
// in the background at low priority; the original stays as it is for the phone page.
const slidePath = (name) => path.join(SLIDE_DIR, `${name.replace(/\.[^.]+$/, '')}.mp4`);
const slideReady = (name) => fs.existsSync(slidePath(name));
const convertFailed = new Set(); // couldn't be converted; the slideshow uses the original instead
let converting = null;
function runFfmpeg(args, wantStdout) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_LOW); } catch { /* not allowed; fine */ }
    const out = [], err = [];
    p.stdout.on('data', (d) => wantStdout && out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString().trim().slice(-300) || `exit ${code}`))));
  });
}
async function convertNext() {
  if (!ffmpeg || converting) return;
  const name = listVideos().find((n) => !slideReady(n) && !convertFailed.has(n));
  if (!name) return;
  converting = name;
  const src = path.join(PHOTO_DIR, name), out = slidePath(name), tmp = out.replace(/\.mp4$/, '.tmp.mp4');
  try {
    await runFfmpeg(['-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-threads', '2', tmp]);
    if (!fs.existsSync(src)) throw new Error('deleted while converting');
    fs.renameSync(tmp, out);
    // A thumbnail for the phone page's grid, from the new copy, if it doesn't have one yet.
    if (sharp && !fs.existsSync(thumbPath(name))) {
      const still = await runFfmpeg(['-ss', '0.5', '-i', out, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], true).catch(() => null);
      if (still && still.length) await makeThumb(still, thumbPath(name)).catch(() => {});
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (fs.existsSync(src)) { convertFailed.add(name); console.warn(`Couldn't convert ${name} for the slideshow: ${e.message}`); }
  }
  converting = null;
  version++;
  convertNext();
}
// The slideshow plays the light copy once it's ready, and the original otherwise.
app.get('/video/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!VIDEO_EXT.test(name)) return res.sendStatus(404);
  const file = slideReady(name) ? slidePath(name) : path.join(PHOTO_DIR, name);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.sendFile(file, { maxAge: '1d' });
});

// A fingerprint of every file's contents, so the same photo or video isn't added twice.
// Read in pieces, so a big video isn't loaded into memory all at once.
const PHOTO_INDEX = path.join(DATA_DIR, 'photo-index.json');
const hashFile = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});
let photoIndex = {};
try { photoIndex = JSON.parse(fs.readFileSync(PHOTO_INDEX, 'utf8')); } catch { /* rebuilt below */ }
async function syncPhotoIndex(exclude = new Set()) {
  // Picks up files copied into the folder by hand and forgets deleted ones.
  // `exclude` is the files of an upload in progress, which are checked separately.
  const names = new Set([...listPhotos(), ...listVideos()].filter((n) => !exclude.has(n)));
  let changed = false;
  for (const name of Object.keys(photoIndex)) if (!names.has(name)) { delete photoIndex[name]; changed = true; }
  for (const name of names) {
    if (photoIndex[name]) continue;
    try { photoIndex[name] = await hashFile(path.join(PHOTO_DIR, name)); changed = true; } catch { /* unreadable; skip */ }
  }
  if (changed) savePhotoIndex();
}
function savePhotoIndex() {
  const tmp = PHOTO_INDEX + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(photoIndex));
  fs.renameSync(tmp, PHOTO_INDEX);
}
syncPhotoIndex();

// Multer's own errors (e.g. a file over the size limit) come back as a message the phone can show.
function receiveUpload(req, res, next) {
  upload.fields([{ name: 'photos', maxCount: 50 }, { name: 'posters', maxCount: 50 }])(req, res, (err) => {
    if (!err) return next();
    for (const f of Object.values(req.files || {}).flat()) fs.rmSync(f.path, { force: true });
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? `A file is over ${MAX_UPLOAD_MB} MB.` : 'Upload failed.' });
  });
}
app.post('/api/photos', receiveUpload, async (req, res) => {
  const files = (req.files && req.files.photos) || [];
  const posters = Object.fromEntries(((req.files && req.files.posters) || []).map((p) => [parseInt(p.originalname, 10), p]));
  try {
    await syncPhotoIndex(new Set(files.map((f) => f.filename)));
    const known = new Set(Object.values(photoIndex));
    let added = 0;
    const skipped = [];
    for (const [i, f] of files.entries()) {
      const hash = await hashFile(f.path);
      if (known.has(hash)) {
        fs.rmSync(f.path, { force: true });
        skipped.push(f.originalname);
        continue;
      }
      known.add(hash);
      photoIndex[f.filename] = hash;
      added++;
      if (sharp && VIDEO_EXT.test(f.filename) && posters[i]) await makeThumb(posters[i].path, thumbPath(f.filename)).catch(() => {});
    }
    savePhotoIndex();
    version++;
    res.json({ ok: true, added, skipped });
    convertNext();
  } finally {
    for (const p of Object.values(posters)) fs.rmSync(p.path, { force: true });
  }
});
app.delete('/api/photos/:name', (req, res) => {
  const name = path.basename(req.params.name);
  fs.rmSync(thumbPath(name), { force: true });
  if (VIDEO_EXT.test(name)) fs.rmSync(slidePath(name), { force: true });
  fs.rm(path.join(PHOTO_DIR, name), { force: true }, () => {
    delete photoIndex[name];
    savePhotoIndex();
    version++;
    res.json({ ok: true });
  });
});
// Newest first (uploads are named by the time they were added).
function listMedia(pattern) { return fs.readdirSync(PHOTO_DIR).filter((f) => pattern.test(f)).sort().reverse(); }
function listPhotos() { return listMedia(PHOTO_EXT); }
function listVideos() { return listMedia(VIDEO_EXT); }

app.post('/api/calendar/refresh', async (req, res) => {
  await refreshCalendars();
  res.json({ ok: true, errors: calendarCache.errors });
});

// Refresh calendars on schedule, and retry after a minute if the last try failed
// (e.g. the PC was briefly offline).
let calendarTimer = null;
async function calendarLoop() {
  clearTimeout(calendarTimer);
  await refreshCalendars();
  const minutes = calendarCache.errors.length ? 1 : config.calendarRefreshMinutes || 10;
  calendarTimer = setTimeout(calendarLoop, minutes * 60 * 1000);
}
calendarLoop();

refreshAlerts();
setInterval(refreshAlerts, 5 * 60 * 1000);
prune();
setInterval(prune, 15 * 60 * 1000);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kitchen Hub running:`);
  console.log(`  Display:  http://localhost:${PORT}`);
  console.log(`  Phone:    http://${lanAddress()}:${PORT}/phone`);
  convertNext(); // videos added before this existed, or cut off by a restart
});
// Node gives up on a request after 5 minutes; uploading a few big videos over Wi-Fi can take longer.
server.requestTimeout = 60 * 60 * 1000;
