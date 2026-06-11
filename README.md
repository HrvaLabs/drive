# HrvaDrive

Upload an OBD2 drive log (from the Car Scanner ELM OBD2 app), get back a clear
drive report: summary, map, graphs, driving profile, eco/economy tips, and
engine health. Drives are saved privately in your browser (IndexedDB) so you can
track history, compare two drives, and explore gear usage — your history stays in
your browser, not on a server.

> **Hobby project, provided "as is" with no warranty** (see [LICENSE](LICENSE)).
> The analysis server is stateless — your log is processed in memory to build the
> report and is not stored. If you run your own instance, you are responsible for
> it and any data it handles; see [PRIVACY.md](PRIVACY.md). Not affiliated with
> Car Scanner.

## Architecture
- `frontend/` — React + Vite SPA (the dashboard)
- `analysis/` — Python FastAPI: the analysis engine (pandas/numpy)

## Run it
```bash
docker compose up --build
```
- Frontend (open this): http://localhost:8090
- Analysis API: http://localhost:8000

> Host port 3000 is commonly already in use, so the frontend is remapped to 8090. nginx proxies `/api` to the analysis service on the internal network.

## Docs
- Overview: `docs/PROJECT-BRIEF.md`
- Roadmap & research backlog: `docs/ROADMAP.md`
- Feature specs: `docs/specs/` · implementation plans: `docs/plans/`
