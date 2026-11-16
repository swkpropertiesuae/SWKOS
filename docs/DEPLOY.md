# Deployment: Oracle Cloud VM + Cloudflare Tunnel

Production address: **https://os.swk.properties**. The app runs in Docker on an Oracle Cloud Always Free ARM VM with its own SQLite database. Cloudflare provides DNS and HTTPS through a Tunnel, so the VM opens no web ports.

## Domains (Cloudflare)
| Host | Goes to |
|---|---|
| `os.swk.properties` | This app, through the Tunnel |
| `swk.properties`, `www.swk.properties` | 301 redirect to `https://www.swkpropertiesuae.com` |
| `www.swkpropertiesuae.com` | Main website (separate repo) |

## 1. Oracle VM
1. Create a `VM.Standard.A1.Flex` instance (2 OCPU, 12 GB, Ubuntu 24.04, public IP, 100 GB boot volume). Save the SSH key.
2. `ssh ubuntu@<ip>`, then:
```bash
sudo apt update && sudo apt -y upgrade
sudo timedatectl set-timezone Asia/Dubai
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER
```
Log out and back in.

## 2. App
```bash
git clone https://github.com/swkpropertiesuae/swkpropertiesOS.git && cd swkpropertiesOS
cp .env.example .env
openssl rand -hex 32        # use as APP_SECRET
nano .env
```
Set in `.env`: `PUBLIC_URL=https://os.swk.properties`, `APP_SECRET`, `OWNER_PASSWORD`, `ADMIN_PASSWORD`, `ADMIN_SWK_PASSWORD`, `MANAGER_PASSWORD`, `BDM_PASSWORD`, `TRUST_PROXY=true`, `COOKIE_SECURE=true`, SMTP values if used. Leave `DATABASE_URL` empty (SQLite). Keep `APP_SECRET` in a password manager.
```bash
docker compose up -d --build
curl localhost:8080/api/health
```
Data (database, uploads, backups) lives in the `swkos-data` Docker volume.

## 3. Cloudflare Tunnel
Zero Trust, Networks, Tunnels, create a tunnel, choose Debian/Ubuntu arm64 and run the shown commands on the VM. Add a public hostname: `os.swk.properties` pointing to `http://localhost:8080`. Set SSL/TLS mode to Full.

Redirects: Rules, Redirect Rules, hostname `swk.properties` or `www.swk.properties`, to `https://www.swkpropertiesuae.com` (301, keep path). Both names need a proxied DNS record (for example `A 192.0.2.1`).

## 4. First sign-in
Sign in, change the default passwords, turn on two-factor authentication for administrators, and set the company details under Administration, Settings. Public webhooks (`/api/public/*`) must stay reachable over HTTPS; the Tunnel handles that.

## Backups
Administration, Backup creates consistent SQLite snapshots. Also schedule a nightly copy of the volume off the VM:
```bash
mkdir -p ~/backups && crontab -e
# 0 3 * * * docker run --rm -v swkpropertiesos_swkos-data:/d -v $HOME/backups:/b busybox tar czf /b/swkos-$(date +\%F).tgz -C /d . && find $HOME/backups -mtime +14 -delete
```
Confirm the volume name with `docker volume ls`. Optionally enable R2 nightly backups under Integrations.

## Updating
```bash
cd ~/swkpropertiesOS && git pull && docker compose up -d --build
```
Schema changes apply automatically on start.

## Notes
- SQLite is single-node, which suits one company. Move to PostgreSQL (`DATABASE_URL`, see `docs/POSTGRES.md`) only for multi-node or high availability.
- Oracle can reclaim idle Always Free VMs: keep the off-site backups.
- The Docker image includes Chromium (PDFs) and Tesseract/Poppler.
