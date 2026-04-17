# cf-proxy

Cloudflare Worker 三模代理 — HTTP 反向代理 + VLESS 隧道 + Trojan 隧道。

## 功能

### HTTP 反向代理
```
https://cf-proxy.wuma.workers.dev/https://httpbin.org/get
https://cf-proxy.wuma.workers.dev/?url=https://httpbin.org/get
```

### VLESS over WebSocket
### Trojan over WebSocket

协议自动检测：同一个 WS 端点，首包匹配 Trojan SHA224 哈希 → Trojan，否则 → VLESS。

## 部署

```bash
npm install

# 设置 UUID (VLESS 用户验证 + Trojan 默认密码)
npx wrangler secret put UUID

# 可选：设置独立的 Trojan 密码（默认复用 UUID）
npx wrangler secret put TROJAN_PASS

npx wrangler deploy
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `UUID` | 隧道必填 | UUIDv4 格式，VLESS 认证 + Trojan 默认密码 |
| `TROJAN_PASS` | 否 | 独立 Trojan 密码（默认复用 UUID） |
| `AUTH_TOKEN` | 否 | HTTP 代理 Bearer token 鉴权 |
| `PROXY_IP` | 否 | ProxyIP 中转 |

## 客户端配置

### VLESS
```
协议: vless
地址: cf-proxy.wuma.workers.dev
端口: 443
UUID: <你的 UUID>
传输: ws
TLS: tls
Path: /
```

### Trojan
```
协议: trojan
地址: cf-proxy.wuma.workers.dev
端口: 443
密码: <你的 UUID 或 TROJAN_PASS>
传输: ws
TLS: tls
Path: /
```

## 原理

- HTTP 代理：Worker `fetch()` 转发
- VLESS/Trojan：WebSocket 入站 → 首包协议自动检测 → `cloudflare:sockets` TCP 出站 → 双向 pipe
- Trojan 认证：密码 SHA224 hex 比对（56 bytes + CRLF）
