# First deploy on a fresh Ubuntu 24.04 VPS

Target: a Hostinger KVM 2 (2 vCPU, 8 GB RAM, NVMe) running Ubuntu 24.04, with
the whole stack on this one machine. The stack is `infra/docker/docker-compose.prod.yml`.
Its memory limits add up to about 5.7 GB.

You need these ready before you start:

- A domain on Cloudflare. If there's no product domain yet, any cheap
  temporary domain works for staging. Only `APP_DOMAIN`/`API_DOMAIN` change
  later.
- A Cloudflare API token with **Zone → DNS → Edit** for that zone only.
- A Cloudflare R2 bucket and an R2 API token scoped to it ("Object Read & Write").
- Two age keypairs, made on your own machine, **not** the server (see
  `infra/backup/README.md`, "Key custody").
- SMTP credentials.

## 1. Base system (as root, once)

```sh
apt update && apt -y full-upgrade
apt -y install ca-certificates curl ufw unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades   # security updates, automatic
timedatectl set-timezone UTC                            # logs and backups in UTC

# A non-root deploy user with your SSH key; then turn off root/password logins
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Before you close this session, open a **second** SSH session as `deploy` to
confirm you can still get in.

## 2. Firewall: only 22, 80, 443

```sh
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp      # HTTP/3
ufw enable
```

Docker writes its own iptables rules, and **published ports bypass ufw**.
That's why the production compose publishes nothing except Caddy's 80/443:
Postgres and Redis have no `ports:` entries at all. Check this after every
change with `docker compose ps` (only caddy may show `0.0.0.0:`). Also turn
on Hostinger's panel firewall with the same three ports as a second layer.

Optional hardening, once Cloudflare proxies everything: allow 80/443 only
from Cloudflare's ranges (https://www.cloudflare.com/ips/), so nobody can
reach the origin directly.

## 3. Docker Engine (official repository)

```sh
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
```

Membership in the `docker` group is root-equivalent. Only `deploy` gets it.

## 4. Cloudflare DNS

1. Add two **A** records, `app` and `api`, both pointing to the VPS IPv4
   address. Turn the proxy on (orange cloud). Add AAAA records too if the VPS
   has IPv6.
2. Set **SSL/TLS → Overview** to **Full (strict)**. Caddy obtains real Let's
   Encrypt certificates through the DNS-01 challenge, so strict mode works
   from the first request.
3. Turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.
4. For staging on a temporary domain, do the same steps on that zone and use
   it in `APP_DOMAIN`/`API_DOMAIN`. Switching to the real domain later means
   changing those two variables, making a new Cloudflare token for the new
   zone, and running `up -d`. Caddy fetches the new certificates on its own.

## 5. Code and settings (as deploy)

```sh
sudo mkdir -p /opt/business-os && sudo chown deploy: /opt/business-os
git clone <repo-url> /opt/business-os/app
cp /opt/business-os/app/infra/docker/prod.env.example /opt/business-os/prod.env
chmod 600 /opt/business-os/prod.env
nano /opt/business-os/prod.env      # fill every placeholder; generate secrets here
```

Generate the secrets on the server, and copy them into your password manager
**before** the first start:

- `openssl rand -hex 24` for each password (hex keeps the DB URLs valid)
- `python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"`
  for `BOS_DATA_KEYS`

Only the age **public** keys go in `BACKUP_AGE_RECIPIENTS`.

## 6. Start

```sh
cd /opt/business-os/app
alias bos='docker compose -f infra/docker/docker-compose.prod.yml --env-file /opt/business-os/prod.env'
bos up -d --build
bos ps                      # all healthy; migrate "exited (0)"
bos logs migrate            # migrations, app_user password, credential backfill
curl -sI https://api.<domain>/health   # 200 + Strict-Transport-Security
```

The API refuses to start if a password is a default or the data key is
missing. Read `bos logs api` and fix `prod.env`.

## 7. Prove the backups before you take customers

```sh
bos exec backup bos-nightly                                   # first dump, by hand
bos exec postgres psql -U businessos -c "select * from pg_stat_archiver"   # archived_count > 0, failed_count 0
```

Then do the first restore drill from `infra/backup/README.md` **on another
machine**, and put the monthly drill in the calendar.

## Updating

```sh
cd /opt/business-os/app && git pull
bos up -d --build        # migrate runs first; the API starts only if it succeeds
```

Before any release that contains a migration, take a backup first with
`bos exec backup bos-nightly`.

## Hostinger snapshots are not the backup

A VPS snapshot is a useful complement for fast rollback of the whole machine
after a bad OS change, but it can't replace the off-site backups:

- It lives with the same provider and account as the server.
- It isn't encrypted with a key you hold.
- It can't restore to a point in time.
- An image of a running Postgres isn't guaranteed to be consistent.

The off-site, encrypted backups in R2 (`infra/backup/README.md`) are the
recovery plan.
