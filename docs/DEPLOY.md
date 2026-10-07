# Deploy runbook

One-time VM/DNS/firewall setup for `play.geoffreychan.com` (the game server) and
`geoffreychan.com/unicorns/` (the static PWA, published into the `geoffchan23.github.io`
site repo). Steps 1–4 are done once, together, in a session; step 5 is the normal deploy.

**Status:** steps 1–4 were completed on 2026-10-07 and v1.2 went live then. The VM runs only this game
(the Wordle bot it used to host was removed). Everything a deploy needs lives on Geoff's current Mac:
the SSH key `~/.ssh/oci_wordle_key` and the OCI CLI (`brew install oci-cli`).

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

Or via the OCI CLI. Sign in first (opens a browser; "Tenancy" there is your Oracle Cloud
account name, and the session lasts about a day):

```bash
oci session authenticate --region ca-toronto-1 --profile-name DEFAULT
export OCI_CLI_AUTH=security_token
# always look before replacing: `update` overwrites the whole rule list
oci network security-list get --security-list-id <ocid> --query 'data."ingress-security-rules"'
oci network security-list update \
  --security-list-id <ocid> \
  --ingress-security-rules file://deploy/ingress.json
```

The security list is `ocid1.securitylist.oc1.ca-toronto-1.aaaaaaaanrqrnokos7qjcc2xdrljww2dkgqzxp2pwozpirqws3t7hzkzgdzq`
(the VM's subnet's only one). `deploy/ingress.json` is the full rule list as it stands: SSH (TCP 22),
Oracle's two default ICMP rules (type 3 code 4 from anywhere, type 3 from the VCN's `10.0.0.0/16`, which
path-MTU discovery and in-VCN errors need), and TCP 80 and 443. `update` replaces the whole list, so
any rule left out of the file is deleted — compare it with the `get` above first.

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
request to the domain. If it tried before the DNS record existed it backs off between retries
(a TLS "internal error" from curl); `sudo systemctl restart caddy` on the VM makes it try again now.

## 4. Server env

Create `~/unicorns/.env` on the VM (not committed anywhere):

```
PORT=8787
ALLOWED_ORIGINS=https://geoffreychan.com
```

There is no passphrase. Anyone the origin check lets in may create a room; what keeps this
server ours is that origin allowlist plus the caps in `src/server/server.ts` (one new room a
minute per address, 50 rooms, 200 connections, and rooms that reap themselves when empty).

Optional: `HOST` overrides the bind address (defaults to `127.0.0.1` in production, since
Caddy proxies to localhost — the default is right for this deployment; leave it unset). The
dev server (`scripts/dev.mjs`) always binds `0.0.0.0` regardless of `HOST` so phones on the
LAN can reach it during development; it prints the `lan:` address to open, and the dev build
finds the game server on whichever host served the page.

`scripts/deploy-server.sh` refuses to proceed if this file is missing. `pm2 startup` is
already configured on this VM (`pm2-ubuntu.service`), so pm2-managed processes survive a
reboot; `pm2 save` (run automatically by the deploy script) persists the process list.

pm2's environment for the `unicorns` process comes from `deploy-server.sh` sourcing
`~/unicorns/.env` before calling `pm2 startOrRestart ... --update-env`. Always restart via
that script — a bare `pm2 restart unicorns --update-env` run directly on the VM does not
re-source `.env` and will drop `ALLOWED_ORIGINS` (and any other env var) from the running
process.

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
(`ubuntu@140.238.145.208`, `~/.ssh/oci_wordle_key`, `../geoffchan23.github.io`, i.e. the site
repo cloned next to this one). `deploy-web.sh` pulls the site repo before committing to it: a bot
commits usage stats there, so a stale clone would have its push rejected.

The site repo is a Jekyll site, and Jekyll drops any file whose name begins with an underscore from
what it publishes — such a file rsyncs and commits without complaint, then 404s in production. That
is what `_back.webp` (the card back) did on the first deploy. `scripts/build.mjs` now fails the build
if an underscore-prefixed art file appears, so this cannot happen again quietly.

`scripts/deploy-web.sh` must be run on a machine with `assets/art/` populated
(`python3 scripts/art.py` — see the main `README`/`CLAUDE.md`); it warns but does not refuse
to proceed otherwise, so running it from a fresh clone without that step ships placeholder
card art to production.

Logs:

```bash
ssh -i ~/.ssh/oci_wordle_key ubuntu@140.238.145.208 'pm2 logs unicorns'
```

## 6. Search engines

`src/ui/index.html` carries `<meta name="robots" content="noindex, nofollow">`, which is the whole of
it: the site repo is GitHub Pages, so there is no way to send an `X-Robots-Tag` header, and its
`robots.txt` (if it grows one) belongs to the rest of `geoffreychan.com`, not to this game.

## 7. Smoke test

1. Open `https://geoffreychan.com/unicorns/`.
2. Tap "Play online" and create a room.
3. Join the same room from a phone using the 4-letter room code (or the share link).
4. Start the game and play a turn from each device to confirm both directions of the
   websocket connection work through Caddy.
