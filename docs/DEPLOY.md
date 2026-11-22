# Deployment

Production is described in [DEPLOY-FREE.md](DEPLOY-FREE.md) (architecture and first-time setup) and operated with [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) (updates, backups, password resets, troubleshooting).

## Summary

- **Host:** AWS Lightsail instance in Stockholm, running Docker Compose from `deploy/free`.
- **Public access:** a Cloudflare Tunnel publishes `os.swk.properties`. No inbound ports are open on the server.
- **Database:** Supabase Postgres in Stockholm (schema `swk`). See [POSTGRES.md](POSTGRES.md).
- **Backups:** nightly copy to Cloudflare R2 (Settings, Integrations) and a daily archive of the data volume on the server.

## Settings that matter

- `APP_SECRET` encrypts integration credentials. Keep it separate from backups; losing it makes stored credentials unreadable.
- `PUBLIC_URL`, `TRUST_PROXY=true` and `COOKIE_SECURE=true` must be set behind the tunnel.
- `OWNER_PASSWORD` and `ADMIN_SWK_PASSWORD` set the Owner and Admin passwords (see [ACCESS-AND-PASSWORDS.md](ACCESS-AND-PASSWORDS.md)).
- The Docker image includes Chromium for server-side PDFs. Without Docker install `chromium` and set `CHROME_PATH`.
- Public webhooks (`/api/public/whatsapp`, `/api/public/tracking/<secret>`, `/api/public/bank/<secret>`) must be reachable over HTTPS.

## Upgrades

Pull the code and rebuild. Schema changes apply automatically on start. See the runbook for the exact commands.
