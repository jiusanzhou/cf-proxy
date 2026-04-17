# cf-proxy

Minimal Cloudflare Pages worker with WS tunnels behind a path + token gate.

## Highlights

- WebSocket tunnel requires **both** `WS_PATH` and `WS_TOKEN`; mismatched requests get a generic 404 (no `101 Switching Protocols`, no auth error).
- Panel lives at `ADMIN_PATH` (random, no "admin" string).
- Subscription feed at `SUB_PATH`, also gated by `?k=WS_TOKEN`.
- Root path returns a benign HTML home; no service fingerprints.
- HTTP proxy requires `AUTH_TOKEN` — refuses to act as open proxy otherwise.

## Deploy

1. Put real config in `wrangler.local.toml` (see template, gitignored).
2. `.dev.vars` holds local/dev secrets (gitignored).
3. Deploy with `npm run deploy`.

Secrets you should set on the live project:

| Name | Required | Notes |
|---|---|---|
| `UUID` | yes | UUIDv4, for channel A user id + channel B default password |
| `TROJAN_PASS` | no | separate channel B password |
| `ADMIN` | no | panel password, fallback to `UUID` |
| `AUTH_TOKEN` | yes (for HTTP proxy) | bearer token; without it HTTP proxy is disabled |
| `PROXY_IP` | no | upstream relay `host` or `host:port` |
| `WS_PATH` | yes | random WS entry path, e.g. `/_ab12cd34...` |
| `WS_TOKEN` | yes | random query token, used as `?k=<WS_TOKEN>` |
| `ADMIN_PATH` | no | panel entry, default `/_m` — **override it** |
| `SUB_PATH` | no | feed entry, default `/_c` — **override it** |
| `HOME_HTML` | no | custom root HTML |

`wrangler pages secret put <NAME> --project-name <project>` for each.

## Client config

Copy from the panel (`ADMIN_PATH`) after login. Both channels use:
- transport: ws, tls, sni = host
- path: `WS_PATH?k=WS_TOKEN` (feed/panel output includes it)

## HTTP proxy

```
GET https://<host>/?url=https://httpbin.org/get
Authorization: Bearer <AUTH_TOKEN>
```

or

```
GET https://<host>/https://httpbin.org/get
Authorization: Bearer <AUTH_TOKEN>
```
