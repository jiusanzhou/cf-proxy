# em-proxy — Vercel HKG serverless proxy

> ⚠️ **部署目标：Vercel HKG region**（不是 Cloudflare Workers）

给国内数据源 API 做无感代理。之前用 cf-proxy (`wuma-edge.pages.dev`) 被东方财富 520 封了，改走 Vercel HKG 区域稳定运行。

## 架构

```
reits-radar scripts
   ↓ proxy_get / proxy_post
https://em-proxy-amber.vercel.app/api/proxy?url=<target>
   ↓ Vercel HKG runtime
https://push2his.eastmoney.com/...
https://query.sse.com.cn/...
https://reits.szse.cn/...
```

## 支持域名

- `eastmoney.com` — 行情 K 线 API
- `sse.com.cn` — 上交所 REITs 公告
- `szse.cn` — 深交所 REITs 公告

每个域名走不同的 headers（Referer/Origin），见 `api/proxy.js`。

## 支持方法

- `GET` — `?url=<encoded-target>` 直接透传
- `POST` — 同上，body 透传到目标

## 部署

```sh
cd em
npx vercel --prod --yes --force
```

项目名：`em-proxy`（Vercel scope `zoes-projects-c377553e`）  
别名：`em-proxy-amber.vercel.app`  
Region：`hkg1`（Pro plan 才能多 region，用单区足够）

## 添加新域名

在 `api/proxy.js` 里：

1. 把域名加到 `allowed` 白名单
2. 在 headers 分支里加上对应 Referer/Origin
3. 重新 `npx vercel --prod --yes --force`

## 为什么不用 cf-proxy？

cf-proxy 根目录是 Cloudflare Pages Workers（WS 隧道 + HTTP proxy），跟这个用途不同：
- cf-proxy 出口是 CF IP，被东方财富封了
- em-proxy 出口是 Vercel HKG，稳定
- 两者共存一个 repo，但部署平台不同
