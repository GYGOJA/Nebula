# Running Nebula in Docker

Everything (PostgreSQL, Redis, migrations, API, web) runs in isolated containers.

```bash
cp .env.docker.example .env      # set DB_PASSWORD, JWT_SECRET, EMAIL_*
docker compose up --build -d
```

Open http://localhost:8081 (change `WEB_PORT` in `.env`).

- `migrate` applies everything in `./migrations` on each start, then exits.
- Data lives in named volumes: `pgdata`, `redisdata`, `uploads`.
- nginx serves the frontend and proxies `/api` to the API (live-update streams are not buffered), so the browser only talks to one origin.
- Logs: `docker compose logs -f api` · Stop: `docker compose down` (add `-v` to wipe data).
- Registration codes are sent through Gmail, so the `api` container needs outbound internet access to the mail server.
- Voice and video calls work on a local network as-is; for users behind strict NATs set the `TURN_*` variables.
- The Go image uses `golang:1.27-alpine` (matches `go.mod`). If that tag is not available to you yet, pass `--build-arg GO_VERSION=<version>`.
