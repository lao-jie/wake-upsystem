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
