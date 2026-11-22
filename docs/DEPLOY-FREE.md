# Production setup: AWS Lightsail + Cloudflare Tunnel

This is how SWK OS runs today at `https://os.swk.properties`. Day-to-day operation is in [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md).

```
Users -> Cloudflare (DNS, HTTPS, tunnel) -> AWS Lightsail "swk-os" (Stockholm)
                                             Docker Compose: swkos + cloudflared + backup
                                                     |
                                       Supabase Postgres (Stockholm, schema "swk")
                                       Cloudflare R2 (nightly backups)
```

| Part | What it is |
|---|---|
| Server | AWS Lightsail instance `swk-os`, Stockholm, Ubuntu with Docker |
| Stack | `deploy/free/docker-compose.yml`: `swkos` (the app), `cloudflared` (tunnel connector), `backup` (daily archive of the data volume) |
| Access | Cloudflare Tunnel routes `os.swk.properties` to `http://swkos:8080`. No inbound port is open except SSH. |
| Database | Supabase Postgres, same region as the server, session pooler on port 5432 |
| Backups | Nightly to Cloudflare R2 (Settings, Integrations) plus a daily archive in `BACKUP_DIR` on the server (14 days kept) |

## First-time setup

1. **Cloudflare Tunnel.** Zero Trust, Networks, Tunnels, create a tunnel. Copy its token into `.env` as `TUNNEL_TOKEN`. Add a public hostname `os.swk.properties` pointing to service `http://swkos:8080`. The DNS record must point at this tunnel's ID.
2. **Server.** Create the Lightsail instance, install Docker, then:
   ```bash
   git clone https://github.com/swkpropertiesuae/SWKOS.git && cd SWKOS
   cp .env.example .env && nano .env
   cd deploy/free && docker compose --env-file ../../.env up -d --build
   docker compose --env-file ../../.env logs -f swkos
   ```
3. **Do not restart while the first start is seeding the database.** Wait for the line `SWK OS listening`.
4. **Sign in** as the Owner and Admin with the passwords you put in `.env` (or the generated ones printed once at first start), then change them to personal passwords.

## `.env` essentials

| Variable | Purpose |
|---|---|
| `PUBLIC_URL` | `https://os.swk.properties` |
| `TRUST_PROXY`, `COOKIE_SECURE` | `true`, because the app sits behind the tunnel |
| `DATABASE_URL`, `PG_SCHEMA`, `PG_CA_CERT` | Supabase connection, schema (`swk`) and the provider CA (single line, `\n` for line breaks) |
| `APP_SECRET` | Encrypts stored integration credentials. Back it up separately. |
| `TUNNEL_TOKEN` | Cloudflare Tunnel connector token |
| `OWNER_PASSWORD`, `ADMIN_SWK_PASSWORD` | Owner and Admin passwords (see [ACCESS-AND-PASSWORDS.md](ACCESS-AND-PASSWORDS.md)) |
| `MANAGER_PASSWORD`, `BDM_PASSWORD` | Optional starting passwords for the Manager and staff |
| `BACKUP_DIR` | Where the daily archive is written |

Never paste these values into chat or commit them. `.env` is git-ignored.

## Things that go wrong

- Every `docker compose` command in `deploy/free` needs `--env-file ../../.env`, including `logs`, `ps` and `restart`. Without it you see `required variable TUNNEL_TOKEN is missing a value`.
- Tunnel errors such as `Invalid tunnel secret`, `Tunnel not found` or error 1033 mean the token or the DNS record does not match the live tunnel.
- If a router resolves the site badly, set the computer's DNS to 1.1.1.1 or 8.8.8.8.

## What this setup cannot promise

- One server means a few minutes of downtime during an update or a failure.
- Keep the R2 backups and test a restore from time to time.
- Never run two copies of `swkos` against the same database: the scheduler would run twice.
