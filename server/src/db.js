import pg from 'pg';

const { Pool, types } = pg;

// node-postgres returns NUMERIC and BIGINT as strings by default. Amounts here
// fit comfortably in a double (max 14 digits), so parse them once, centrally.
types.setTypeParser(1700, parseFloat);
types.setTypeParser(20, (value) => parseInt(value, 10));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hour-of-day analytics assume one fixed clock for the whole bank.
  options: '-c timezone=UTC',
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside BEGIN/COMMIT, rolling back if it throws. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
