require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { runDbAction, dbConfigured } = require('./db-api');
const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('.'));

// CORS中间件
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

// 通用智谱转发（解决浏览器 CORS）
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

// AI批量识别接口（叫醒订单）
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
- phone: 字符串，11 位中国大陆手机号，仅数字（去掉空格、短横线、+86 等后剩下的 11 位）。
- wakeTime: 可选，单个叫醒时刻，必须是 24 小时制字符串 HH:mm（如 07:20、09:05）。
- wakeTimes: 可选，字符串数组；同一行同一号码有多个叫醒点时，把所有点都放进这里，每项均为 HH:mm。
- wakeDate: 可选，字符串 YYYY-MM-DD；仅当原文明确「明天/后天/大后天/具体日期」对应叫醒日时才填，否则不要填（系统会用当天）。
- note: 字符串，除电话与时间外的提醒内容；没有则 ""。

【识别规则】
1. 一行里只有一个号码、多个时间（如「13900001111 7:00 7:20 7:40」「10点 10点20 10点40 189xxx」），只输出 1 个对象，多个时刻全部进 wakeTimes，不要拆成多个对象。
2. 原文换行后再次出现同一号码，视为另一批订单，单独输出对象（各自时间与备注）。
3. 若同时有 wakeTime 与 wakeTimes，合并所有时刻并去重，不要丢 wakeTime。
4. 电话与时间顺序可互换；可带圆圈序号①、破折号、逗号、中文逗号，一律忽略。
5. 中文时间必须换算为 HH:mm：早上七点半→07:30、早9点30/早9:30→09:30、上午8点→08:00、中午12点→12:00、下午2点→14:00、下午2点半→14:30、晚上8点15→20:15、今晚9点→21:00、零点/凌晨0点30→00:30、凌晨3点→03:00、8點整→08:00。
6. 「明天早上7点」：wakeDate 用明天日期，wakeTime 用 07:00；只有「明天」没有钟点则不要臆造时间。
7. 备注里若包含与叫醒无关的长说明，保留简短可执行信息即可；不要把手机号写进 note。

【输出示例 1】
输入一行：18953772567 10点 10点20 10点40
输出：[{"phone":"18953772567","wakeTimes":["10:00","10:20","10:40"],"note":""}]

【输出示例 2】
输入：今天9:45，17371992416
输出：[{"phone":"17371992416","wakeTime":"09:45","note":""}]

【输出示例 3】
输入两行同一号码不同时间：
18900001111 7:00 第一条
18900001111 8:30 第二条
输出：[{"phone":"18900001111","wakeTime":"07:00","note":"第一条"},{"phone":"18900001111","wakeTime":"08:30","note":"第二条"}]`
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

// 宝塔 MySQL 统一数据接口（前端 db-client.js 调用）
app.post('/api/db', async (req, res) => {
  try {
    const result = await runDbAction(req.body || {});
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    const message = error.sqlMessage || error.message || '数据库请求失败';
    console.error('DB API error:', message, error.code || '');
    res.status(status).json({ data: null, error: { message: String(message) } });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: dbConfigured() });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(dbConfigured() ? 'MySQL: configured' : 'MySQL: NOT configured (check .env DB_*)');
});