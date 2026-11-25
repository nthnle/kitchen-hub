# Kitchen Hub

A family calendar, chore chart, grocery list, notes board and photo frame for a screen in your kitchen — plus one-click buttons for your streaming services. It runs on any Windows PC, everyone edits it from their phone, and everything stays on your home network.

![Kitchen Hub during the day: today's timeline, a leave-by countdown, chores, the grocery list and the week ahead, dressed for Thanksgiving](docs/screenshots/day.png)

## What it does

- **Changes with the time of day.** Mornings show a big clock, weather tips ("Cool start — bring a jacket") and a countdown to when you need to leave. Daytime shows today as a timeline, with what's left on the grocery list. Evenings show chores left before bed, tomorrow's plan and the grocery list. Late at night it dims to a quiet clock, and after midnight it turns the monitor off.
- **Calendar.** Reads your Google or iCloud calendars (and US holidays). Click an event for its time, place and notes. Events titled `Sam: Soccer` show in Sam's color.
- **Chores.** Daily, weekly or one-time chores per person, with progress rings and weekly stars. A one-time chore nobody finished carries over to the next day, marked "from Sat", until someone checks it off.
- **Trash night.** Set your pickup days and "Put out the trash" shows up as a chore the evening before.
- **Groceries.** A shared list with one-click "Add again" buttons for things you buy often.
- **Notes.** Post a note from your phone, or with *+ Add a note* on the kitchen screen ("Dentist forms are on the counter"); it shows on the kitchen screen for a day, three days or a week.
- **Countdowns.** "Thanksgiving in 3 days", birthdays that repeat every year. Big holidays (Thanksgiving, Christmas, Halloween…) count down automatically from your holiday calendar.
- **Weather.** Current conditions, a 7-day forecast, rain timing, air quality, UV, sunrise and sunset — and National Weather Service alerts (US) as a banner that stays on screen.
- **Photo frame.** Upload photos and videos from your phone; when nobody's using the screen it shows them as a slideshow, pairing portrait photos side by side. Videos play full screen from start to finish, muted unless you turn sound on.
- **On your phone, anywhere.** The phone page has the same Today, Calendar, Chores and Groceries as the kitchen screen, with the editors under *More*. It keeps the last copy on the phone, so the grocery list still works in a store with no signal and syncs what you check off once you’re back online.
- **Watch.** Big buttons that open Netflix, YouTube, Disney+ and others in Edge.
- **Easy on the eyes.** Warm, dark colors from sunset to sunrise.
- **Dressed for the holidays.** In the week before New Year's, Lunar New Year (Tết), Valentine's Day, Easter, the 4th of July, Halloween, Thanksgiving and all of December, Home gets a full garland (pumpkins, bats and candy corn; lights, ornaments and stars…), a little pile in each bottom corner (a turkey with pumpkins, presents, fireworks, lanterns…), headings and clock in the holiday's color, a few leaves, snowflakes or hearts drifting down behind the cards, and a greeting on the day. The other tabs get the garland and the holiday colors too. On New Year's Eve the night screen counts down to midnight. The rest of the year, a thinner garland follows the seasons: blossoms, suns and lemons, acorns, snowflakes.

| Morning | Evening (after sunset) |
| --- | --- |
| ![Morning: big clock, weather tips, an "Out the door in 28 min" countdown and the chores left, including one carried over from Saturday](docs/screenshots/morning.png) | ![Evening: chores before bed, tomorrow's plan and the grocery list in warm dark colors](docs/screenshots/evening.png) |
| **Late night** | **Phone page** |
| ![Late night: a dim clock with tomorrow's first plans and a dimmed photo](docs/screenshots/night.png) | <img src="docs/screenshots/phone.png" alt="The phone page’s Today tab: weather, the kitchen note, today’s events, a chore ring for each person and the grocery list" width="260"> |

## What you need

- A Windows 10 or 11 PC connected to a screen. An old laptop or mini PC is fine.
- A way to use it: a touchscreen, or a wireless keyboard with a touchpad (everything works with either).
- A Google or iCloud calendar (optional, but it's the heart of the screen).
- Phones on the same home Wi-Fi for editing.

The setup script installs everything else (Node.js).

## Setting up the kitchen PC

1. **Download** this repository (green **Code** button → **Download ZIP**) and unzip it somewhere permanent, e.g. `C:\KitchenHub`.
2. **Run setup.** Open PowerShell **as administrator** (Start → type `powershell` → **Run as administrator**), then:
   ```powershell
   cd C:\KitchenHub
   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
   ```
   This installs Node.js if needed, lets phones on your home network connect, keeps the PC from sleeping, stops Edge from ignoring full-screen mode, and starts Kitchen Hub every time you sign in.
3. **Edit `config.json`** (created by setup) with your family's names, calendar links and location — see [Configuration](#configuration).
4. **Optional — automatic sign-in**, so the screen comes back by itself after a restart or power cut: press Win+R, run `netplwiz`, untick *Users must enter a user name and password to use this computer*. If that box is missing, first turn off *Settings → Accounts → Sign-in options → "For improved security, only allow Windows Hello sign-in"*.
5. **Sign in to your streaming services** once in Edge.
6. **Restart.** Kitchen Hub opens full screen when you sign in.

### On your phone

On the home Wi-Fi, open `http://<pc-name>.local:8080/phone` — for a PC named `kitchen`, that's `http://kitchen.local:8080/phone`. `setup.ps1` prints the exact address when it finishes (the PC's name is also under *Settings → System → About*). Then use **Share → Add to Home Screen** for an app icon. The kitchen screen doesn't show the address, so guests don't see it.

If the `.local` address doesn't open (some Android phones don't support it), use the PC's IP address instead (setup prints it too, or run `ipconfig` on the PC), and reserve that address for the PC in your router so it doesn't change.

### Using it away from home

Kitchen Hub has no password, so **don't forward its port on your router**: anyone who found the address could read your calendar and post notes. Use [Tailscale](https://tailscale.com) instead (free for personal use). It links your phones and the kitchen PC into a private network that only your own devices can join.

1. On the kitchen PC, install Tailscale (`winget install Tailscale.Tailscale`) and sign in.
2. On each phone, install the Tailscale app and sign in with the same account.
3. With Tailscale on, open `http://<pc-name>:8080/phone` from anywhere, e.g. `http://kitchen:8080/phone`. If the name doesn't load, use the PC's `100.x.x.x` address from the Tailscale app.

Two tips:
- In the Tailscale admin console, choose **Disable key expiry** for the kitchen PC, or it gets signed out after about six months.
- Run `tailscale up --unattended` once on the PC so it stays connected even before anyone signs in to Windows.

#### Opening it with no signal

Browsers only let a page save itself for offline use over HTTPS. Tailscale can give the kitchen PC an HTTPS address that only your devices can reach:

1. In the Tailscale admin console, under **DNS**, make sure **MagicDNS** is on and turn on **HTTPS Certificates**.
2. On the kitchen PC, run `tailscale serve --bg 8080`.
3. On your phone, open `https://<pc-name>.<your-tailnet>.ts.net/phone` (the exact name is in the Tailscale app) and add *that* to your home screen.

Windows normally treats Tailscale as a private network, so the firewall rule from `setup.ps1` already lets it through. If phones can't connect, check that the Tailscale network is set to Private in Windows settings.

## Configuration

Settings live in `config.json` in the Kitchen Hub folder ([`config.example.json`](config.example.json) shows every option). Restart the PC, or the server, after changing it.

| Setting | What it does |
| --- | --- |
| `people` | Family members and their colors, used for chores, notes and event colors. |
| `calendars` | One entry per calendar: a name, a color and its iCal link (see below). |
| `calendarRefreshMinutes` | How often calendars are re-read (default 10). |
| `weather` | Your `latitude` and `longitude` (look your town up on latlong.net) and `fahrenheit` or `celsius`. |
| `photoFrameAfterMinutes` | After this many idle minutes the screen returns to Home, and during the day starts the slideshow. `0` turns the slideshow off. |
| `slideSeconds` | How long each slideshow photo stays up (default 8; collages get 3 more). Videos always play to the end. |
| `videoSound` | `true` plays slideshow videos with sound. Off by default. |
| `screenOffAt` | When the monitor turns off for the night once nobody's using it (default `"0:00"`, midnight; `false` keeps it on). Any key or touch wakes it, and it turns back on when morning starts. |
| `showCountdownsWithinDays` | Show a countdown on the kitchen screen once it's this many days away (default 60). The phone page always lists them all. |
| `trash` | Pickup days, e.g. `[{"name": "Trash", "days": ["Mon", "Thu"]}, {"name": "Recycling", "days": ["Wed"]}]`. The evening before each pickup, "Put out the trash" (or recycling) joins the chores for everyone, or for one person if you add `"person": "Dad"` (they get the star). If nobody does it, it's still there on pickup morning until noon. |
| `schoolDaysOff` | Days with no school, for leave-by times set to skip them: dates or ranges like `"2026-11-23..2026-11-27"`. Only needed if your district has no calendar link (see [School calendar](#school-calendar)). |
| `holidayCountdowns` | Calendar events that get a countdown automatically, by exact title. Defaults to New Year's Day, Valentine's Day, Easter Sunday, Mother's Day, Memorial Day, Father's Day, Independence Day, Labor Day, Halloween, Thanksgiving Day and Christmas Day (as named in Google's US holidays calendar). Give your own list, or `false` for none. |
| `holidayDecor` | Holiday garlands and greetings on Home, the New Year's Eve countdown (the monitor stays on until 12:30 that night) and the Lunar New Year countdown. `false` turns them all off, seasonal garlands included. |
| `holidayMotion` | The twinkling lights and the pieces drifting down behind the cards. `false` keeps the decorations but holds them still. |
| `seasonDecor` | The thin seasonal garland between holidays. `false` keeps only the holiday ones. |
| `modes` | When each Home screen starts: `{"morning": "6:00", "weekendMorning": "8:00", "day": "10:00", "evening": "17:00", "night": "22:00"}` (the defaults). |
| `services` | The buttons on the Watch tab. Add, remove or reorder freely. |
| `port` | The web server's port (default 8080). |

### Calendar links

Kitchen Hub reads calendars through their private iCal links.

- **Google:** on a computer, open calendar.google.com → ⚙ Settings → click the calendar on the left → *Integrate calendar* → copy **Secret address in iCal format**. Repeat for each calendar you want.
- **iCloud:** on an iPhone, Calendar → Calendars → ⓘ next to the calendar → turn on **Public Calendar** → Share Link.
- **US holidays:** Google's holiday calendar isn't part of your own calendar's link; add it as its own entry:
  ```json
  { "name": "Holidays", "color": "#857a6e", "url": "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics" }
  ```

### School calendar

Most school districts publish their calendar as an iCal link (look for "Subscribe", "iCal" or "Add to calendar" on the district's calendar page). Add it like any other calendar, with `"school": true`:

```json
{ "name": "School", "color": "#5b9e7a", "url": "https://…/district-calendar.ics", "school": true }
```

Its events show on the calendar as usual, and days it marks as off ("Student Holiday", "Thanksgiving Break", "Staff Development Day"…) skip the leave-by times set to *Skip on days with no school*. Early release days still count as school days. Surprise closures (storms) usually aren't on the calendar; districts send those by text or email.

If your district only publishes a PDF, list the days off in `config.json` instead, as single dates or ranges, and update it each school year:

```json
"schoolDaysOff": ["2026-09-07", "2026-11-23..2026-11-27", "2026-12-21..2027-01-01"]
```

Treat private calendar links like passwords: anyone who has one can read that calendar. `config.json` is never committed to git.

**Colors per person:** start an event's title with a name from `people` — `Sam: Soccer` or `Sam - Soccer` shows as "Soccer" in Sam's color; `Sam's recital` keeps its title and gets Sam's color.

## Everyday use

### Home through the day

| Time | Home shows |
| --- | --- |
| **Morning** (6–10 AM; 8–10 on weekends) | Big clock, weather tips, the leave-by countdown, today's plan, notes, chores and what's on the grocery list. |
| **Day** (10 AM–5 PM) | Today as a timeline with a "now" line, the chores still left, notes, what's on the grocery list, countdowns and the week ahead. The slideshow starts here when the screen is left alone. |
| **Evening** (5–10 PM) | Chores left before bed, tomorrow's plan and weather, and the grocery list. |
| **Late night** (10 PM until morning) | A dim clock with tomorrow's first plans. After `screenOffAt` the monitor turns off. |

On quiet days (two or fewer events left on the calendar), mornings and daytime put a chore board in the big space instead: a column per person with every chore for today, checked off with a click. Today's few events move to a short list on the side.

From sunset to sunrise every tab uses warm, dark colors. When the screen is left alone it returns to Home. To preview another time, add `?at=2026-11-23T07:12` to the kitchen screen's address.

### Keyboard

| Key | Does |
| --- | --- |
| `1`–`6` | Home, Week, Chores, Groceries, Watch, Photos (also from any empty text box) |
| `H` or `Esc` | Back to Home (on Groceries, `Esc`: letters type there) |
| `G` | Jump to the grocery box |
| Any letter (on Groceries) | Start typing a new item |
| `N` | Post a new note (on Chores: start a new chore) |
| `Ctrl+Z` | Undo the last check-off or removed note |
| Any key | Stop the slideshow, or wake the night screen |

The pointer hides itself when the touchpad isn't in use.

### The phone page

Tabs along the bottom, like an app:

- **Today:** the weather, notes on the kitchen screen, today’s events (what’s on now is marked), a chore ring for each person and what’s on the grocery list. Weather alerts show here too.
- **Calendar:** the next 7 days as a list, each with its forecast; *Show the next week* for more.
- **Chores:** today’s chores, what’s left first. Tap a name to see only theirs, tap a chore to check it off. Shows this week’s stars.
- **Groceries:** add, check off, *Add again* buttons. Works with no signal (see below).
- **More:** everything you set up once, below.

Under *More*:

- **Notes** for the kitchen, from someone, kept for 1 day, 3 days or a week.
- **Leave-by times**, e.g. "School drop-off, 7:40, weekdays". Mornings count down to the next one; the rest of the day it appears an hour before. Tick *Skip on days with no school* (ticked for you when the name says "school") and it stays quiet on big holidays like Thanksgiving and Christmas, plus any days off on your [school calendar](#school-calendar).
- **Groceries**, **chores** (who, and which days — none means every day; or *just today*, *just tomorrow* or a date for a one-off, which carries over until it's done), **countdowns** (tick "repeats every year" for birthdays) and **photos and videos** (up to 500 MB each; duplicates are skipped automatically).
- Tap any note, chore, countdown or leave-by time to change it.

**With no signal** (in a store, say), the page shows the last copy it saved, with a banner saying so. Grocery changes are marked *waiting to sync* and go through on their own once the phone reaches the kitchen PC again; other changes need a connection. If the page is already open, or was opened recently, that’s all automatic. To open it from scratch with no signal at all, the page has to come over HTTPS, which [Tailscale can do](#opening-it-with-no-signal).

### On the kitchen screen

- Check off chores and groceries with a click or tap; a few seconds of **Undo** appear in case of a slip.
- Add groceries and chores directly if the screen has a keyboard.
- **Watch** opens the service in a normal Edge window; close it (✕ or Alt+F4) to come back.

## Troubleshooting

- **Phone page won't load:** the phone must be on the same Wi-Fi (or on Tailscale). If the `.local` address doesn't work, use the PC's IP address (run `ipconfig` on the PC).
- **Not full screen:** press any key. Re-running `setup.ps1` as administrator turns off Edge's "startup boost", the usual cause.
- **A note in the bottom-left corner:** the calendar, weather or server stopped updating. It clears itself once things recover.
- **"Couldn't update the calendar":** the calendar link in `config.json` is wrong or was reset. Copy it again.
- **"Can't reach the Kitchen Hub server":** check `data\server-error.log`. The server restarts itself within a few seconds if it stops.
- **Slideshow flickers on an older PC:** update the graphics driver. Photos are already shrunk to screen size before they're shown.
- **A video never shows in the slideshow:** the PC can't play its format, so it's skipped. iPhones record in HEVC by default, which Edge plays only on some PCs. Try installing *HEVC Video Extensions* from the Microsoft Store, or set the iPhone to *Settings → Camera → Formats → Most Compatible* for future videos. An iPhone can still play it on the phone page.

## Privacy

Kitchen Hub has no accounts and no cloud service of its own. Your notes, chores, groceries and photos are stored in the `data` folder on the kitchen PC and never leave your home network (or your private Tailscale network, if you [use it away from home](#using-it-away-from-home)). To get its information, the PC contacts:

- your calendar providers (the links in `config.json`),
- [Open-Meteo](https://open-meteo.com) for weather and air quality, and the [National Weather Service](https://www.weather.gov) for alerts (both only receive your configured location),
- Google Fonts for the typefaces.

Back up the `data` folder to keep your lists, photos and videos.

## For developers

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp config.example.json config.json   # then edit it
npm start                            # http://localhost:8080 and /phone
```

| Path | What it is |
| --- | --- |
| `server.js` | Express server: state (`data/state.json`), calendar fetching and parsing, weather alerts, photo uploads, and the JSON API. |
| `public/index.html`, `public/app.js` | The kitchen screen: time-of-day Home screens, tabs, slideshow, keyboard handling. |
| `public/phone.html`, `public/phone.js` | The phone page: Today, Calendar, Chores and Groceries tabs, the editors under More, and the offline copy and sync queue. |
| `public/sw.js` | Lets the phone page open with no signal (over HTTPS). |
| `public/shared.js` | Helpers used by both pages (DOM builder, countdowns, alert banners, weather icons, events for a day). |
| `public/holidays.js` | Holiday dates (including Easter, Thanksgiving and Lunar New Year), seasons, and the drawings for the garlands, corner piles and drifting pieces. |
| `public/style.css` | All styles; colors are CSS variables, swapped for the dusk theme. |
| `scripts/setup.ps1` | One-time Windows setup (run as administrator). |
| `scripts/start-kiosk.ps1` | Runs at sign-in: keeps the server running and opens Edge full screen. |

The screens poll `/api/version` every few seconds and reload `/api/state` when it changes. Changes go through small JSON endpoints (`POST`/`PUT`/`DELETE` on `/api/chores`, `/api/notes`, `/api/countdowns`, `/api/departures`, `/api/grocery`). Add `?at=<date-time>` to the kitchen screen's URL to preview any time of day, and `&view=calendar` (or `chores`, `grocery`, `watch`) to open another tab; previews never turn the monitor off.

## License

[MIT](LICENSE): free to use, change and share, including for your own family's kitchen.
