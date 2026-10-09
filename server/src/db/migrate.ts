import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

const { db, sql } = createDb();
await migrate(db, { migrationsFolder: './drizzle' });
await sql.end();
