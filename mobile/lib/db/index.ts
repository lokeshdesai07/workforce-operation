import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync('workforce.db');
  await db.execAsync(SCHEMA_SQL);
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?, ?)`,
    ['schema_version', String(SCHEMA_VERSION)],
  );
  _db = db;
  return db;
}

export async function resetDb(): Promise<void> {
  // Useful for "sign out" — drop everything.
  if (!_db) _db = await SQLite.openDatabaseAsync('workforce.db');
  await _db.execAsync(`
    DROP TABLE IF EXISTS inspections;
    DROP TABLE IF EXISTS check_ins;
    DROP TABLE IF EXISTS check_outs;
    DROP TABLE IF EXISTS inspection_reports;
    DROP TABLE IF EXISTS outbox;
    DROP TABLE IF EXISTS sync_meta;
    DROP TABLE IF EXISTS local_conflicts;
  `);
  await _db.execAsync(SCHEMA_SQL);
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value],
  );
}
