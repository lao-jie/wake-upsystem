const { getPool } = require('./db-api');
const { sendMail, mailConfigured } = require('./mail');

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || req.ip || '';
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function mysqlNow(offsetSec = 0) {
  const d = new Date(Date.now() + offsetSec * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function isQq(account) {
  return /^[1-9][0-9]{4,10}$/.test(String(account || '').trim());
}

function requireAdmin(body) {
  const id = String(body?.operatorId || body?.adminId || '').trim();
  if (id !== 'admin') {
    const err = new Error('仅管理员可操作');
    err.status = 403;
    throw err;
  }
}

async function ensureStaffExtraColumns(db) {
  const cols = [
    ['email', "varchar(128) DEFAULT ''"],
    ['invite_code', "varchar(32) DEFAULT ''"],
    ['register_ip', "varchar(64) DEFAULT ''"],
    ['created_at', 'datetime(3) NULL']
  ];
  for (const [name, def] of cols) {
    try {
      const [rows] = await db.query(`SHOW COLUMNS FROM staff_list LIKE ?`, [name]);
      if (!rows || rows.length === 0) {
        await db.query(`ALTER TABLE staff_list ADD COLUMN \`${name}\` ${def}`);
      }
    } catch (_) {
      /* ignore */
    }
  }
}

function mountAuthRoutes(app) {
  // 发送注册验证码（QQ邮箱）
  app.post('/api/auth/send-code', async (req, res) => {
    try {
      const db = getPool();
      if (!db) return res.status(500).json({ code: -1, msg: '数据库未配置' });
      if (!mailConfigured()) {
        return res.status(500).json({ code: -1, msg: '邮件未配置，请在服务器 .env 填写 SMTP_USER/SMTP_PASS' });
      }

      const account = String(req.body?.user || req.body?.account || '').trim();
      if (!account) return res.json({ code: -1, msg: '请先填写QQ账号' });
      if (!isQq(account)) return res.json({ code: -1, msg: '账号必须为QQ号' });

      const [exists] = await db.query('SELECT id FROM staff_list WHERE id = ? LIMIT 1', [account]);
      if (exists && exists.length) return res.json({ code: -1, msg: '该账号已存在' });

      const ip = clientIp(req);
      const [lastRows] = await db.query(
        'SELECT addtime FROM register_codes WHERE account = ? ORDER BY id DESC LIMIT 1',
        [account]
      );
      if (lastRows?.[0]?.addtime) {
        const lastTs = new Date(lastRows[0].addtime).getTime();
        const wait = 60 - Math.floor((Date.now() - lastTs) / 1000);
        if (wait > 0) {
          return res.json({ code: -1, msg: `发送太频繁，请${wait}秒后再试`, wait });
        }
      }

      const dayStart = todayStart();
      const [ipCntRows] = await db.query(
        'SELECT COUNT(*) AS c FROM register_codes WHERE ip = ? AND addtime > ?',
        [ip, dayStart]
      );
      if (Number(ipCntRows?.[0]?.c || 0) >= 20) {
        return res.json({ code: -1, msg: '今日发送次数过多，请明天再试' });
      }
      const [qqCntRows] = await db.query(
        'SELECT COUNT(*) AS c FROM register_codes WHERE account = ? AND addtime > ?',
        [account, dayStart]
      );
      if (Number(qqCntRows?.[0]?.c || 0) >= 10) {
        return res.json({ code: -1, msg: '该QQ今日验证码次数已达上限' });
      }

      const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
      const now = mysqlNow();
      const expire = mysqlNow(600);
      const to = `${account}@qq.com`;
      const site = process.env.MAIL_FROM_NAME || '老街网创';
      const html = `<div style="font-family:Microsoft YaHei,Arial,sans-serif;padding:20px;line-height:1.8">
        <p>您正在注册 <b>${site}</b> 员工账号。</p>
        <p>验证码：<b style="font-size:22px;color:#3b82f6;letter-spacing:4px">${code}</b></p>
        <p>10分钟内有效，请勿泄露给他人。如非本人操作请忽略本邮件。</p>
      </div>`;

      try {
        await sendMail({ to, subject: `【${site}】注册验证码`, html });
      } catch (e) {
        await db.query(
          'INSERT INTO register_codes (account, code, ip, addtime, expire, used, fails) VALUES (?,?,?,?,?,?,?)',
          [account, '', ip, now, now, 1, 0]
        );
        return res.json({
          code: -1,
          msg: '验证码发送失败，请确认该QQ已开通QQ邮箱后重试' + (e.message ? `（${e.message}）` : ''),
          wait: 60
        });
      }

      await db.query('UPDATE register_codes SET used = 1 WHERE account = ? AND used = 0', [account]);
      await db.query(
        'INSERT INTO register_codes (account, code, ip, addtime, expire, used, fails) VALUES (?,?,?,?,?,?,?)',
        [account, code, ip, now, expire, 0, 0]
      );
      return res.json({ code: 1, msg: `验证码已发送到 ${to}，请查收QQ邮箱`, wait: 60 });
    } catch (e) {
      console.error('send-code error:', e);
      return res.status(500).json({ code: -1, msg: e.message || '发送失败' });
    }
  });

  // 邀请码注册
  app.post('/api/auth/register', async (req, res) => {
    try {
      const db = getPool();
      if (!db) return res.status(500).json({ code: -1, msg: '数据库未配置' });
      await ensureStaffExtraColumns(db);

      const name = String(req.body?.name || '').trim();
      const user = String(req.body?.user || '').trim();
      const pass = String(req.body?.pass || '').trim();
      const yqm = String(req.body?.yqm || req.body?.inviteCode || '').trim();
      const vcode = String(req.body?.code || '').trim();

      if (!name || !user || !pass || !yqm || !vcode) {
        return res.json({ code: -1, msg: '所有项目不能为空' });
      }
      if (!isQq(user)) return res.json({ code: -1, msg: '账号必须为QQ号' });
      if (!/^[0-9]{6}$/.test(vcode)) return res.json({ code: -1, msg: '请输入6位验证码' });
      if (pass.length < 6) return res.json({ code: -1, msg: '密码最少为6位数' });
      if (name.length > 32) return res.json({ code: -1, msg: '昵称过长' });

      const [codeRows] = await db.query(
        "SELECT id, code, expire, used, fails FROM register_codes WHERE account = ? AND used = 0 AND code <> '' ORDER BY id DESC LIMIT 1",
        [user]
      );
      const codeRow = codeRows?.[0];
      if (!codeRow) return res.json({ code: -1, msg: '请先获取验证码' });
      if (new Date(codeRow.expire).getTime() < Date.now()) {
        await db.query('UPDATE register_codes SET used = 1 WHERE id = ?', [codeRow.id]);
        return res.json({ code: -1, msg: '验证码已过期，请重新获取' });
      }
      if (String(codeRow.code) !== String(vcode)) {
        const fails = Number(codeRow.fails || 0) + 1;
        if (fails >= 5) {
          await db.query('UPDATE register_codes SET used = 1, fails = ? WHERE id = ?', [fails, codeRow.id]);
          return res.json({ code: -1, msg: '验证码错误次数过多，请重新获取' });
        }
        await db.query('UPDATE register_codes SET fails = ? WHERE id = ?', [fails, codeRow.id]);
        return res.json({ code: -1, msg: '验证码错误' });
      }

      const [existsUser] = await db.query('SELECT id FROM staff_list WHERE id = ? LIMIT 1', [user]);
      if (existsUser?.length) return res.json({ code: -1, msg: '该账号已存在' });
      const [existsName] = await db.query('SELECT id FROM staff_list WHERE name = ? LIMIT 1', [name]);
      if (existsName?.length) return res.json({ code: -1, msg: '该昵称已存在' });

      const [invRows] = await db.query(
        'SELECT code, enabled, max_uses, used_count FROM invite_codes WHERE code = ? LIMIT 1',
        [yqm]
      );
      const inv = invRows?.[0];
      if (!inv) return res.json({ code: -1, msg: '邀请码不存在' });
      if (!inv.enabled) return res.json({ code: -1, msg: '邀请码已停用' });
      const maxUses = Number(inv.max_uses || 0);
      const usedCount = Number(inv.used_count || 0);
      if (maxUses > 0 && usedCount >= maxUses) {
        return res.json({ code: -1, msg: '邀请码已达使用上限' });
      }

      const ip = clientIp(req);
      if (String(process.env.REG_IP_LIMIT || '1') === '1') {
        const dayStart = todayStart();
        const [ipReg] = await db.query(
          'SELECT COUNT(*) AS c FROM staff_list WHERE register_ip = ? AND created_at > ?',
          [ip, dayStart]
        );
        if (Number(ipReg?.[0]?.c || 0) >= 1) {
          return res.json({ code: -1, msg: '同一个IP同一天最多只能注册1次' });
        }
      }

      const now = mysqlNow();
      await db.query(
        `INSERT INTO staff_list (id, name, password, salary, phone, salarymethod, salaryaccount, email, invite_code, register_ip, created_at)
         VALUES (?, ?, ?, 0, '', 'alipay', '', ?, ?, ?, ?)`,
        [user, name, pass, `${user}@qq.com`, yqm, ip, now]
      );
      await db.query('UPDATE register_codes SET used = 1 WHERE id = ?', [codeRow.id]);
      await db.query('UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?', [yqm]);

      return res.json({ code: 1, msg: '注册成功！请使用QQ号登录' });
    } catch (e) {
      console.error('register error:', e);
      return res.status(500).json({ code: -1, msg: e.message || '注册失败' });
    }
  });

  // 管理员：邀请码列表
  app.post('/api/invite/list', async (req, res) => {
    try {
      requireAdmin(req.body);
      const db = getPool();
      if (!db) return res.status(500).json({ code: -1, msg: '数据库未配置' });
      const [rows] = await db.query(
        'SELECT code, note, enabled, max_uses, used_count, created_by, created_at FROM invite_codes ORDER BY created_at DESC'
      );
      return res.json({ code: 1, data: rows || [] });
    } catch (e) {
      return res.status(e.status || 500).json({ code: -1, msg: e.message || '读取失败' });
    }
  });

  // 管理员：创建邀请码
  app.post('/api/invite/create', async (req, res) => {
    try {
      requireAdmin(req.body);
      const db = getPool();
      if (!db) return res.status(500).json({ code: -1, msg: '数据库未配置' });
      let code = String(req.body?.code || '').trim();
      if (!code) {
        code = String(Math.floor(100000 + Math.random() * 900000));
      }
      if (code.length < 4) return res.json({ code: -1, msg: '邀请码最少4位' });
      if (!/^[A-Za-z0-9]+$/.test(code)) return res.json({ code: -1, msg: '邀请码仅支持字母数字' });
      const note = String(req.body?.note || '').trim();
      const maxUses = Math.max(0, parseInt(req.body?.maxUses || '0', 10) || 0);
      const [dup] = await db.query('SELECT code FROM invite_codes WHERE code = ? LIMIT 1', [code]);
      if (dup?.length) return res.json({ code: -1, msg: '邀请码已存在' });
      await db.query(
        'INSERT INTO invite_codes (code, note, enabled, max_uses, used_count, created_by, created_at) VALUES (?,?,1,?,0,?,?)',
        [code, note, maxUses, 'admin', mysqlNow()]
      );
      return res.json({ code: 1, msg: '创建成功', data: { code } });
    } catch (e) {
      return res.status(e.status || 500).json({ code: -1, msg: e.message || '创建失败' });
    }
  });

  // 管理员：启用/停用
  app.post('/api/invite/toggle', async (req, res) => {
    try {
      requireAdmin(req.body);
      const db = getPool();
      if (!db) return res.status(500).json({ code: -1, msg: '数据库未配置' });
      const code = String(req.body?.code || '').trim();
      const enabled = req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1;
      if (!code) return res.json({ code: -1, msg: '缺少邀请码' });
      await db.query('UPDATE invite_codes SET enabled = ? WHERE code = ?', [enabled, code]);
      return res.json({ code: 1, msg: enabled ? '已启用' : '已停用' });
    } catch (e) {
      return res.status(e.status || 500).json({ code: -1, msg: e.message || '操作失败' });
    }
  });
}

module.exports = { mountAuthRoutes };
