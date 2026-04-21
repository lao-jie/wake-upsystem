const UPSTREAM_BASE = 'http://jie.ykw100.cn'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

module.exports = async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Method Not Allowed' })
  }

  try {
    const body = req.body || {}
    const form = new URLSearchParams({
      index: String(body.index ?? 4),
      cid: String(body.cid ?? 1460),
      cpid: String(body.cpid ?? 1435),
      page: String(body.page ?? 1),
      limit: String(body.limit ?? 10)
    })

    const response = await fetch(`${UPSTREAM_BASE}/uni/goodslist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8'
    res.setHeader('Content-Type', contentType)
    return res.status(response.status).send(text)
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message })
  }
}
