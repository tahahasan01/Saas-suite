# syntax=docker/dockerfile:1
# Caddy with the Cloudflare DNS module (gate I4). Behind Cloudflare's proxy,
# Let's Encrypt's HTTP/TLS challenges never reach the origin cleanly; the DNS
# challenge (a TXT record via a Cloudflare API token) always works.
#   docker build -f infra/caddy/Dockerfile -t business-os-caddy .
ARG CADDY_VERSION=2.10.2
FROM caddy:${CADDY_VERSION}-builder AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.1

FROM caddy:${CADDY_VERSION}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
RUN caddy fmt --diff /etc/caddy/Caddyfile >/dev/null || true
