# AGENTS.md — start here

This project is built across multiple sessions. Before writing code:

1. **Read the design doc:** `docs/superpowers/specs/2026-06-05-hrva-drive-design.md`.
   It is the single source of truth — goal, data model, architecture, the
   inter-service API contract (§7), the shared analysis definitions (§6), and
   the phased roadmap (§8).
2. **Only implement the phase you're asked for.** v1 = Phase 0 + Phase 1.
   Don't pull later-phase features forward.
3. **The API contract (spec §7) is the law.** Spring and Python are built
   separately; change the contract in the spec first, then code.
4. **Compute metrics exactly as spec §6 defines them** so results are
   consistent across sessions.

## Services
- `frontend/` — React + Vite + TS. `npm run dev`, `npm test`. Talks to the analysis service via nginx `/api` proxy.
- `analysis/` — Python 3.12+ / FastAPI. `pytest`. Owns HTTP + analysis, no persistence.

## Run everything
`docker compose up --build` then open http://localhost:8090 (analysis :8000).
Host port 3000 is commonly taken, so the frontend is remapped to 8090. nginx proxies `/api` to the analysis service on the internal network.

## Conventions
- v1 is stateless: no database.
- Friendly-by-default UI with an expert/debug layer (see spec §1).
- Local toolchain: Python via `python3.13`.
