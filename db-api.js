const mysql = require('mysql2/promise');

const ALLOWED_TABLES = new Set([
  'staff_list',
  'wake_orders',
  'supervise_orders',
  'salary_details',
  'price_strategy',
  'supervise_leave_requests',
  'home_pending_items',
  'page_notices'
]);

const JSON_COLUMNS = {
  price_strategy: new Set(['data']),
  home_pending_items: new Set(['payload'])
};

const BOOL_COLUMNS = {
  wake_orders: new Set(['salarysettled']),
  supervise_orders: new Set(['salarysettled']),
  supervise_leave_requests: new Set(['leave_enabled']),
  home_pending_items: new Set(['done'])
};

const DATETIME_COLUMNS = {
  wake_orders: new Set(['submittime', 'wake_staff_since']),
  supervise_orders: new Set(['submittime']),
  salary_details: new Set(['createdat']),
  price_strategy: new Set(['updated_at']),
  supervise_leave_requests: new Set(['updated_at']),
  home_pending_items: new Set(['created_at', 'processed_at']),
  page_notices: new Set(['updatedat'])
};

function toMysqlDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // 只用到秒，兼容 DATETIME / DATETIME(3)
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const s = String(value).trim();
  if (!s) return null;
  // 2026-10-26T11:19:01.321Z / 2026-10-26 11:19:01 → 2026-10-26 11:19:01
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  const m2 = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})$/);
  if (m2) return `${m2[1]} ${m2[2]}:00`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

let pool = null;

function getPool() {
  if (pool) return pool;
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME;
  if (!user || !database) {
    return null;
  }
  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: false,
    timezone: 'Z',
    // 强制连接层 UTF-8，避免中文读写乱码
    typeCast: undefined
  });
  pool.on('connection', (conn) => {
    conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
  });
  return pool;
}

function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) {
    const err = new Error('不允许访问的表: ' + table);
    err.status = 400;
    throw err;
  }
}

function quoteId(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw Object.assign(new Error('非法字段名: ' + name), { status: 400 });
  }
  return '`' + name + '`';
}

function normalizeCell(table, key, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  // 空 settle_key 存 NULL，避免唯一索引冲突
  if (key === 'settle_key' && String(value).trim() === '') return null;
  // 监督订单 id 统一字符串
  if (table === 'supervise_orders' && key === 'id') return String(value);
  const dtCols = DATETIME_COLUMNS[table];
  if (dtCols && dtCols.has(key)) return toMysqlDateTime(value);
  // 任意 ISO 时间字符串都转成 MySQL 格式，避免漏配字段
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return toMysqlDateTime(value);
  }
  const jsonCols = JSON_COLUMNS[table];
  if (jsonCols && jsonCols.has(key)) {
    if (typeof value === 'string') return value;
    return JSON.stringify(value ?? {});
  }
  const boolCols = BOOL_COLUMNS[table];
  if (boolCols && boolCols.has(key)) {
    return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
  }
  if (value instanceof Date) return toMysqlDateTime(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function normalizeRowOut(table, row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  const jsonCols = JSON_COLUMNS[table];
  if (jsonCols) {
    for (const key of jsonCols) {
      if (!(key in out)) continue;
      if (typeof out[key] === 'string') {
        try {
          out[key] = JSON.parse(out[key]);
        } catch (_) {
          /* keep string */
        }
      }
    }
  }
  const boolCols = BOOL_COLUMNS[table];
  if (boolCols) {
    for (const key of boolCols) {
      if (key in out) out[key] = out[key] === 1 || out[key] === true || out[key] === '1';
    }
  }
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (v instanceof Date) out[key] = v.toISOString();
    else if (typeof v === 'bigint') out[key] = Number(v);
    else if (v && typeof v === 'object' && Buffer.isBuffer(v)) out[key] = v.toString('utf8');
  }
  return out;
}

function buildWhere(filters = []) {
  const clauses = [];
  const params = [];
  for (const f of filters) {
    const col = quoteId(f.col);
    if (f.type === 'eq') {
      clauses.push(`${col} = ?`);
      params.push(f.val);
    } else if (f.type === 'in') {
      const arr = Array.isArray(f.val) ? f.val : [];
      if (arr.length === 0) {
        clauses.push('1=0');
      } else {
        clauses.push(`${col} IN (${arr.map(() => '?').join(',')})`);
        params.push(...arr);
      }
    } else {
      throw Object.assign(new Error('不支持的过滤: ' + f.type), { status: 400 });
    }
  }
  const sql = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  return { sql, params };
}

