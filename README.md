# Kitchen Hub

A family calendar, chore chart, grocery list, notes board and photo frame for a screen in your kitchen — plus one-click buttons for your streaming services. It runs on any Windows PC, everyone edits it from their phone, and everything stays on your home network.

![Kitchen Hub during the day: today's timeline, a leave-by countdown, chores and the week ahead](docs/screenshots/day.png)

## What it does

- **Changes with the time of day.** Mornings show a big clock, weather tips ("Cool start — bring a jacket") and a countdown to when you need to leave. Daytime shows today as a timeline. Evenings show chores left before bed, tomorrow's plan and the grocery list. Late at night it dims to a quiet clock, and after midnight it turns the monitor off.
- **Calendar.** Reads your Google or iCloud calendars (and US holidays). Click an event for its time, place and notes. Events titled `Sam: Soccer` show in Sam's color.
- **Chores.** Daily or weekly chores per person, with progress rings and weekly stars.
- **Groceries.** A shared list with one-click "Add again" buttons for things you buy often.
- **Notes.** Post a note from your phone ("Dentist forms are on the counter"); it shows on the kitchen screen for a day, three days or a week.
- **Countdowns.** "Thanksgiving in 3 days", birthdays that repeat every year.
- **Weather.** Current conditions, a 7-day forecast, rain timing, air quality, UV, sunset — and National Weather Service alerts (US) as a banner that stays on screen.
- **Photo frame.** Upload photos from your phone; when nobody's using the screen it shows them as a slideshow, pairing portrait photos side by side.
- **Watch.** Big buttons that open Netflix, YouTube, Disney+ and others in Edge.
- **Easy on the eyes.** Warm, dark colors from sunset to sunrise.

| Morning | Evening (after sunset) |
| --- | --- |
| ![Morning: big clock, weather tips and an "Out the door in 28 min" countdown](docs/screenshots/morning.png) | ![Evening: chores before bed, tomorrow's plan and the grocery list in warm dark colors](docs/screenshots/evening.png) |
| **Late night** | **Phone page** |
| ![Late night: a dim clock with tomorrow's first plans and a dimmed photo](docs/screenshots/night.png) | <img src="docs/screenshots/phone.png" alt="The phone page: notes, leave-by times and groceries" width="260"> |

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

On the home Wi-Fi, open `http://<pc-name>.local:8080/phone` — for a PC named `kitchen`, that's `http://kitchen.local:8080/phone`. The exact address is in the bottom-right corner of the kitchen screen. Then use **Share → Add to Home Screen** for an app icon.

If the `.local` address doesn't open (some Android phones don't support it), use the IP address shown next to it instead, and reserve that address for the PC in your router so it doesn't change.

## Configuration

Settings live in `config.json` in the Kitchen Hub folder ([`config.example.json`](config.example.json) shows every option). Restart the PC, or the server, after changing it.

| Setting | What it does |
| --- | --- |
| `people` | Family members and their colors, used for chores, notes and event colors. |
| `calendars` | One entry per calendar: a name, a color and its iCal link (see below). |
| `calendarRefreshMinutes` | How often calendars are re-read (default 10). |
| `weather` | Your `latitude` and `longitude` (look your town up on latlong.net) and `fahrenheit` or `celsius`. |
| `photoFrameAfterMinutes` | After this many idle minutes the screen returns to Home, and during the day starts the slideshow. `0` turns the slideshow off. |
| `slideSeconds` | How long each slideshow photo stays up (default 8; collages get 3 more). |
| `screenOffAt` | When the monitor turns off for the night once nobody's using it (default `"0:00"`, midnight; `false` keeps it on). Any key or touch wakes it, and it turns back on when morning starts. |
| `showCountdownsWithinDays` | Show a countdown on the kitchen screen once it's this many days away (default 60). The phone page always lists them all. |
| `modes` | When each Home screen starts: `{"morning": "6:00", "weekendMorning": "8:00", "day": "10:00", "evening": "17:00", "night": "22:00"}` (the defaults). |
| `services` | The buttons on the Watch tab. Add, remove or reorder freely. |
| `port` | The web server's port (default 8080). |

### Calendar links

Kitchen Hub reads calendars through their private iCal links.

- **Google:** on a computer, open calendar.google.com → ⚙ Settings → click the calendar on the left → *Integrate calendar* → copy **Secret address in iCal format**. Repeat for each calendar you want.
- **iCloud:** on an iPhone, Calendar → Calendars → ⓘ next to the calendar → turn on **Public Calendar** → Share Link.
- **US holidays:** Google's holiday calendar isn't part of your own calendar's link; add it as its own entry:
  ```json
  { "name": "Holidays", "color": "#2f8f5b", "url": "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics" }
  ```

Treat private calendar links like passwords: anyone who has one can read that calendar. `config.json` is never committed to git.

**Colors per person:** start an event's title with a name from `people` — `Sam: Soccer` or `Sam - Soccer` shows as "Soccer" in Sam's color; `Sam's recital` keeps its title and gets Sam's color.

## Everyday use

### Home through the day

| Time | Home shows |
| --- | --- |
| **Morning** (6–10 AM; 8–10 on weekends) | Big clock, weather tips, the leave-by countdown, today's plan, notes and chores. |
| **Day** (10 AM–5 PM) | Today as a timeline with a "now" line, chore progress, notes, countdowns and the week ahead. The slideshow starts here when the screen is left alone. |
| **Evening** (5–10 PM) | Chores left before bed, tomorrow's plan and weather, and the grocery list. |
| **Late night** (10 PM until morning) | A dim clock with tomorrow's first plans. After `screenOffAt` the monitor turns off. |

From sunset to sunrise every tab uses warm, dark colors. When the screen is left alone it returns to Home. To preview another time, add `?at=2026-11-23T07:12` to the kitchen screen's address.

### Keyboard

| Key | Does |
| --- | --- |
| `1`–`6` | Home, Week, Chores, Groceries, Watch, Photos |
| `H` or `Esc` | Back to Home |
| `G` | Jump to the grocery box |
| `N` (on Chores) | Start a new chore |
| `Ctrl+Z` | Undo the last check-off or removed note |
| Any key | Stop the slideshow, or wake the night screen |

The pointer hides itself when the touchpad isn't in use.

### The phone page

- **Notes** for the kitchen, from someone, kept for 1 day, 3 days or a week.
- **Leave-by times**, e.g. "School drop-off, 7:40, weekdays". Mornings count down to the next one; the rest of the day it appears an hour before.
- **Groceries**, **chores** (who, and which days — none means every day), **countdowns** (tick "repeats every year" for birthdays) and **photos** (duplicates are skipped automatically).
- Tap any note, chore, countdown or leave-by time to change it.

### On the kitchen screen

- Check off chores and groceries with a click or tap; a few seconds of **Undo** appear in case of a slip.
- Add groceries and chores directly if the screen has a keyboard.
- **Watch** opens the service in a normal Edge window; close it (✕ or Alt+F4) to come back.

## Troubleshooting

- **Phone page won't load:** the phone must be on the same Wi-Fi. If the `.local` address doesn't work, use the IP address from the corner of the kitchen screen.
- **Not full screen:** press any key. Re-running `setup.ps1` as administrator turns off Edge's "startup boost", the usual cause.
- **A note in the bottom-left corner:** the calendar, weather or server stopped updating. It clears itself once things recover.
- **"Couldn't update the calendar":** the calendar link in `config.json` is wrong or was reset. Copy it again.
- **"Can't reach the Kitchen Hub server":** check `data\server-error.log`. The server restarts itself within a few seconds if it stops.
- **Slideshow flickers on an older PC:** update the graphics driver. Photos are already shrunk to screen size before they're shown.

## Privacy

Kitchen Hub has no accounts and no cloud service of its own. Your notes, chores, groceries and photos are stored in the `data` folder on the kitchen PC and never leave your home network. To get its information, the PC contacts:

- your calendar providers (the links in `config.json`),
- [Open-Meteo](https://open-meteo.com) for weather and air quality, and the [National Weather Service](https://www.weather.gov) for alerts (both only receive your configured location),
- Google Fonts for the typefaces.

Back up the `data` folder to keep your lists and photos.

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
| `public/phone.html`, `public/phone.js` | The phone editor. |
| `public/shared.js` | Helpers used by both pages (DOM builder, countdowns, alert banners). |
| `public/style.css` | All styles; colors are CSS variables, swapped for the dusk theme. |
| `scripts/setup.ps1` | One-time Windows setup (run as administrator). |
| `scripts/start-kiosk.ps1` | Runs at sign-in: keeps the server running and opens Edge full screen. |

The screens poll `/api/version` every few seconds and reload `/api/state` when it changes. Changes go through small JSON endpoints (`POST`/`PUT`/`DELETE` on `/api/chores`, `/api/notes`, `/api/countdowns`, `/api/departures`, `/api/grocery`). Add `?at=<date-time>` to the kitchen screen's URL to preview any time of day; previews never turn the monitor off.

## License

[MIT](LICENSE): free to use, change and share, including for your own family's kitchen.
