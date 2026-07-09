# Recruiter Lens Backend — Deployment Runbook (AWS EC2 + Docker + CI/CD)

Deploy the backend to a single EC2 instance running Docker, with automatic
HTTPS (Caddy + Let's Encrypt) and "git push → auto-deploy" via GitHub Actions.

**Architecture**

```
  git push (main, backend files)
        │
        ▼
  GitHub Actions ── builds image ──▶ GHCR (ghcr.io/<you>/recruiter-lens-backend)
        │
        └── SSH into EC2 ──▶ docker compose pull && up -d
                                   │
                    ┌──────────────┴───────────────┐
                    ▼                               ▼
              caddy (443)  ──internal──▶  backend (3000)
            auto HTTPS via                 your Node app
            Let's Encrypt
                    ▲
     https://<you>.duckdns.org  ◀── Chrome extension + Zoho OAuth
```

State (Zoho tokens, logs) lives in **Supabase**, so the server itself is
stateless — you can destroy and recreate it without losing data.

---

## Values to fill in

Decide these once and reuse them everywhere below:

| Placeholder | Meaning | Example |
|---|---|---|
| `<GH_USER>` | your GitHub username | `saksh` |
| `<DOMAIN>` | your DuckDNS hostname | `recruiterlens.duckdns.org` |
| `<EC2_IP>` | server public IP (after launch) | `13.234.x.x` |
| `<YOUR_IP>` | your home/office IP (for SSH) | find at whatismyip.com |

---

## Part A — One-time server setup

### A1. Launch the EC2 instance
In the AWS Console (region **Asia Pacific (Mumbai) ap-south-1**, top-right):

1. **EC2 → Launch instance.**
2. Name: `recruiter-lens`.
3. AMI: **Ubuntu Server 24.04 LTS** (x86_64 — *not* Arm).
4. Instance type: **t3.small**.
5. Key pair: **Create new** → name `recruiter-lens-key`, type **ED25519**,
   format **.pem** → download it. Keep this file safe; it's your only SSH key.
6. Network settings → **Edit** → create a security group with these inbound rules:
   | Type | Port | Source | Purpose |
   |---|---|---|---|
   | SSH | 22 | **My IP** (`<YOUR_IP>`) | your admin access only |
   | HTTP | 80 | Anywhere `0.0.0.0/0` | Let's Encrypt challenge |
   | HTTPS | 443 | Anywhere `0.0.0.0/0` | the API |
7. Storage: 16 GB gp3 is plenty.
8. **Launch**, then copy the instance's **Public IPv4 address** → this is `<EC2_IP>`.

> Tip: allocate an **Elastic IP** and associate it, so the IP doesn't change if
> you ever stop/start the instance. (EC2 → Elastic IPs → Allocate → Associate.)

### A2. Point DuckDNS at the server
1. Go to https://www.duckdns.org, sign in (GitHub/Google).
2. Create a subdomain, e.g. `recruiterlens` → you now own `<DOMAIN>`.
3. Set its IP to `<EC2_IP>` and save.
4. Verify from your machine: `nslookup <DOMAIN>` should return `<EC2_IP>`.

### A3. SSH in and install Docker
From PowerShell on Windows (OpenSSH is built in):

```powershell
# lock down the key file (once)
icacls "$env:USERPROFILE\Downloads\recruiter-lens-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "$env:USERPROFILE\Downloads\recruiter-lens-key.pem" ubuntu@<EC2_IP>
```

Then on the server:

```bash
# Install Docker Engine + Compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu           # run docker without sudo
newgrp docker                            # apply the group now
docker --version && docker compose version
```

### A4. Get the deploy files and create the server .env
```bash
# Clone your repo onto the server
git clone https://github.com/<GH_USER>/recruiter-lens.git ~/recruiter-lens
cd ~/recruiter-lens/recruiter-lens-backend/deploy

# Create the server .env from the template, then edit it
cp .env.example .env
nano .env
```

Fill `.env` with:
- `IMAGE=ghcr.io/<GH_USER>/recruiter-lens-backend`
- `DOMAIN=<DOMAIN>` and `ACME_EMAIL=you@example.com`
- All the app secrets from your **local** `.env`
- `ZOHO_REDIRECT_URI=https://<DOMAIN>/oauth/callback`  ← the important change

Save (Ctrl+O, Enter, Ctrl+X).

### A5. Log in to GHCR on the server
The image is private, so the server needs read access. Create a GitHub
**Personal Access Token (classic)** with the **`read:packages`** scope
(github.com → Settings → Developer settings → Tokens). Then:

```bash
echo "<THAT_PAT>" | docker login ghcr.io -u <GH_USER> --password-stdin
```

> You won't have an image to pull until CI runs once (Part C). If you want to
> test the server before setting up CI, build locally instead:
> `cd ~/recruiter-lens/recruiter-lens-backend && docker build -t ghcr.io/<GH_USER>/recruiter-lens-backend:latest . && cd deploy`

### A6. Start it and confirm HTTPS
```bash
cd ~/recruiter-lens/recruiter-lens-backend/deploy
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f caddy    # watch cert issue
```

Within ~30s Caddy should report a certificate obtained for `<DOMAIN>`. Then
from your laptop:

```
https://<DOMAIN>/health
```

You'll get `{"status":"error","zohoConnected":false,...}` — that's expected
until OAuth is done (Part B). A valid padlock + a JSON response = the server
and HTTPS work.

---

## Part B — Re-run Zoho OAuth for the new URL

Because the redirect URI changed from localhost to your HTTPS domain:

1. In the **Zoho API Console** (https://api-console.zoho.in) → your app →
   **update the Authorized Redirect URI** to exactly
   `https://<DOMAIN>/oauth/callback`.
2. Confirm the same value is in the server `.env` (`ZOHO_REDIRECT_URI`), then
   restart if you changed it:
   `docker compose -f docker-compose.prod.yml up -d`
3. In your browser, visit `https://<DOMAIN>/oauth/start`, log in to Zoho, approve.
4. You should land on `/oauth/callback` with the success message. Now
   `https://<DOMAIN>/health` should show `"zohoConnected": true`.

This is one-time; the cron job keeps the token fresh afterward.

---

## Part C — Wire up git-push auto-deploy

### C1. Commit the pipeline files
These are already in your repo (`.github/workflows/deploy-backend.yml`, the
`Dockerfile`, and `deploy/`). Commit and push them:

```bash
git add .github/ recruiter-lens-backend/Dockerfile recruiter-lens-backend/.dockerignore recruiter-lens-backend/deploy/ recruiter-lens-backend/docker-compose.yml
git commit -m "Add backend Docker + AWS deploy pipeline"
git push origin main
```

### C2. Add repository secrets
GitHub repo → **Settings → Secrets and variables → Actions → New repository
secret**, add:

| Secret | Value |
|---|---|
| `EC2_HOST` | `<EC2_IP>` (or `<DOMAIN>`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | the **entire contents** of your `.pem` private key |
| `GHCR_USER` | `<GH_USER>` |
| `GHCR_PAT` | the `read:packages` token from A5 |

### C3. Trigger and verify
The push in C1 (touching backend files) already kicks off the workflow. Watch
it under the repo's **Actions** tab. On success:
- a new image appears under your GitHub **Packages**, and
- the `deploy` job SSHes in and restarts the container with it.

From now on: **edit backend code → `git push` → it's live in ~2–3 minutes.**
Test with a trivial change (e.g. a log line in `index.js`) and watch it deploy.

> First run only: your GHCR package defaults to private, which is what we want.
> Make sure the package's visibility settings still allow your PAT to pull.

---

## Part D — Point the extension at the new backend

Your extension currently calls `http://localhost:3000`. Update it to
`https://<DOMAIN>`:

1. In `recruiter-lens-react/`, find the backend base URL (likely in
   `src/api.js` and/or `background.js`) and replace the localhost base with
   `https://<DOMAIN>`.
2. Rebuild: `cd recruiter-lens-react && npm run build`
   (remember: `background.js` changes need only an extension reload; `src/`
   changes need this build).
3. In `chrome://extensions`, reload the unpacked extension.
4. Make sure the extension's `host_permissions` in `manifest.json` include
   `https://<DOMAIN>/*` so the service worker is allowed to call it.

---

## Part E — Verify end-to-end & day-to-day ops

**End-to-end:** open a LinkedIn profile, run a lookup and an add. Confirm the
Zoho record + PDF attachment appear.

**Useful commands (on the server):**
```bash
cd ~/recruiter-lens/recruiter-lens-backend/deploy
docker compose -f docker-compose.prod.yml logs -f backend   # live logs
docker compose -f docker-compose.prod.yml restart backend   # restart app
docker compose -f docker-compose.prod.yml ps                # status
```

**Cost:** ~$6–8/month for the t3.small (billed hourly), plus the Elastic IP is
free while attached. Set a billing alarm (Billing → Budgets) at, say, $15 to be
safe.

---

## Things you must do yourself (I can't, by design)

For your security I don't create the AWS account/resources or enter any
credentials on your behalf. You'll personally: launch the EC2 instance and key
pair, create the DuckDNS record and GitHub PAT, and paste secrets into the
server `.env` and GitHub Actions secrets. This runbook gives the exact clicks
and commands for each.
