// Holiday decorations: a garland across the top of Home in the week before a big holiday,
// and a greeting on the day itself. Dates are worked out here, so no calendar is needed.

// Lunar New Year (Tết) falls on a different day each year.
const LUNAR_NEW_YEAR = {
  2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03',
  2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08',
  2036: '2036-01-28', 2037: '2037-02-15', 2038: '2038-02-04', 2039: '2039-01-24', 2040: '2040-02-12',
};

const dayOf = (y, m, d) => new Date(y, m - 1, d);
const shift = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
function easterSunday(y) { // the "anonymous Gregorian" method
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayOf(y, month, day);
}
function thanksgiving(y) { // fourth Thursday of November
  const first = dayOf(y, 11, 1);
  return dayOf(y, 11, 1 + ((4 - first.getDay() + 7) % 7) + 21);
}

// Each holiday: its garland, when the garland is up (from..to) and when the greeting shows (greetFrom..date or greetTo).
// Earlier entries win when two overlap (Tết over Valentine's, New Year's over Christmas).
function holidaysIn(y) {
  const list = [];
  const add = (kind, name, date, opts = {}) => list.push({
    kind, name, date, color: opts.color, greeting: opts.greeting, greetingLang: opts.lang || 'en', sub: opts.sub || '',
    from: opts.from || shift(date, -7), to: opts.to || date, greetFrom: opts.greetFrom || date, greetTo: opts.greetTo || date,
  });
  add('newyear', "New Year's", dayOf(y, 1, 1), { from: dayOf(y - 1, 12, 31), greeting: 'Happy New Year', color: '#9A7420' });
  if (LUNAR_NEW_YEAR[y]) {
    const [ly, lm, ld] = LUNAR_NEW_YEAR[y].split('-').map(Number);
    const tet = dayOf(ly, lm, ld);
    add('lunar', 'Lunar New Year', tet, { to: shift(tet, 2), greetTo: shift(tet, 2), greeting: 'Chúc Mừng Năm Mới', lang: 'vi', sub: 'Happy Lunar New Year', color: '#B8291F' });
  }
  add('valentine', "Valentine's Day", dayOf(y, 2, 14), { greeting: "Happy Valentine's Day", color: '#B83A5C' });
  add('easter', 'Easter', easterSunday(y), { greeting: 'Happy Easter', color: '#6A5AA8' });
  add('july4', '4th of July', dayOf(y, 7, 4), { greeting: 'Happy 4th of July', color: '#2E4A7D' });
  add('halloween', 'Halloween', dayOf(y, 10, 31), { greeting: 'Happy Halloween', color: '#B4530F' });
  add('autumn', 'Thanksgiving', thanksgiving(y), { greeting: 'Happy Thanksgiving', color: '#A3401F' });
  add('christmas', 'Christmas', dayOf(y, 12, 25), { from: dayOf(y, 12, 1), to: dayOf(y, 12, 26), greeting: 'Merry Christmas', color: '#B8433A' });
  return list;
}

// The holiday whose garland is up on this day (or null), and whether today is a greeting day.
function holidayOn(d) {
  const day = ymd(d);
  for (const y of [d.getFullYear(), d.getFullYear() + 1]) {
    for (const h of holidaysIn(y)) {
      if (ymd(h.from) <= day && day <= ymd(h.to)) return { ...h, greet: ymd(h.greetFrom) <= day && day <= ymd(h.greetTo) };
    }
  }
  return null;
}

// Late on New Year's Eve the night screen counts down to midnight (and the monitor stays on until 12:30).
function newYearsEveNight(d) {
  return (d.getMonth() === 11 && d.getDate() === 31 && d.getHours() >= 12) || (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() < 1);
}

