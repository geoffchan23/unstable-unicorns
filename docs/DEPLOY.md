# Deploy runbook

One-time VM/DNS/firewall setup for `play.geoffreychan.com` (the game server) and
`geoffreychan.com/unicorns/` (the static PWA, published into the `geoffchan23.github.io`
site repo). Steps 1–4 are done once, together, in a session; step 5 is the normal deploy.

## 1. DNS

GoDaddy DNS for `geoffreychan.com`:

1. Add an `A` record: host `play`, value `140.238.145.208`, TTL `600` (seconds — the
   shortest GoDaddy allows; lets a later IP change propagate quickly).

Verify from the Mac, once GoDaddy has saved it (may take a few minutes to propagate):

```bash
dig +short play.geoffreychan.com
```

Expect `140.238.145.208`.

## 2. Oracle firewall

Open TCP 80 and 443 on the OCI security list, then mirror that in the VM's own iptables
(Oracle images ship with both a cloud firewall and a local one).

Console: VCN → the VM's subnet → security list → Ingress Rules → Add Ingress Rules, twice
(source `0.0.0.0/0`, TCP, destination port 80; then TCP, destination port 443).

Or via the OCI CLI, after `oci session authenticate`:

```bash
oci network security-list update \
  --security-list-id <ocid> \
  --ingress-security-rules file://deploy/ingress.json
```

`deploy/ingress.json` includes the existing SSH rule (TCP 22) plus TCP 80 and 443, all from
`0.0.0.0/0` — `update` replaces the whole rule list, so it must carry every rule that should
still exist.

On the VM:

```bash
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

Verify from the Mac:

```bash
nc -z -G 3 140.238.145.208 80
nc -z -G 3 140.238.145.208 443
```

Both should report the port as open (once Caddy is listening in step 3; before that, 80/443
being reachable but connection-refused is still a passing firewall check).

## 3. Caddy

Install from Caddy's official apt repo (on the VM):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Copy the repo's Caddyfile to the VM and reload:

```bash
scp -i ~/.ssh/oci_wordle_key deploy/Caddyfile ubuntu@140.238.145.208:~/Caddyfile
ssh -i ~/.ssh/oci_wordle_key ubuntu@140.238.145.208 'sudo cp ~/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy'
```

Verify from the Mac, once the game server is running (step 5):

```bash
curl -I https://play.geoffreychan.com/healthz
```

Expect `HTTP/2 200`. Caddy fetches and renews the TLS certificate automatically on first
request to the domain.

## 4. Server env

Create `~/unicorns/.env` on the VM (not committed anywhere — this is the only place the
passphrase lives outside your head):

```
UNICORNS_PASSPHRASE=<choose a family passphrase>
PORT=8787
ALLOWED_ORIGINS=https://geoffreychan.com
```

`scripts/deploy-server.sh` refuses to proceed if this file is missing. `pm2 startup` is
already configured on this VM (from the Wordle bot), so pm2-managed processes survive a
reboot; `pm2 save` (run automatically by the deploy script) persists the process list.

## 5. Deploy

Server (bundles, ships, and restarts the game server via pm2):

```bash
scripts/deploy-server.sh
```

Web (builds the static PWA and pushes it into the `geoffchan23.github.io` site repo):

```bash
scripts/deploy-web.sh
```

Both use `UU_HOST` / `UU_KEY` / `SITE_REPO` env vars to override their defaults
(`ubuntu@140.238.145.208`, `~/.ssh/oci_wordle_key`, `../../geoffchan23.github.io`).

Logs:

```bash
ssh -i ~/.ssh/oci_wordle_key ubuntu@140.238.145.208 'pm2 logs unicorns'
```

## 6. Smoke test

1. Open `https://geoffreychan.com/unicorns/`.
2. Tap "Play online", create a room with the family passphrase.
3. Join the same room from a phone using the 4-letter room code (or the share link).
4. Start the game and play a turn from each device to confirm both directions of the
   websocket connection work through Caddy.
