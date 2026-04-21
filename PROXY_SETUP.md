# 中转服务快速使用

## 1) 启动中转

```bash
node proxy-server.js
```

默认地址：`http://localhost:8787`

## 2) 前端配置

在 `config.js` 里把：

```js
const PROXY_API_BASE_URL = ""
```

改为：

```js
const PROXY_API_BASE_URL = "http://localhost:8787"
```

## 3) 订单接口说明

`confirm/create/affirm` 可能依赖上游站点登录 Cookie。  
如果你要在中转里走完整下单，需要启动时带上环境变量：

```bash
set UPSTREAM_COOKIE=KSSID=你的值; lang=zh-cn
node proxy-server.js
```

（Windows PowerShell 可用 `$env:UPSTREAM_COOKIE="KSSID=...; lang=zh-cn"`）

## 4) Vercel 部署说明

本项目已提供 Vercel 路由文件：

- `api/goodslist.js`
- `api/order/confirm.js`
- `api/order/create.js`
- `api/order/affirm.js`

部署到 Vercel 后，可直接使用：

- `https://你的域名/api/goodslist`

如果要跑下单三步，请在 Vercel 项目环境变量里设置：

- `UPSTREAM_COOKIE=KSSID=...; lang=zh-cn`

若上游提示“手机签名异常”，再补充：

- `UPSTREAM_SIGN=抓包里的 Sign 值`
- `UPSTREAM_KSS_DEVICE=抓包里的 Kss-Device 值`

也可以在前端请求时临时传请求头：

- `x-upstream-sign`
- `x-upstream-kss-device`
