# Privacy Notice — HrvaDrive

_Last updated: 2026-06-10_

HrvaDrive is a **non-commercial hobby project, provided "as is"** (see [LICENSE](LICENSE)). It turns an
OBD2 drive log (exported from the Car Scanner app) into a drive report. This notice explains what data is
involved and where it goes. **It is a template for whoever operates an instance of HrvaDrive; if you
self-host or deploy it, you are the data controller and are responsible for your own compliance — review
and complete it (see [Contact](#contact)).** This document is not legal advice.

## The short version

- **No accounts, no tracking, no cookies, no analytics, no advertising.**
- The analysis **server is stateless**: your uploaded drive log is processed **in memory** to build the
  report and is **not stored or retained**.
- Your **drive history stays in your browser only** (IndexedDB) and never leaves your device. You can
  delete it at any time.
- One unavoidable third party: the **map** loads tiles from **OpenStreetMap**, which sees your IP and
  the map area (see [Third parties](#third-parties)).

## What data is involved

- **The drive log you upload (CSV)** — and an optional vehicle file (`.brc`). A Car Scanner log can
  contain **personal data**: your vehicle's **VIN** and **GPS coordinates** (which may include your home
  area). It is sent to the analysis server only to produce your report.
- **A fuel price (€/L)** you optionally type — kept in your browser's `localStorage` (and, per car,
  in your browser's garage records) to prefill next time; never sent anywhere except as a parameter
  of your own analysis request.
- **No identifiers are created** — no account, user ID, cookie, or tracking pixel.

## How it is processed and stored

- **Server (analysis):** stateless. Your file is parsed and analysed **in memory** to
  generate the report that is returned to your browser. The file content is **not written to a database
  or persisted**. (As with any web server, transient operational logs may exist at the infrastructure
  level; the application itself does not store your drive data.)
- **Your browser:** saved drives live in **IndexedDB** on your device, and your last fuel price in
  **`localStorage`**. This is what powers History, comparison, and trends — entirely client-side.
- **Deleting your data:** use **Delete** on a drive (or select several) in the History tab, or the
  **Delete all data** button in the in-app privacy notice — it wipes every saved drive, car and
  setting. Because nothing is stored server-side, that removes it completely. **Backups you download
  are files on your device** — under your control, outside the app.
- **Offline cache:** the app installs a service worker that caches the app's own static files
  (code, styles, icons) so it loads offline. It never caches your drive data, API responses, or map
  tiles.

## Cookies & consent

HrvaDrive sets **no cookies** and uses **no analytics or tracking**. The browser storage it does use
(`IndexedDB`, `localStorage`) is **strictly necessary** for the features you ask for (saving and
comparing your own drives), so no cookie-consent banner is required. If an operator later adds analytics
or any non-essential tracking, that changes and consent would be required.

## Third parties

- **OpenStreetMap** (`tile.openstreetmap.org`) — the route map fetches map tiles by coordinate, so
  OpenStreetMap's servers receive your **IP address** and the **map area of your drive** (which reveals
  approximate location) while the map is shown. See the
  [OpenStreetMap privacy policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy).
- **Fonts are self-hosted** (bundled with the app) — **no Google Fonts CDN**, so no data is sent to
  Google.
- **VIN decode is opt-in.** If you press **Decode VIN** on a car, that car's VIN is sent to the NHTSA
  vPIC API (a US-government service) to look up its make/model/year. This is the only time a VIN leaves
  your device, and only when you choose it. Nothing is stored on any server.
- **Device sync (optional)** is **direct, browser-to-browser, end-to-end encrypted** (WebRTC
  DTLS). The server only relays the connection handshake between your two open devices and stores
  nothing. To help the two browsers find each other, a **public STUN server** (currently Google's)
  is contacted — it sees the **IP address** making a discovery request but **never your data**,
  which flows directly between the devices. No TURN/relay servers are used (your data is never
  routed through a third party). A self-hosted instance can point this at its own STUN server.
- No other external calls are made by the application.

## Your rights (GDPR / EU)

Because HrvaDrive stores no personal data server-side, most data-subject requests are satisfied directly:
your data lives on your device and you can view or delete it yourself. For any question about an
operator's processing (e.g. infrastructure logs), contact the operator below. EU users have the right to
access, rectification, erasure, restriction, objection, and to lodge a complaint with a supervisory
authority (in Croatia, **AZOP**).

## Contact

_Operator of this instance: add your name/organisation and a contact email here._

`[contact — to be completed by the operator]`
