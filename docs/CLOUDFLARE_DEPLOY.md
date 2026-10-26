# Cloudflare deployment

This repository is a Go API, not a static Pages site. Deploy it as a **Worker with a Cloudflare Container**. The Worker forwards API and WebSocket requests to one named container instance so all requests reach the same Evolution Go process.

Cloudflare Containers require a Workers Paid plan. The first container start can take a few minutes. The existing `Dockerfile` builds the Go service; Wrangler uses it through `wrangler.jsonc`.

## 1. Create a Cloudflare Worker project

Connect this repository under **Workers & Pages → Create → Workers Builds** (not Pages static-site builds). Set the project root to the repository root and the deploy command to:

```text
npx wrangler deploy
```

Wrangler needs Docker to build the `Dockerfile`. Workers Builds performs this build in Cloudflare's build environment.

## 2. Configure database secrets

The API needs a PostgreSQL database reachable from Cloudflare over the public internet. For a Render database, use its **External Database URL**, not its internal URL. For Neon, use the **direct (non-pooled)** URL. This repository uses `lib/pq` v1.10.9, which does not support Neon’s `channel_binding=require` option; use Neon’s direct URL with `sslmode=verify-full` and remove `&channel_binding=require`. Percent-encode special characters in the username or password before putting them in the URL.

Add these as encrypted Worker secrets in Cloudflare, or set them with Wrangler from a logged-in local terminal:

```text
POSTGRES_AUTH_DB
POSTGRES_USERS_DB
GLOBAL_API_KEY
```

In the Cloudflare dashboard, open the Worker → **Settings → Variables and Secrets** and add each as an encrypted secret. With Wrangler, run `npx wrangler secret put POSTGRES_AUTH_DB`, then paste the value when prompted; repeat for the other two names.

Both PostgreSQL URLs can point to the same database, matching the current Render Blueprint. To set separate URLs, the database user must already have access to both databases; the app's automatic database-creation attempt is best-effort and does not grant database-creation permissions.

Create a long random `GLOBAL_API_KEY` and keep it private. Do not put secrets in `wrangler.jsonc`, `package.json`, or the Docker image.

## 3. Deploy and check

After connecting the Worker and adding the secrets, deploy the production branch. Open `/health` on the Worker URL; a `200` with `{"status":"ok"}` confirms the API and database are reachable. The first request may wait while Cloudflare starts the container.

`wrangler.jsonc` sets `CONNECT_ON_STARTUP=true` so saved WhatsApp sessions reconnect after a container restart. Cloudflare may stop an inactive container after its configured inactivity period; use a persistent PostgreSQL database for application state and verify the WhatsApp connection after restarts.

## Current limitations

- Cloudflare Containers are a paid Workers feature.
- This Worker routes all requests to one named, stateful container; it is not a horizontally scaled stateless deployment.
- The container needs outbound internet access for WhatsApp and the external PostgreSQL database.
- Container inactivity/restarts can interrupt live WhatsApp connections; startup reconnect is enabled, but this setup is not equivalent to an always-on VM.
- Render's `render.yaml` remains for Render deployments and does not configure Cloudflare.
