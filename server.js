require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const port = 3001;

app.use(express.json());
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

// AI批量识别接口
app.post('/api/parse-orders', async (req, res) => {
  try {
    const { text } = req.body;
    const response = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: 'glm-4-flash',
        messages: [
          {
            role: 'system',
            content: `你是一个叫醒订单识别助手。从文本里提取每一条订单，输出严格JSON数组，不要其他任何内容。每条必须包含：- phone: 11位手机号 - wakeTime: 时间，格式如 07:20 - note: 备注，没有填空`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AI_API_KEY}`
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('AI API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});