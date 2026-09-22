const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
if (!connectionString) {
  throw new Error('DATABASE_URL (Supabase PostgreSQL) não configurada.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

async function initDB(seed) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (result.rowCount === 0) {
    await pool.query(
      'INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)',
      [JSON.stringify(seed)]
    );
    return seed;
  }
  return result.rows[0].data;
}

let saveQueue = Promise.resolve();
function saveDB(db) {
  saveQueue = saveQueue
    .then(() => pool.query(
      'UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',
      [JSON.stringify(db)]
    ))
    .catch(err => console.error('database save:', err.message));
  return saveQueue;
}

async function snapshot(db) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_snapshots (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )
  `);
  const result = await pool.query(
    'INSERT INTO app_snapshots (data) VALUES ($1::jsonb) RETURNING id, created_at',
    [JSON.stringify(db)]
  );
  await pool.query(`
    DELETE FROM app_snapshots
    WHERE id NOT IN (SELECT id FROM app_snapshots ORDER BY id DESC LIMIT 7)
  `);
  return result.rows[0];
}

async function health() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

async function close() {
  await saveQueue.catch(() => {});
  await pool.end();
}

module.exports = { initDB, saveDB, snapshot, health, close };
