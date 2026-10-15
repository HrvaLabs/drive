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

## Project ownership and deployment

HrvaDrive is a [HrvaLabs](https://hrvalabs.net/) project. Its public source
repository will be hosted at [HrvaLabs/drive](https://github.com/HrvaLabs/drive).
It has two independently published Docker images:

- `ghcr.io/hrvalabs/hrva-drive-frontend:latest`
- `ghcr.io/hrvalabs/hrva-drive-analysis:latest`

The GitHub Actions workflow normalizes the GHCR namespace to lowercase and
adds a source-repository label for both images. Package visibility and package
permissions are separate from GitHub repository visibility.

### Safe migration of the Portainer stack

`docker-compose.prod.yml` supports the following **optional** stack variables.
Their defaults deliberately keep the original personal-namespace images
until the new ones are ready:

```dotenv
DRIVE_FRONTEND_IMAGE=ghcr.io/hrvalabs/hrva-drive-frontend:latest
DRIVE_ANALYSIS_IMAGE=ghcr.io/hrvalabs/hrva-drive-analysis:latest
```

After transferring the repository to the HrvaLabs organization:

1. Trigger a push to `main` and verify that **both** GHCR images were published.
2. Make the two GHCR packages public (if acceptable) or configure Portainer's
   GHCR registry credentials with `read:packages`.
3. Confirm that both new image references are pullable **on the deployment host**.
4. Set both stack variables in Portainer, then pull and redeploy the stack.
5. Check `/health` for the analysis API via the internal container/network and
   confirm that the public frontend can analyze an uploaded OBD2 file.

Only the analysis API and frontend are recreated; browser-stored drive history
is unaffected. To roll back, restore the original personal-namespace image
values and redeploy. Avoid pruning known-good images before validation.

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
