// Database access. Neon (HTTP driver) in production; PGlite in-memory when
// DATABASE_URL=pglite (tests run without touching the real database).
import { readFileSync } from 'node:fs';
import path from 'node:path';

let client;

async function getClient() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  if (url === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(readFileSync(path.join(process.cwd(), 'db/schema.sql'), 'utf8'));
    client = async (text, params = []) => (await db.query(text, params)).rows;
  } else {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    client = (text, params = []) => sql.query(text, params);
  }
  return client;
}

/** Run a parameterised query and return rows. */
export async function query(text, params = []) {
  const run = await getClient();
  return run(text, params);
}

export async function one(text, params = []) {
  return (await query(text, params))[0] ?? null;
}

export async function logEvent(type, { callId = null, phone = null, detail = {} } = {}) {
  try {
    await query(
      'insert into events (call_id, caller_phone, type, detail) values ($1, $2, $3, $4)',
      [callId, phone, type, JSON.stringify(detail)]
    );
  } catch (err) {
    console.error('logEvent failed', type, err.message);
  }
}
