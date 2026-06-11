# Feature 33 — device-to-device sync (QR-paired WebRTC) (design)

**Date:** 2026-06-11
**Status:** approved (user picked option 2 of the sync assessment) → implementation

**The constraint that picked the design:** the project promises "your history never leaves your
device; the server is stateless". Sync therefore goes **browser-to-browser over a WebRTC
DataChannel** (DTLS — end-to-end encrypted by construction). The server's only role is a
**transient pairing relay**: it forwards the WebRTC handshake between two live WebSocket
connections and **stores nothing** (in-memory room map of open sockets only — gone the moment
either side disconnects). No accounts; the random pairing code IS the session secret.

## Pairing & transport

- **Host** (e.g. PC): Sync panel → generates an 8-char code (`crypto.getRandomValues`, unambiguous
  alphabet) → opens `wss …/api/v1/sync/{code}` → shows the code as a **QR** encoding
  `{origin}/#sync={code}` plus the code as text (typeable fallback).
- **Joiner** (e.g. phone): scans the QR (the app reads `#sync=` on load and opens the panel
  auto-joined) or types the code → joins the same relay room → SDP offer/answer + ICE over the
  relay → DataChannel `hrvadrive-sync` opens → **the relay is done**.
- Rooms cap at 2 sockets (a third connection is rejected); codes are single-use.
- **No STUN/TURN servers** (privacy: no third-party gets the IPs). With mDNS host candidates this
  covers the actual use case — both devices on the same Wi-Fi. Cross-network sync is out of scope
  (the panel says so).

## Sync protocol (over the DataChannel)

Both directions, symmetric: each side sends `exportAll()` as JSON in **16 KB chunks** framed by
`{kind:'meta', chunks: N}` … chunk strings … `{kind:'done'}` (a full backup with 50+ drives is
MBs — chunking is mandatory; DataChannel message limits are ~64 KB). On `done`, the receiver
reassembles, `importAll()`s (the existing **merge-by-id upsert** — restore semantics, never
wipes), refreshes state, and reports counts. Progress (chunks received/total) shows on both sides.
Pure chunk/assemble helpers live in `src/sync/protocol.ts` (unit-tested; WebRTC itself can't run
in jsdom).

## UI

- A **Sync** pill in the toolbar opens `SyncOverlay`: two paths — "Show code" (host: QR via the
  zero-dependency `qrcode-generator` package + the code) and "Enter code" (join input). Status
  line (`role="status"`): waiting → connecting → transferring (progress) → "Merged X drives ·
  Y cars · Z places from the other device". Errors are stated plainly (timeout, room full).
- `#sync=CODE` deep link auto-opens the overlay in join mode (that's what the QR encodes).
- `SyncOverlay` takes a session factory prop (defaults to the real WebRTC implementation) so tests
  drive it with a scripted fake.

## Server (analysis service)

`@app.websocket("/sync/{code}")` — accept, join room (≤2, else close 4000), forward every text
frame to the other peer, drop the room on disconnect. ~30 lines, no persistence, no logging of
payloads. nginx gets a `location /api/v1/sync/` block with `Upgrade`/`Connection` headers
(WebSocket proxy) → `analysis:8000/sync/`.

## Privacy

Overlay bullet + PRIVACY.md note: sync is **direct device-to-device and end-to-end encrypted**;
the server only relays the connection handshake while both devices are open and **stores
nothing**; no third-party servers are involved (no STUN/TURN).

## Honest limits (stated in the panel)

- Both devices must have the app open at the same time, on the same network.
- Merge is additive by id — deletions don't propagate (delete on both devices).
- Cannot be end-to-end verified in jsdom/CI: the relay, the chunk protocol, and the UI states are
  tested; the full two-device handshake needs a manual run on real hardware (deploy checklist).

## Testing

- `analysis/tests/test_sync_relay.py`: two TestClient websockets relay both ways; third rejected;
  room cleanup after disconnect.
- `sync/protocol.test.ts`: chunk → assemble round-trip (multi-chunk), meta/done framing, corrupt
  input → error.
- `SyncOverlay.test.tsx`: host shows code + QR node; join sends code; scripted fake session walks
  states to the merged summary; `#sync=` deep link opens join mode (App test).
