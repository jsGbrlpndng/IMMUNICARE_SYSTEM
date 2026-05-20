const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'immunicare',
  port: Number(process.env.PG_PORT || 5432),
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)
});

const isSelectLike = (sql) => {
  const normalized = sql.trim().toUpperCase();
  return normalized.startsWith('SELECT') ||
    normalized.startsWith('WITH') ||
    normalized.startsWith('SHOW') ||
    normalized.startsWith('EXPLAIN');
};

const translatePlaceholders = (sql, params = []) => {
  if (!Array.isArray(params)) {
    return { sql, params: [] };
  }

  if (sql.toLowerCase().includes('values ?') && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
    const rows = params[0];
    const values = [];
    const placeholders = rows.map((row) => {
      const rowPlaceholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    }).join(', ');

    return {
      sql: sql.replace(/values\s+\?/i, `VALUES ${placeholders}`),
      params: values
    };
  }

  let index = 0;
  const translated = sql.replace(/\?/g, () => `$${++index}`);
  return { sql: translated, params };
};

const formatResult = (sql, result) => {
  if (isSelectLike(sql)) {
    return [result.rows, result.fields];
  }

  return [{
    affectedRows: result.rowCount,
    rowCount: result.rowCount,
    rows: result.rows
  }, result.fields];
};

const executeOn = async (client, sql, params = []) => {
  const translated = translatePlaceholders(sql, params);
  const result = await client.query(translated.sql, translated.params);
  return formatResult(translated.sql, result);
};

const db = {
  execute: async (sql, params = []) => executeOn(pool, sql, params),
  query: async (sql, params = []) => executeOn(pool, sql, params),
  getConnection: async () => {
    const client = await pool.connect();

    return {
      execute: async (sql, params = []) => executeOn(client, sql, params),
      query: async (sql, params = []) => executeOn(client, sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release()
    };
  },
  end: () => pool.end(),
  pool
};

module.exports = db;
