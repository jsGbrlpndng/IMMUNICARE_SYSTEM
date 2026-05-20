const mysql = require('mysql2');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const usePg = process.env.USE_PG === 'true';

let pool;

if (usePg) {
  console.log('[DB] Using PostgreSQL Foundation');
  pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    port: process.env.PG_PORT || 5432
  });

  // Internal translation logic
  const translateSql = (sql, params) => {
    let pgSql = sql;
    let pgParams = [...params];

    // Handle MySQL-style bulk inserts: INSERT INTO table (...) VALUES ?
    if (pgSql.toLowerCase().includes('values ?') && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
      const rows = params[0];
      const placeholders = rows.map((row, rowIndex) =>
        '(' + row.map((_, colIndex) => `$${rowIndex * row.length + colIndex + 1}`).join(', ') + ')'
      ).join(', ');
      pgSql = pgSql.replace('?', placeholders);
      pgParams = rows.flat();
    } else {
      // Standard ? to $n translation
      let i = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${i++}`);
    }

    // SQL Dialect Conversions
    if (pgSql.toUpperCase().includes('UPDATE') || pgSql.toUpperCase().includes('DELETE')) {
      pgSql = pgSql.replace(/ LIMIT 1/gi, '');
    }
    pgSql = pgSql.replace(/CURDATE\(\)/gi, 'CURRENT_DATE');
    pgSql = pgSql.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');
    pgSql = pgSql.replace(/IFNULL\(/gi, 'COALESCE(');
    pgSql = pgSql.replace(/SHOW TABLES LIKE/gi, "SELECT tablename FROM pg_catalog.pg_tables WHERE tablename LIKE");
    pgSql = pgSql.replace(/DATE_(SUB|ADD)\(([^,]+),\s*INTERVAL\s+(\?|\d+)\s+(DAY|WEEK|MONTH|YEAR)\)/gi, (match, op, base, val, unit) => {
      const operator = op.toUpperCase() === 'ADD' ? '+' : '-';
      return `${base} ${operator} (INTERVAL '1 ${unit}' * ${val})`;
    });

    return { pgSql, pgParams };
  };

  const formatRows = (rows) => {
    return rows.map(row => {
      for (let key in row) {
        if (typeof row[key] === 'string' && /^\d+$/.test(row[key]) && row[key].length < 15) {
          const num = Number(row[key]);
          if (!isNaN(num)) row[key] = num;
        }
      }
      return row;
    });
  };

  const pgWrapper = {
    execute: async (sql, params = []) => {
      const { pgSql, pgParams } = translateSql(sql, params);
      const res = await pool.query(pgSql, pgParams);
      if (pgSql.trim().toUpperCase().startsWith('SELECT')) {
        return [formatRows(res.rows), res.fields];
      }
      return [{ affectedRows: res.rowCount }, res.fields];
    },
    query: async (sql, params = []) => {
      return pgWrapper.execute(sql, params);
    },
    getConnection: async () => {
      const client = await pool.connect();
      // Wrap the client to match mysql2 connection interface
      const wrappedClient = {
        execute: async (sql, params = []) => {
          const { pgSql, pgParams } = translateSql(sql, params);
          const res = await client.query(pgSql, pgParams);
          if (pgSql.trim().toUpperCase().startsWith('SELECT')) {
            return [formatRows(res.rows), res.fields];
          }
          return [{ affectedRows: res.rowCount }, res.fields];
        },
        query: async (sql, params = []) => {
          return wrappedClient.execute(sql, params);
        },
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release(),
        // mysql2 compatibility
        release: () => client.release(),
        release: () => client.release(),
      };
      return wrappedClient;
    },
    end: () => pool.end()
  };

  module.exports = pgWrapper;

} else {
  console.log('[DB] Using MySQL Legacy Foundation');
  const mysqlPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  module.exports = mysqlPool.promise();
}