// ---------- the garland: one wire with a shape hanging from each dip ----------
const GARLAND = {
  autumn: { shape: 'leaf', colors: ['#C2502A', '#D9A43B', '#8A9A3B', '#A8642E'], rot: [-24, 18, -8, 28] },
  halloween: { shape: 'pumpkin', colors: ['#E07B2E', '#D46A1F', '#E8913A'], rot: [-6, 5, 0] },
  christmas: { shape: 'bulb', colors: ['#D9534F', '#E8B64C', '#4E9A6B', '#F3DFB5'], rot: [0] },
  newyear: { shape: 'confetti', colors: ['#D4A845', '#B8BCC6', '#E07A4F', '#5B8DD6', '#E8C76A'], rot: [20, -35, 60, -15, 40] },
  lunar: { shape: 'lunar', colors: ['#F2C230', '#F5CD45'], rot: [0] },
  valentine: { shape: 'heart', colors: ['#D95B7A', '#F09AAE', '#C2405F'], rot: [-8, 8] },
  july4: { shape: 'flag', colors: ['#C0392B', '#F4EFE6', '#2E4A7D'], rot: [0] },
  easter: { shape: 'egg', colors: ['#9BD3B8', '#C3B1E1', '#F4D98B', '#F2B5C4'], rot: [-6, 6] },
};
const SHAPES = { // each drawn in a 24×24 box; C = this shape's color
  leaf: (c) => `<path d="M12 2c-5 5-7 10-4 15 1.2 2 2.6 3 4 5 1.4-2 2.8-3 4-5 3-5 1-10-4-15z" fill="${c}"/><path d="M12 5v17" stroke="rgba(0,0,0,.22)" stroke-width="1.2"/>`,
  pumpkin: (c) => `<rect x="10.8" y="1.5" width="2.4" height="5" rx="1" fill="#5E7A3A"/><ellipse cx="7.5" cy="14.5" rx="5.5" ry="7" fill="${c}"/><ellipse cx="16.5" cy="14.5" rx="5.5" ry="7" fill="${c}"/><ellipse cx="12" cy="14.5" rx="4.8" ry="7.5" fill="#EE9A4C"/>`,
  bulb: (c) => `<circle cx="12" cy="14.5" r="9.5" fill="${c}" opacity=".22"/><rect x="9.2" y="1" width="5.6" height="5" rx="1.2" fill="#A8946C"/><ellipse cx="12" cy="14" rx="5.5" ry="7.2" fill="${c}"/><ellipse cx="10" cy="11.4" rx="1.4" ry="2.3" fill="#fff" opacity=".55"/>`,
  confetti: (c) => `<rect x="9" y="3" width="6" height="15" rx="1.5" fill="${c}"/>`,
  heart: (c) => `<path d="M12 21c-6.5-5-10-8.6-10-12.6A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 10 2.4c0 4-3.5 7.6-10 12.6z" fill="${c}"/>`,
  flag: (c) => `<path d="M1 1h22L12 22z" fill="${c}" stroke="rgba(43,38,34,.22)" stroke-width=".8"/>`,
  egg: (c) => `<ellipse cx="12" cy="13" rx="7" ry="9.5" fill="${c}"/><path d="M5.4 12.5l2.2-2 2.2 2 2.2-2 2.2 2 2.2-2 2.2 2" stroke="#fff" stroke-width="1.4" fill="none" opacity=".85"/>`,
  lantern: () => `<rect x="9" y="1" width="6" height="2.6" rx=".8" fill="#E5B23A"/><ellipse cx="12" cy="11.5" rx="8" ry="7.6" fill="#C8312B"/><path d="M12 4v15M7.2 5.6c-1.6 3.8-1.6 8 0 11.8M16.8 5.6c1.6 3.8 1.6 8 0 11.8" stroke="#E5B23A" stroke-width=".9" fill="none" opacity=".75"/><rect x="9" y="18.6" width="6" height="2" rx=".6" fill="#E5B23A"/><path d="M12 20.6v3" stroke="#E5B23A" stroke-width="1.4"/>`,
  blossom: (c) => `<g fill="${c}"><circle cx="12" cy="6.5" r="4.2"/><circle cx="17.2" cy="10.3" r="4.2"/><circle cx="15.2" cy="16.4" r="4.2"/><circle cx="8.8" cy="16.4" r="4.2"/><circle cx="6.8" cy="10.3" r="4.2"/></g><circle cx="12" cy="12" r="2.6" fill="#D9792B"/>`,
};
// Drawn once per holiday at 1920×90 and scaled to the screen's width.
const garlandCache = {};
function garlandSvg(kind) {
  if (garlandCache[kind]) return garlandCache[kind];
  const g = GARLAND[kind];
  const W = 1920, H = 90, n = 12, span = W / n, dip = 26, s = 38;
  let wire = 'M0,4';
  for (let i = 0; i < n; i++) wire += ` Q${(i + 0.5) * span},${dip * 2 - 4} ${(i + 1) * span},4`;
  const parts = [];
  const count = g.shape === 'confetti' ? n * 3 : n;
  for (let i = 0; i < count; i++) {
    const color = g.colors[i % g.colors.length];
    const rot = g.rot[i % g.rot.length];
    let shape = g.shape, size = s, x, y;
    if (shape === 'confetti') {
      size = Math.round(s * (0.55 + ((i * 13) % 5) / 10));
      x = (i * 97) % W; y = 4 + ((i * 37) % (H - s * 0.7));
    } else {
      if (shape === 'lunar') shape = i % 2 ? 'blossom' : 'lantern';
      if ((g.shape === 'pumpkin' || g.shape === 'lunar') && i % 2) size = Math.round(s * 0.78);
      x = (i + 0.5) * span - size / 2; y = dip - 6;
    }
    parts.push(`<g transform="translate(${x.toFixed(1)} ${y}) rotate(${rot} ${size / 2} 0) scale(${(size / 24).toFixed(3)})">${SHAPES[shape](color)}</g>`);
  }
  const wireLine = g.shape === 'confetti' ? '' : `<path class="garland-wire" d="${wire}" fill="none" stroke-width="1.5" stroke-linecap="round"/>`;
  garlandCache[kind] = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${wireLine}${parts.join('')}</svg>`;
  return garlandCache[kind];
}
function garlandEl(kind) {
  const div = document.createElement('div');
  div.className = 'garland';
  div.innerHTML = garlandSvg(kind); // built above from fixed shapes; no outside text goes in
  return div;
}
