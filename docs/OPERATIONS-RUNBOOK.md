# Operations runbook

For the person who runs the live server. Architecture and first-time setup: [DEPLOY-FREE.md](DEPLOY-FREE.md). All commands run over SSH on the Lightsail instance. Use `--env-file ../../.env` on every `docker compose` command.

## Update to the latest version (use the folder you cloned; on the current server it is `~/swkpropertiesOS`)

```bash
cd ~/swkpropertiesOS && git checkout main && git pull
cd deploy/free && docker compose --env-file ../../.env up -d --build
docker compose --env-file ../../.env logs --tail 40 swkos
```

Wait for `SWK OS listening`. Then hard-refresh the browser (Ctrl+Shift+R). Merging to GitHub does not change the live server; only these commands do.

## Check health and logs

```bash
docker compose --env-file ../../.env ps
docker compose --env-file ../../.env logs -f swkos
```

`swkos` should show `Up ... (healthy)`. Repeated `/api/health` lines in the log are the container's own health check.

## Change an environment value

Edit `.env`, then recreate the container (a plain `restart` does not re-read `.env`):

```bash
docker compose --env-file ../../.env up -d --force-recreate swkos
```

## Reset a forgotten Owner or Admin password

The Admin cannot change the Owner account, so each has its own secret. Enter the new password with a hidden prompt so it never appears on screen or in history. Use letters, digits and `@` only.

```bash
read -rsp "New admin password: " P; echo; sed -i '/^ADMIN_SWK_PASSWORD=/d' ../../.env; echo "ADMIN_SWK_PASSWORD=$P" >> ../../.env; unset P
read -rsp "New owner password: " P; echo; sed -i '/^OWNER_PASSWORD=/d' ../../.env; echo "OWNER_PASSWORD=$P" >> ../../.env; unset P
docker compose --env-file ../../.env up -d --force-recreate swkos
```

Each value is applied once. Applying it signs that user out. To reset again, set a different value. Afterwards set a personal password in the app.

## Backups

- Nightly R2 backup: configured under Settings, Integrations. Test a restore from time to time.
- Daily archive of the data volume: written to `BACKUP_DIR` and kept for 14 days.
- Restore an archive: `docker run -v swkos-data:/data -v $PWD/backups:/b alpine tar xzf /b/swkos-DATE.tgz -C /data`.

## Rules for the Cloudflare workflow

The GitHub workflow "Deploy to Cloudflare" is disabled on purpose. Do not enable it: it would take `os.swk.properties` away from this server.

## Releasing code (for developers)

Work happens on a branch, a pull request runs CI (typecheck, build, browser tests, all API suites on SQLite and Postgres), and merging to `main` also triggers the image build. Merge only when CI is green. Then update the server as above.
