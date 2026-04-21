const http = require('http')

const PORT = process.env.PORT || 8787
const UPSTREAM_BASE = 'http://jie.ykw100.cn'
const UPSTREAM_COOKIE = process.env.UPSTREAM_COOKIE || ''

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
      if (data.length > 1024 * 1024) {
        reject(new Error('Body too large'))
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function toObject(raw, contentType) {
  if (!raw) return {}
  if ((contentType || '').includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw)
    return Object.fromEntries(params.entries())
  }
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function forward(url, method, headers, body) {
  const resp = await fetch(url, { method, headers, body })
  const text = await resp.text()
  return {
    status: resp.status,
    contentType: resp.headers.get('content-type') || 'application/json; charset=utf-8',
    text
  }
}

http.createServer(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    const raw = await readBody(req)
    const body = toObject(raw, req.headers['content-type'])

    if (req.url === '/api/goodslist' && req.method === 'POST') {
      const form = new URLSearchParams({
        index: String(body.index ?? 4),
        cid: String(body.cid ?? 1460),
        cpid: String(body.cpid ?? 1435),
        page: String(body.page ?? 1),
        limit: String(body.limit ?? 10)
      })
      const result = await forward(`${UPSTREAM_BASE}/uni/goodslist`, 'POST', {
        'Content-Type': 'application/x-www-form-urlencoded'
      }, form.toString())
      res.writeHead(result.status, { 'Content-Type': result.contentType })
      res.end(result.text)
      return
    }

    if (req.url === '/api/order/confirm' && req.method === 'POST') {
      const result = await forward(`${UPSTREAM_BASE}/front/order/confirm`, 'POST', {
        'Content-Type': 'application/json',
        ...(UPSTREAM_COOKIE ? { Cookie: UPSTREAM_COOKIE } : {})
      }, JSON.stringify(body))
      res.writeHead(result.status, { 'Content-Type': result.contentType })
      res.end(result.text)
      return
    }

    if (req.url === '/api/order/create' && req.method === 'POST') {
      const result = await forward(`${UPSTREAM_BASE}/front/order/create`, 'POST', {
        'Content-Type': 'application/json',
        ...(UPSTREAM_COOKIE ? { Cookie: UPSTREAM_COOKIE } : {})
      }, JSON.stringify(body))
      res.writeHead(result.status, { 'Content-Type': result.contentType })
      res.end(result.text)
      return
    }

    if (req.url === '/api/order/affirm' && req.method === 'POST') {
      const result = await forward(`${UPSTREAM_BASE}/front/order/affirm`, 'POST', {
        'Content-Type': 'application/json',
        ...(UPSTREAM_COOKIE ? { Cookie: UPSTREAM_COOKIE } : {})
      }, JSON.stringify(body))
      res.writeHead(result.status, { 'Content-Type': result.contentType })
      res.end(result.text)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 404, msg: 'Not Found' }))
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 500, msg: error.message }))
  }
}).listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
})
