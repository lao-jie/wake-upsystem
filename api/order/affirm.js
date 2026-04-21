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
    const cookie = process.env.UPSTREAM_COOKIE || ''
    const response = await fetch(`${UPSTREAM_BASE}/front/order/affirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(req.body || {})
    })
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8'
    res.setHeader('Content-Type', contentType)
    return res.status(response.status).send(text)
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message })
  }
}
