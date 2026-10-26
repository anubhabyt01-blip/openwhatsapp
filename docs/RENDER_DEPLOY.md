# Deploy on Render

This repository already includes a Render Blueprint in `render.yaml`. It creates
the Docker web service and a Render Postgres database. The web service listens
on port `10000`, and Render's deploy/runtime health check is configured as
`GET /health`.

The `/health` endpoint returns HTTP 200 when the app can reach its database and
HTTP 503 when the database handle or connection is unavailable. After deploy,
the public health URL will be:

```text
https://<your-render-service>.onrender.com/health
```

## Ping the health URL once a minute

`cmd/health-ping` is an external monitor. It sends a GET immediately on startup,
then once per minute, and logs the status and response time. It does not need an
API key because `/health` is intentionally public and does not expose database
details.

Run it from a machine or service that stays online, not inside the API process:

```powershell
$env:HEALTH_URL = "https://<your-render-service>.onrender.com/health"
go run ./cmd/health-ping
```

The default interval is one minute. To change it, set `PING_INTERVAL` to a Go
duration such as `30s` or `5m` before starting the pinger.

## Render Free plan limits

Render's own health checks verify service readiness; the external pinger is
optional. A Free web service can spin down after 15 minutes without inbound
traffic, has a monthly free-instance-hours limit, and may restart. The Blueprint
also provisions a Free Render Postgres database, which expires 30 days after
creation. For a continuously available production API and durable database,
choose appropriate paid Render service and database plans. See Render's
[Free instance limits](https://render.com/docs/free),
[health-check guidance](https://render.com/docs/health-checks), and
[Blueprint reference](https://render.com/docs/blueprint-spec).
