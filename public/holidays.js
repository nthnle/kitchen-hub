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

// The rest of the year, a thinner garland for the season (by the usual equinox and solstice dates).
function seasonOn(d) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 320 && md < 621 ? 'spring' : md >= 621 && md < 922 ? 'summer' : md >= 922 && md < 1221 ? 'fall' : 'winter';
}

// Late on New Year's Eve the night screen counts down to midnight (and the monitor stays on until 12:30).
function newYearsEveNight(d) {
  return (d.getMonth() === 11 && d.getDate() === 31 && d.getHours() >= 12) || (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() < 1);
}

// ---------- the garland: one wire with a shape hanging from each dip ----------
// Holidays list their pieces in order ([shape, color]); the seasons use one shape (or two, in ALTERNATE).
const GARLAND = {
  autumn: { pieces: [['leaf', '#C2502A'], ['pumpkin', '#E07B2E'], ['leaf', '#D9A43B'], ['acorn'], ['leaf', '#8A9A3B'], ['pumpkin', '#D46A1F'], ['leaf', '#A8642E'], ['acorn']], rot: [-24, 0, 18, -8, 28, 4, -14, 10] },
  halloween: { pieces: [['jack', '#E07B2E'], ['bat'], ['candycorn'], ['pumpkin', '#D46A1F'], ['leaf', '#A8642E'], ['bat'], ['jack', '#E8913A'], ['candycorn']], rot: [-6, 8, -10, 5, 20, -8, 0, 12] },
  christmas: { pieces: [['bulb', '#D9534F'], ['star', '#E8B64C'], ['bulb', '#4E9A6B'], ['ornament', '#B8433A'], ['bulb', '#E8B64C'], ['ornament', '#4E7FB8'], ['bulb', '#F3DFB5'], ['star', '#E8B64C']], rot: [0] },
  newyear: { shape: 'confetti', colors: ['#D4A845', '#B8BCC6', '#E07A4F', '#5B8DD6', '#E8C76A'], rot: [20, -35, 60, -15, 40], stars: ['#E8C76A', '#D4A845', '#F3DFB5'] },
  lunar: { pieces: [['lantern'], ['blossom', '#F2C230'], ['lantern'], ['envelope'], ['lantern'], ['blossom', '#F5CD45']], rot: [0, 0, 0, -8, 0, 12] },
  valentine: { pieces: [['heart', '#D95B7A'], ['heart', '#F09AAE'], ['letter', '#D95B7A'], ['heart', '#C2405F'], ['heart', '#F09AAE'], ['tulip', '#D95B7A']], rot: [-8, 8, -5, 6, -10, 0] },
  july4: { pieces: [['usflag'], ['star', '#2E4A7D'], ['usflag'], ['star', '#C0392B']], rot: [-4, 0, 4, 0] },
  easter: { pieces: [['egg', '#9BD3B8'], ['tulip', '#F2B5C4'], ['egg', '#C3B1E1'], ['blossom', '#F4D98B'], ['egg', '#F2B5C4'], ['tulip', '#C3B1E1'], ['egg', '#F4D98B'], ['blossom', '#F2B5C4']], rot: [-6, 0, 6, 0] },
  // Seasons (drawn as the thin garland)
  spring: { shape: 'spring', colors: ['#F2A7B8', '#8DB86B'], rot: [-10, 14] },
  summer: { shape: 'summer', colors: ['#F2B430', '#F2C230'], rot: [0, 18] },
  fall: { shape: 'fall', colors: ['#C08A4E', '#C97B3A'], rot: [-12, 22] },
  winter: { shape: 'snowflake', colors: ['#8FB3D9', '#A9C6E3'], rot: [0, 30] },
};
// Garlands that alternate two shapes.
const ALTERNATE = { spring: ['blossom', 'leaf'], summer: ['sun', 'lemon'], fall: ['acorn', 'leaf'] };
// Shapes that twinkle on the holiday garland (when motion is on).
const TWINKLE = new Set(['bulb', 'star']);
const TAIL = ['#C2502A', '#D9A43B', '#A8642E', '#D9A43B', '#C2502A'];
const SHAPES = { // each drawn in a 24×24 box; C = this shape's color
  leaf: (c) => `<path d="M12 2c-5 5-7 10-4 15 1.2 2 2.6 3 4 5 1.4-2 2.8-3 4-5 3-5 1-10-4-15z" fill="${c}"/><path d="M12 5v17" stroke="rgba(0,0,0,.22)" stroke-width="1.2"/>`,
  pumpkin: (c) => `<rect x="10.8" y="1.5" width="2.4" height="5" rx="1" fill="#5E7A3A"/><ellipse cx="7.5" cy="14.5" rx="5.5" ry="7" fill="${c}"/><ellipse cx="16.5" cy="14.5" rx="5.5" ry="7" fill="${c}"/><ellipse cx="12" cy="14.5" rx="4.8" ry="7.5" fill="#EE9A4C"/>`,
  jack: (c) => SHAPES.pumpkin(c) + `<path d="M6.2 12.6l2.6-2.6 1.4 3.2zM17.8 12.6l-2.6-2.6-1.4 3.2zM6.4 15.8c2.2 2.8 9 2.8 11.2 0l-1.8.7-1.2-1-1.3 1.2-1.3-1.1-1.3 1.1-1.3-1.2-1.2 1z" fill="#4A2508"/>`,
  bat: () => `<path d="M12 9.6c-.8 0-1.4.5-1.8 1.2C8.8 9.3 5.8 8.6 1.5 9.6c1.9 1 2.7 2.6 2.7 4.5 1.3-.9 2.8-1 4-.2.6-1.1 1.9-1.5 3.8-.4 1.9-1.1 3.2-.7 3.8.4 1.2-.8 2.7-.7 4 .2 0-1.9.8-3.5 2.7-4.5-4.3-1-7.3-.3-8.7 1.2-.4-.7-1-1.2-1.8-1.2z" fill="#3B3346" class="bat"/><path d="M10.7 10.4l-.3-1.8 1.1.9h1l1.1-.9-.3 1.8z" fill="#3B3346" class="bat"/>`,
  candycorn: () => `<path d="M12 2c1.8 0 7 12.5 7 17 0 2.6-14 2.6-14 0 0-4.5 5.2-17 7-17z" fill="#F2C230"/><path d="M12 2c1.6 0 5 8.4 6 13H6c1-4.6 4.4-13 6-13z" fill="#E8742A"/><path d="M12 2c1 0 2.6 3.8 3.3 6H8.7C9.4 5.8 11 2 12 2z" fill="#FBF6EC"/>`,
  turkey: () => [-64, -32, 0, 32, 64].map((a, i) => `<ellipse cx="12" cy="6.2" rx="2.9" ry="6" fill="${TAIL[i]}" transform="rotate(${a} 12 13.5)"/>`).join('')
    + `<ellipse cx="12" cy="15.6" rx="5.2" ry="5.6" fill="#7A5230"/><circle cx="12" cy="9.8" r="2.7" fill="#8C6239"/><circle cx="11" cy="9.3" r=".55" fill="#2B2622"/><circle cx="13" cy="9.3" r=".55" fill="#2B2622"/>`
    + `<path d="M11.4 10.2h1.2L12 11.4z" fill="#E8A33A"/><path d="M11.5 11c-.4 1.2 0 2.3.8 2.5 0-.9-.2-1.7-.8-2.5z" fill="#C8312B"/><path d="M10 21v2.4M14 21v2.4" stroke="#E8A33A" stroke-width="1.1" stroke-linecap="round"/>`,
  bulb: (c) => `<circle cx="12" cy="14.5" r="9.5" fill="${c}" opacity=".22"/><rect x="9.2" y="1" width="5.6" height="5" rx="1.2" fill="#A8946C"/><ellipse cx="12" cy="14" rx="5.5" ry="7.2" fill="${c}"/><ellipse cx="10" cy="11.4" rx="1.4" ry="2.3" fill="#fff" opacity=".55"/>`,
  ornament: (c) => `<path d="M12 .5v3.2" stroke="#A8946C" stroke-width="1"/><rect x="9.8" y="3.4" width="4.4" height="3" rx=".8" fill="#C9B27A"/><circle cx="12" cy="14.2" r="8" fill="${c}"/><path d="M4.4 12.6h15.2M4.7 16.2h14.6" stroke="#fff" stroke-width="1.1" opacity=".5"/><circle cx="9" cy="11" r="1.6" fill="#fff" opacity=".5"/>`,
  star: (c) => `<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="${c}"/>`,
  gift: (c) => `<rect x="3" y="9.5" width="18" height="13" rx="1.2" fill="${c}"/><rect x="2" y="6.5" width="20" height="4.2" rx="1" fill="${c}"/><rect x="2" y="9.6" width="20" height="1.1" fill="rgba(0,0,0,.15)"/><rect x="10.6" y="6.5" width="2.8" height="16" fill="#F3DFB5"/><path d="M12 6.5c-1-3-4.6-4.6-5.4-2.6S9.5 6.5 12 6.5zm0 0c1-3 4.6-4.6 5.4-2.6S14.5 6.5 12 6.5z" fill="#F3DFB5"/>`,
  holly: () => `<path d="M12 13C9 8 4 7 2 9c1.4.4 1.8 1.6 1.2 2.6 1.2-.2 2 .6 1.8 1.8 1.2-.6 2.2 0 2.4 1.2C9 13 10.6 12.6 12 13z" fill="#3E7D52"/><path d="M12 13c3-5 8-6 10-4-1.4.4-1.8 1.6-1.2 2.6-1.2-.2-2 .6-1.8 1.8-1.2-.6-2.2 0-2.4 1.2C15 13 13.4 12.6 12 13z" fill="#4E9A6B"/><circle cx="10.4" cy="14.4" r="1.9" fill="#C8312B"/><circle cx="13.6" cy="14.4" r="1.9" fill="#C8312B"/><circle cx="12" cy="17" r="1.9" fill="#B8291F"/>`,
  confetti: (c) => `<rect x="9" y="3" width="6" height="15" rx="1.5" fill="${c}"/>`,
  burst: (c) => Array.from({ length: 10 }, (_, k) => {
    const a = (k * Math.PI) / 5, p = (r) => `${(12 + r * Math.cos(a)).toFixed(1)} ${(12 + r * Math.sin(a)).toFixed(1)}`;
    const [ex, ey] = p(11.2).split(' ');
    return `<path d="M${p(3.4)}L${p(9.4)}" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/><circle cx="${ex}" cy="${ey}" r=".9" fill="${c}"/>`;
  }).join('') + `<circle cx="12" cy="12" r="1.7" fill="${c}"/>`,
  heart: (c) => `<path d="M12 21c-6.5-5-10-8.6-10-12.6A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 10 2.4c0 4-3.5 7.6-10 12.6z" fill="${c}"/>`,
  letter: (c) => `<rect x="2" y="6" width="20" height="13.5" rx="1.5" fill="#FBF3EE"/><rect x="2" y="6" width="20" height="13.5" rx="1.5" fill="none" stroke="#E2B8C2" stroke-width=".8"/><path d="M2.6 6.8l9.4 7 9.4-7" stroke="#E2B8C2" stroke-width="1.1" fill="none"/><path d="M12 16.6c-2.1-1.6-3.1-2.7-3.1-3.8a1.55 1.55 0 0 1 3.1-.4 1.55 1.55 0 0 1 3.1.4c0 1.1-1 2.2-3.1 3.8z" fill="${c}"/>`,
  tulip: (c) => `<path d="M12 11v11" stroke="#5E8A3A" stroke-width="1.6"/><path d="M12 21c-3.2-1-5.2-4-5.2-7.2 2.2 1 4.2 3.2 5.2 7.2z" fill="#7FAE57"/><path d="M6.5 3.5c1.8 1.2 3 2 3.5 3L12 2.5l2 4c.5-1 1.7-1.8 3.5-3 .5 5.2-1.5 9-5.5 9s-6-3.8-5.5-9z" fill="${c}"/>`,
  grass: () => `<path d="M0 24c2-5 3-8 3.5-12 .8 4 1.2 7 1.2 12zM4.5 24c1.5-6 3-9 5-13-1 5-1.5 8-1 13zM9 24c1-5 2.5-7.5 4.5-10-.5 4-.5 7 0 10zM13 24c1.5-5 3-8 6-11-1.5 4-2 7-2 11zM17.5 24c1-4 2.5-7 5-9-1 3-1.5 6-1.5 9z" fill="#8DB86B"/>`,
  usflag: () => `<path d="M5 5.5L12 1.2L19 5.5" stroke="#9C8F80" stroke-width=".8" fill="none"/>`
    + `<rect x="1.5" y="5" width="21" height="13" fill="#F7F3EC"/>`
    + [5, 8.71, 12.43, 16.14].map((y) => `<rect x="1.5" y="${y}" width="21" height="1.86" fill="#C0392B"/>`).join('')
    + `<rect x="1.5" y="5" width="9.5" height="7.43" fill="#2E4A7D"/>`
    + [[3.4, 6.6], [6.25, 6.6], [9.1, 6.6], [4.8, 8.7], [7.7, 8.7], [3.4, 10.8], [6.25, 10.8], [9.1, 10.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".6" fill="#fff"/>`).join('')
    + `<rect x="1.5" y="5" width="21" height="13" fill="none" stroke="rgba(43,38,34,.25)" stroke-width=".5"/>`,
  egg: (c) => `<ellipse cx="12" cy="13" rx="7" ry="9.5" fill="${c}"/><path d="M5.4 12.5l2.2-2 2.2 2 2.2-2 2.2 2 2.2-2 2.2 2" stroke="#fff" stroke-width="1.4" fill="none" opacity=".85"/>`,
  lantern: () => `<rect x="9" y="1" width="6" height="2.6" rx=".8" fill="#E5B23A"/><ellipse cx="12" cy="11.5" rx="8" ry="7.6" fill="#C8312B"/><path d="M12 4v15M7.2 5.6c-1.6 3.8-1.6 8 0 11.8M16.8 5.6c1.6 3.8 1.6 8 0 11.8" stroke="#E5B23A" stroke-width=".9" fill="none" opacity=".75"/><rect x="9" y="18.6" width="6" height="2" rx=".6" fill="#E5B23A"/><path d="M12 20.6v3" stroke="#E5B23A" stroke-width="1.4"/>`,
  envelope: () => `<rect x="5" y="2" width="14" height="20" rx="1.5" fill="#C8312B"/><path d="M5 7.5l7 4 7-4" stroke="#E5B23A" stroke-width="1" fill="none"/><circle cx="12" cy="12" r="2.6" fill="#E5B23A"/>`,
  blossom: (c, kind) => `<g fill="${c}"><circle cx="12" cy="6.5" r="4.2"/><circle cx="17.2" cy="10.3" r="4.2"/><circle cx="15.2" cy="16.4" r="4.2"/><circle cx="8.8" cy="16.4" r="4.2"/><circle cx="6.8" cy="10.3" r="4.2"/></g><circle cx="12" cy="12" r="2.6" fill="${kind === 'spring' || kind === 'easter' ? '#F5D67A' : '#D9792B'}"/>`,
  sun: (c) => `<circle cx="12" cy="12" r="5" fill="${c}"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
  lemon: () => `<circle cx="12" cy="12" r="9" fill="#F2C230"/><circle cx="12" cy="12" r="7.4" fill="#FBE59A"/><path d="M12 4.6v14.8M4.6 12h14.8M6.8 6.8l10.4 10.4M17.2 6.8L6.8 17.2" stroke="#F2C230" stroke-width="1"/>`,
  acorn: () => `<path d="M12 4.5V2" stroke="#7A5230" stroke-width="1.5" stroke-linecap="round"/><path d="M5 9.5c0-3 3-5 7-5s7 2 7 5z" fill="#7A5230"/><path d="M6.5 9.5h11c0 6-2.6 10-5.5 12-2.9-2-5.5-6-5.5-12z" fill="#C08A4E"/>`,
  snowflake: (c) => `<g stroke="${c}" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/><path d="M9.5 3.8L12 6l2.5-2.2M9.5 20.2L12 18l2.5 2.2M4 10.4l3.2-.9-.9-3.2M20 13.6l-3.2.9.9 3.2M4 13.6l3.2.9-.9 3.2M20 10.4l-3.2-.9.9-3.2"/></g>`,
};
const piece = (shape, color, kind, x, y, size, rot, cls = '') =>
  `<g${cls ? ` class="${cls}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot} ${size / 2} ${shape === 'confetti' ? 0 : size / 2}) scale(${(size / 24).toFixed(3)})">${SHAPES[shape](color, kind)}</g>`;

// Drawn once per holiday at 1920 wide and scaled to the screen's width. The "quiet" seasonal one is
// thinner: fewer, smaller shapes on a shallower string.
const garlandCache = {};
function garlandSvg(kind, quiet) {
  const key = kind + (quiet ? '-quiet' : '');
  if (garlandCache[key]) return garlandCache[key];
  const g = GARLAND[kind];
  const W = 1920, H = quiet ? 56 : 100, n = quiet ? 8 : 16, span = W / n, dip = quiet ? 15 : 26, s = quiet ? 26 : 44;
  let wire = 'M0,4';
  for (let i = 0; i < n; i++) wire += ` Q${(i + 0.5) * span},${dip * 2 - 4} ${(i + 1) * span},4`;
  const parts = [];
  const count = g.shape === 'confetti' ? n * 3 : n;
  for (let i = 0; i < count; i++) {
    let [shape, color] = g.pieces ? g.pieces[i % g.pieces.length] : [g.shape, g.colors[i % g.colors.length]];
    const rot = g.rot[i % g.rot.length];
    let size = s, x, y;
    if (shape === 'confetti') {
      size = Math.round(s * (0.5 + ((i * 13) % 5) / 10));
      x = (i * 97) % W; y = 2 + ((i * 37) % 34); // stays above the greeting
    } else {
      if (ALTERNATE[kind]) shape = ALTERNATE[kind][i % 2];
      if ((g.pieces || ALTERNATE[kind]) && i % 2) size = Math.round(s * 0.78);
      x = (i + 0.5) * span - size / 2; y = dip - (quiet ? 4 : 6);
    }
    // Hanging pieces turn around their top, so they sway from the string.
    const tw = !quiet && TWINKLE.has(shape) ? `tw tw${i % 3}` : '';
    parts.push(`<g${tw ? ` class="${tw}"` : ''} transform="translate(${x.toFixed(1)} ${y}) rotate(${rot} ${size / 2} 0) scale(${(size / 24).toFixed(3)})">${SHAPES[shape](color, kind)}</g>`);
  }
  // New Year's: gold stars sparkling among the confetti.
  (g.stars ? Array.from({ length: n }, (_, i) => i) : []).forEach((i) => {
    const size = 22 + ((i * 7) % 3) * 6;
    parts.push(piece('star', g.stars[i % g.stars.length], kind, (i + 0.25) * span, 2 + ((i * 29) % (58 - size)), size, 0, `tw tw${i % 3}`));
  });
  const wireLine = g.shape === 'confetti' ? '' : `<path class="garland-wire" d="${wire}" fill="none" stroke-width="${quiet ? 1.2 : 1.5}" stroke-linecap="round"/>`;
  garlandCache[key] = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${wireLine}${parts.join('')}</svg>`;
  return garlandCache[key];
}
function svgBox(cls, html) {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html; // built here from fixed shapes; no outside text goes in
  return div;
}
function garlandEl(kind, quiet) { return svgBox(`garland${quiet ? ' quiet' : ''}`, garlandSvg(kind, quiet)); }

// ---------- corner pieces: a little pile in each bottom corner of Home, beside the tabs ----------
// Each piece: [shape, color, x, size, rotation, lift off the bottom], in a 340×80 box for the left corner.
// The right corner gets the same pile mirrored.
const CORNERS = {
  autumn: [['leaf', '#D9A43B', 4, 28, -35, 6], ['pumpkin', '#E07B2E', 26, 60, 0, 0], ['turkey', null, 84, 78, 0, 0], ['pumpkin', '#D46A1F', 160, 46, 0, 0],
    ['acorn', null, 204, 30, -12, 0], ['leaf', '#C2502A', 232, 26, 40, 2], ['leaf', '#8A9A3B', 258, 22, -20, 0], ['acorn', null, 282, 22, 15, 0]],
  halloween: [['leaf', '#A8642E', 4, 26, -30, 4], ['jack', '#E07B2E', 24, 66, 0, 0], ['jack', '#D46A1F', 88, 48, 6, 0], ['candycorn', null, 140, 30, -12, 0],
    ['candycorn', null, 168, 26, 14, 0], ['bat', null, 196, 40, -8, 38], ['pumpkin', '#E8913A', 236, 36, 0, 0], ['bat', null, 274, 30, 10, 46]],
  christmas: [['holly', null, 2, 34, -10, 0], ['gift', '#B8433A', 30, 62, 0, 0], ['gift', '#4E9A6B', 90, 46, 0, 0], ['ornament', '#E8B64C', 138, 34, 0, 0],
    ['gift', '#4E7FB8', 172, 38, 0, 0], ['holly', null, 212, 30, 12, 0], ['ornament', '#B8433A', 240, 28, 0, 0], ['ornament', '#4E9A6B', 268, 24, 0, 0]],
  newyear: [['burst', '#D4A845', 8, 72, 0, 4], ['burst', '#5B8DD6', 80, 52, 15, 22], ['star', '#E8C76A', 140, 26, 0, 8], ['burst', '#E07A4F', 170, 44, 0, 30],
    ['star', '#B8BCC6', 220, 20, 0, 40], ['confetti', '#D4A845', 244, 22, 30, 10], ['confetti', '#5B8DD6', 264, 18, -40, 26], ['star', '#D4A845', 286, 18, 0, 4]],
  lunar: [['lantern', null, 6, 70, 0, 6], ['envelope', null, 74, 40, -10, 0], ['lantern', null, 112, 52, 0, 24], ['blossom', '#F2C230', 168, 32, 0, 0],
    ['envelope', null, 200, 34, 12, 0], ['blossom', '#F5CD45', 236, 26, 0, 8], ['blossom', '#F2C230', 262, 20, 0, 0]],
  valentine: [['heart', '#C2405F', 6, 64, -8, 0], ['letter', '#D95B7A', 72, 48, -6, 0], ['heart', '#F09AAE', 124, 40, 10, 4], ['heart', '#D95B7A', 166, 28, -14, 30],
    ['tulip', '#D95B7A', 196, 50, 0, 0], ['heart', '#F09AAE', 246, 22, 8, 6], ['heart', '#C2405F', 272, 18, -10, 24]],
  easter: [...[0, 26, 52, 78, 104, 130, 156, 182, 208, 234, 260].map((x) => ['grass', null, x, 28, 0, 0]),
    ['tulip', '#F2B5C4', 2, 64, 0, 0], ['egg', '#9BD3B8', 56, 44, -8, 0], ['egg', '#C3B1E1', 92, 38, 10, 0], ['tulip', '#C3B1E1', 126, 52, 0, 0],
    ['egg', '#F4D98B', 172, 36, -6, 0], ['blossom', '#F2B5C4', 206, 28, 0, 4], ['egg', '#F2B5C4', 236, 30, 8, 0]],
  july4: [['burst', '#C0392B', 6, 70, 0, 6], ['usflag', null, 76, 50, -6, 0], ['burst', '#2E4A7D', 126, 50, 10, 24], ['star', '#C0392B', 180, 28, 0, 4],
    ['star', '#2E4A7D', 208, 22, 0, 30], ['burst', '#C0392B', 230, 36, 0, 36], ['star', '#2E4A7D', 270, 20, 0, 6]],
};
const cornerCache = {};
function cornerSvg(kind, side) {
  const key = kind + side;
  if (cornerCache[key]) return cornerCache[key];
  const W = 340, H = 80;
  const parts = (CORNERS[kind] || []).map(([shape, color, x, size, rot, lift]) => {
    const tw = TWINKLE.has(shape) || shape === 'burst' ? `tw tw${Math.round(x) % 3}` : '';
    return side === 'right'
      ? piece(shape, color, kind, W - x - size, H - size - lift, size, -rot, tw)
      : piece(shape, color, kind, x, H - size - lift, size, rot, tw);
  });
  cornerCache[key] = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`;
  return cornerCache[key];
}
function cornerEls(kind) {
  if (!CORNERS[kind]) return [];
  return ['left', 'right'].map((side) => svgBox(`decor-corner ${side}`, cornerSvg(kind, side)));
}

// ---------- a few pieces drifting down behind the cards (leaves, snow, hearts…) ----------
// Only transforms move, so the graphics chip just slides them around.
const FALL = {
  autumn: ['leaf', ['#C2502A', '#D9A43B', '#8A9A3B', '#A8642E']],
  halloween: ['leaf', ['#D46A1F', '#A8642E', '#E8913A']],
  christmas: ['snowflake', ['#9DBBDD', '#B9CFE6']],
  newyear: ['confetti', ['#D4A845', '#5B8DD6', '#E07A4F', '#B8BCC6']],
  lunar: ['blossom', ['#F2C230', '#F5CD45']],
  valentine: ['heart', ['#E58AA0', '#D95B7A']],
  easter: ['blossom', ['#F2B5C4', '#C3B1E1', '#F4D98B']],
  july4: ['star', ['#C0392B', '#2E4A7D']],
};
function fallEl(kind) {
  const f = FALL[kind];
  const box = document.createElement('div');
  box.className = 'decor-fall';
  if (!f) return box;
  const lanes = [5, 18, 31, 44, 57, 70, 83, 95];
  lanes.forEach((left, i) => {
    const s = document.createElement('span');
    const dur = 26 + ((i * 7) % 13);
    s.style.cssText = `left:${left}%;--dx:${(i % 2 ? 1 : -1) * (3 + (i % 4) * 2)}vw;--rot:${(i % 2 ? 1 : -1) * (180 + i * 50)}deg;`
      + `--sz:${22 + (i % 3) * 5};animation-duration:${dur}s;animation-delay:-${((i * 11) % dur).toFixed(1)}s`;
    s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${SHAPES[f[0]](f[1][i % f[1].length], kind)}</svg>`;
    box.append(s);
  });
  return box;
}

// A small drawing of the holiday, for next to the date.
const ICON = { autumn: 'turkey', halloween: 'jack', christmas: 'holly', newyear: 'star', lunar: 'lantern', valentine: 'heart', easter: 'egg', july4: 'usflag' };
function holidayIconSvg(kind) {
  const g = GARLAND[kind];
  const color = kind === 'newyear' ? '#D4A845' : kind === 'halloween' ? '#E07B2E' : kind === 'valentine' ? '#D95B7A' : kind === 'easter' ? '#C3B1E1' : g.pieces ? g.pieces[0][1] : g.colors[0];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${SHAPES[ICON[kind]](color, kind)}</svg>`;
}