function parseSelectCols(selectCols) {
  if (!selectCols || selectCols === '*') return '*';
  return String(selectCols)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(quoteId)
    .join(', ');
}

async function runDbAction(body) {
  const db = getPool();
  if (!db) {
    const err = new Error('数据库未配置：请在 .env 填写 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME');
    err.status = 500;
    throw err;
  }

  const table = String(body.table || '').trim();
  assertTable(table);
  const op = String(body.op || '').trim();
  const filters = Array.isArray(body.filters) ? body.filters : [];
  const { sql: whereSql, params: whereParams } = buildWhere(filters);

  if (op === 'select') {
    let sql = `SELECT ${parseSelectCols(body.select)} FROM ${quoteId(table)}${whereSql}`;
    const params = [...whereParams];
    if (body.order && body.order.col) {
      sql += ` ORDER BY ${quoteId(body.order.col)} ${body.order.ascending === false ? 'DESC' : 'ASC'}`;
    }
    const [rows] = await db.query(sql, params);
    let data = (rows || []).map((r) => normalizeRowOut(table, r));
    if (body.single || body.maybeSingle) {
      if (data.length === 0) {
        if (body.single) {
          return { data: null, error: { message: '未找到数据', code: 'PGRST116' } };
        }
        return { data: null, error: null };
      }
      return { data: data[0], error: null };
    }
    return { data, error: null };
  }

  if (op === 'insert') {
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    if (!rows.length || !rows[0]) {
      return { data: null, error: { message: 'insert 数据为空' } };
    }
    const keys = Object.keys(rows[0]).filter((k) => rows[0][k] !== undefined);
    const cols = keys.map(quoteId).join(',');
    const placeholders = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
    const params = [];
    for (const row of rows) {
      for (const k of keys) params.push(normalizeCell(table, k, row[k]));
    }
    await db.query(`INSERT INTO ${quoteId(table)} (${cols}) VALUES ${placeholders}`, params);
    return { data: rows.map((r) => normalizeRowOut(table, r)), error: null };
  }

  if (op === 'upsert') {
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    if (!rows.length || !rows[0]) {
      return { data: null, error: { message: 'upsert 数据为空' } };
    }
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {}).filter((k) => r[k] !== undefined)))];
    if (!keys.length) {
      return { data: null, error: { message: 'upsert 无有效字段' } };
    }
    const cols = keys.map(quoteId).join(',');
    const placeholders = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
    const params = [];
    for (const row of rows) {
      for (const k of keys) params.push(normalizeCell(table, k, row[k]));
    }
    const updates = keys.map((k) => `${quoteId(k)}=VALUES(${quoteId(k)})`).join(',');
    await db.query(
      `INSERT INTO ${quoteId(table)} (${cols}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
      params
    );
    return { data: rows.map((r) => normalizeRowOut(table, r)), error: null };
  }

  if (op === 'update') {
    const patch = body.data || {};
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    if (!keys.length) {
      return { data: null, error: { message: 'update 数据为空' } };
    }
    const sets = keys.map((k) => `${quoteId(k)} = ?`).join(', ');
    const params = keys.map((k) => normalizeCell(table, k, patch[k]));
    const [result] = await db.query(
      `UPDATE ${quoteId(table)} SET ${sets}${whereSql}`,
      [...params, ...whereParams]
    );
    if (body.selectAfter) {
      const [rows] = await db.query(
        `SELECT ${parseSelectCols(body.select || '*')} FROM ${quoteId(table)}${whereSql}`,
        whereParams
      );
      return { data: (rows || []).map((r) => normalizeRowOut(table, r)), error: null };
    }
    return { data: null, error: null, count: result?.affectedRows || 0 };
  }

  if (op === 'delete') {
    await db.query(`DELETE FROM ${quoteId(table)}${whereSql}`, whereParams);
    return { data: null, error: null };
  }

  const err = new Error('不支持的操作: ' + op);
  err.status = 400;
  throw err;
}

function dbConfigured() {
  return Boolean(process.env.DB_USER && process.env.DB_NAME);
}

module.exports = { runDbAction, dbConfigured, getPool };
