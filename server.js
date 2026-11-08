require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { runDbAction, dbConfigured, ensureSchema } = require('./db-api');
const { mountAuthRoutes } = require('./auth-api');
const { mailConfigured } = require('./mail');
const app = express();
const port = process.env.PORT || 3001;

const UPLOADS_ROOT = path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
} catch (_) { /* ignore */ }

app.use(express.json({ limit: '20mb' }));

// CORS（API 前）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

async function callZhipuChat(payload) {
  if (!process.env.AI_API_KEY) {
    const err = new Error('AI_API_KEY 未配置，请在项目根目录创建 .env');
    err.status = 500;
    throw err;
  }
  const response = await axios.post(
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_API_KEY}`
      },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );
  return response.data;
}

// ========== API 路由必须在 static 之前 ==========

app.post('/api/ai-chat', async (req, res) => {
  try {
    const data = await callZhipuChat(req.body || {});
    res.json(data);
  } catch (error) {
    const status = error.response?.status || error.status || 500;
    const data = error.response?.data;
    console.error('AI API error:', data || error.message);
    if (data && typeof data === 'object') {
      return res.status(status).json(data);
    }
    res.status(status).json({ error: error.message || 'AI 请求失败' });
  }
});

app.post('/api/parse-orders', async (req, res) => {
  try {
    const { text } = req.body;
    const data = await callZhipuChat({
      model: 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: `你是叫醒订单识别助手。用户粘贴微信群/表格/备忘录里的多行文本，你要只提取「叫醒订单」，忽略无关闲聊、广告、空行。

【输出要求】
- 仅输出一个 JSON 数组，不要 markdown、不要代码块、不要解释、不要注释。
- 每个元素表示「同一行或同一条连续文案里、同一个手机号」的一批叫醒；字段均为合法 JSON。

【字段】
- phone: 字符串。11 位手机号（仅数字，去空格/短横线/+86）；也必须识别虚拟号/隐私号/中间号（162/165/167/170/171 等），带分机写成「11位号转分机」如 17012345678转1234。
- wakeTime: 可选，单个叫醒时刻，必须是 24 小时制字符串 HH:mm（如 07:20、09:05）。
- wakeTimes: 可选，字符串数组；同一行同一号码有多个叫醒点时，把所有点都放进这里，每项均为 HH:mm。
- wakeDate: 可选，字符串 YYYY-MM-DD；仅当原文明确「明天/后天/大后天/具体日期」对应叫醒日时才填，否则不要填（系统会用当天）。
- note: 字符串，除电话与时间外的提醒内容；没有则 ""。

【识别规则】
1. 一行里只有一个号码、多个时间，只输出 1 个对象，多个时刻全部进 wakeTimes。
2. 原文换行后再次出现同一号码，视为另一批订单。
3. 中文时间必须换算为 HH:mm。
4. 标注「虚拟号/隐私号」的号码不要跳过。`
        },
        {
          role: 'user',
          content:
            '以下为待识别文本。只提取其中的叫醒订单，忽略闲聊与无关内容；输出必须是 JSON 数组。\n\n<<<ORDER_TEXT\n' +
            (text || '') +
            '\nORDER_TEXT>>>'
        }
      ],
      temperature: 0.05,
      top_p: 0.75,
      max_tokens: 8192
    });
    res.json(data);
  } catch (error) {
    console.error('AI API error:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

mountAuthRoutes(app);

/** 上传监督截图/请假图 */
app.post('/api/upload-image', (req, res) => {
  try {
    const { dataUrl, kind } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: '缺少图片 dataUrl' });
    }
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!m) {
      return res.status(400).json({ error: '图片格式无效，请重新选择' });
    }
    const mime = String(m[1] || '').toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buf = Buffer.from(String(m[2]).replace(/\s+/g, ''), 'base64');
    if (!buf.length) {
      return res.status(400).json({ error: '图片内容为空' });
    }
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '图片过大（超过 10MB）' });
    }
    const safeKind = String(kind || 'supervise')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32) || 'supervise';
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(UPLOADS_ROOT, safeKind, day);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    const url = `/uploads/${safeKind}/${day}/${name}`;
    res.json({ ok: true, url });
  } catch (error) {
    console.error('upload-image error:', error.message || error);
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

app.post('/api/db', async (req, res) => {
  try {
    const result = await runDbAction(req.body || {});
    res.json(result);
  } catch (error) {
    if (error && (error.errno === 1062 || error.code === 'ER_DUP_ENTRY')) {
      return res.status(200).json({
        data: null,
        error: {
          message: String(error.sqlMessage || error.message || 'Duplicate entry'),
          code: '23505'
        }
      });
    }
    const status = error.status || 500;
    const message = error.sqlMessage || error.message || '数据库请求失败';
    console.error('DB API error:', message, error.code || '');
    res.status(status).json({
      data: null,
      error: { message: String(message), code: error.code || error.errno || undefined }
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: dbConfigured(),
    mail: mailConfigured(),
    upload: true,
    uploadDir: UPLOADS_ROOT
  });
});

// 静态资源放最后，避免挡住 /api/*
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use(express.static('.'));

async function start() {
  console.log(`Server starting on port ${port}`);
  console.log(dbConfigured() ? 'MySQL: configured' : 'MySQL: NOT configured (check .env DB_*)');
  console.log(mailConfigured() ? 'Mail: configured' : 'Mail: NOT configured (SMTP_USER/SMTP_PASS)');
  console.log('Upload API: POST /api/upload-image →', UPLOADS_ROOT);
  if (dbConfigured()) {
    try {
      const schema = await ensureSchema();
      if (schema?.changes?.length) {
        console.log('MySQL schema ensured:', schema.changes.join(', '));
      } else {
        console.log('MySQL schema: ok');
      }
    } catch (e) {
      console.error('MySQL schema ensure failed:', e.sqlMessage || e.message || e);
    }
  }
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('db-api: datetime-normalize v2 + schema-ensure + upload-image');
  });
}

start();
