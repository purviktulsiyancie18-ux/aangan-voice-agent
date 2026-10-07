// npm run db:migrate  →  creates calls, clients, events in Neon.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url || url === 'pglite') {
  console.error('Set DATABASE_URL to your Neon connection string in .env.local');
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);

for (const s of statements) await sql.query(s);

const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1"
);
console.log('Migrated. Tables:', tables.map((t) => t.table_name).join(', '));
