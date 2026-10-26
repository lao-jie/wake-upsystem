// 兼容原 Supabase 调用写法，实际请求本机宝塔 MySQL（/api/db）
(function (global) {
  function createBaotaDbClient() {
    function from(table) {
      return new QueryBuilder(table);
    }
    return { from };
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this._op = null;
      this._select = '*';
      this._data = null;
      this._filters = [];
      this._order = null;
      this._onConflict = null;
      this._single = false;
      this._maybeSingle = false;
      this._selectAfter = false;
    }

    select(cols) {
      this._select = cols == null ? '*' : cols;
      if (!this._op) this._op = 'select';
      if (this._op === 'update') this._selectAfter = true;
      return this;
    }

    insert(data) {
      this._op = 'insert';
      this._data = data;
      return this;
    }

    upsert(data, opts) {
      this._op = 'upsert';
      this._data = data;
      this._onConflict = opts && opts.onConflict ? opts.onConflict : null;
      return this;
    }

    update(data) {
      this._op = 'update';
      this._data = data;
      return this;
    }

    delete() {
      this._op = 'delete';
      return this;
    }

    eq(col, val) {
      this._filters.push({ type: 'eq', col, val });
      return this;
    }

    in(col, vals) {
      this._filters.push({ type: 'in', col, val: vals });
      return this;
    }

    order(col, opts) {
      this._order = { col, ascending: !(opts && opts.ascending === false) };
      return this;
    }

    single() {
      this._single = true;
      return this;
    }

    maybeSingle() {
      this._maybeSingle = true;
      return this;
    }

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }

    async _execute() {
      try {
        const payload = {
          table: this.table,
          op: this._op || 'select',
          select: this._select,
          data: this._data,
          filters: this._filters,
          order: this._order,
          onConflict: this._onConflict,
          single: this._single,
          maybeSingle: this._maybeSingle,
          selectAfter: this._selectAfter
        };
        const res = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            data: null,
            error: { message: json.error || json.message || ('HTTP ' + res.status) }
          };
        }
        return {
          data: json.data !== undefined ? json.data : null,
          error: json.error || null
        };
      } catch (e) {
        return { data: null, error: { message: e.message || String(e) } };
      }
    }
  }

  global.createBaotaDbClient = createBaotaDbClient;
  // 伪装成 supabase UMD，便于旧代码/旧 HTML 兼容
  global.supabase = {
    createClient: function () {
      return createBaotaDbClient();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
