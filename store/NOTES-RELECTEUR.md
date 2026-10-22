# Notes pour le relecteur (à coller dans « Notes pour le relecteur » / « Notes to reviewer »)

**What it is.** Unofficial companion for students of Université Clermont Auvergne (UCA). It reads the student's own
timetable, absences and grades on the university portal (Odin, behind the CAS login at ent.uca.fr) with the student's own
session, and shows them in a local calendar UI. Not affiliated with the university ("non officiel" is in the name).

**You cannot test the portal part** (it needs a student account). Everything else works offline with fake data (below).

**No build step, no minification, no remote code.** The submitted zip is the repository's files as they are
(without `tests/`, `app/` and the public website pages). All code is plain, readable JavaScript.
Third-party libraries (unmodified, in `vendor/`, used only to build/read QR codes for the optional phone transfer):
`qrcode.js` = qrcode-generator 1.4.4 (MIT, Kazuhiko Arase); `jsQR.js` = jsQR 1.4.0 (Apache-2.0, `vendor/LICENSE-jsQR.txt`).
Fonts of the "carnet" design (Caveat, Nunito, SIL OFL 1.1) are bundled locally.

**Data.** `data_collection_permissions: none`. Nothing is sent to the developer or any third party. Data is kept in
`storage.local`. There is no server. Full list of network requests: https://kiricoucou.github.io/uca-extension/confidentialite.html
- `ent.uca.fr`, `odin.iut.uca.fr`: CAS login (the user types credentials on the university page; the extension never reads them) and reading the student's pages (`tabs` + `scripting.executeScript`, text only).
- Settings → "Statut des sites": anonymous GET requests (`credentials: "omit"`) to odin.iut.uca.fr, ent.uca.fr, moodle.uca.fr, mail.uca.fr, kiricoucou.github.io and raw.githubusercontent.com, only to display whether they respond. No data sent.
- This store package has no update checker (a development build that reads a public version file on GitHub is not what is submitted; the marker file `store-build.txt` disables it).

**Permissions.** `storage` (local data); `scripting` + hosts ent.uca.fr / odin.iut.uca.fr (read the pages); `cookies` (read the remaining
session time; on the user's "Logout" click remove cookies of ent.uca.fr and odin.iut.uca.fr only); `alarms` (reminders, optional background sync,
icon badge); `notifications` (reminders and alerts, user-configurable; not available on Firefox for Android, features are hidden there).
Content script on `https://kiricoucou.github.io/uca-extension/*` only: bridges the project's own web app and the extension (the web app can
ask for a sync and receives the result). It is limited to the top frame and to a fixed set of message types (see `content-bridge.js`).

**Phone sharing.** Optional: the user generates a link whose data is AES-GCM-256 encrypted (key from a user-chosen share code, PBKDF2 150000
iterations) and placed in the URL fragment (never sent over HTTP); see `core/transfer.js`.

**Expected lint warnings.** `innerHTML` is used with escaped content or fixed templates (every external string goes through `escapeHtml` or
`textContent`); `data_collection_permissions` requires Firefox 140+ (the package sets `strict_min_version` 140 / Android 142).

**How to see it working with fake data (no account needed).**
1. Install the add-on, open `about:debugging#/runtime/this-firefox` → "Inspect" on the extension (or use the add-on's background console).
2. Paste in the console:
```js
const d = new Date();
const mk = (dh, sh, eh, title, room, teacher) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dh);
  return { date: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`, year: x.getFullYear(), month: x.getMonth(), day: x.getDate(),
    startH: sh, startM: 0, endH: eh, endM: 0, title, teacher, room, raw: title, color: "#888" }; };
browser.storage.local.set({
  uca_events: [mk(0, 8, 10, "R1.01 Développement CM", "A101", "M. Dupont"), mk(0, 10, 12, "R1.02 Web TD", "B204", "Mme Martin"), mk(1, 14, 16, "R1.01 DS2 Examen", "Amphi B", "M. Dupont")],
  uca_last_sync: new Date().toISOString(), uca_design: "professionnel"
}).then(() => browser.tabs.create({ url: browser.runtime.getURL("designs/professionnel/agenda.html") }));
```
3. The agenda opens with the fake timetable (next course, exam countdown, filters, .ics export, Settings → "Statut des sites", etc.).
