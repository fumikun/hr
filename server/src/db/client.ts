import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}
