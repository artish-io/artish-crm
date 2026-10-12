import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { importLegacyBlob } from './legacy-import';

/**
 * The CRM's own Postgres (Neon, via DATABASE_URL). This is separate from the
 * read-only connection to the main Artish database in db.ts.
 *
 * Without DATABASE_URL (local dev only) an embedded Postgres (PGlite) is used,
 * stored in ./.data/pglite. On Vercel a missing DATABASE_URL is an error, so
 * data can never silently land in a throwaway filesystem.
 */

export type Query = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

interface Driver {
  query: Query;
  exec(text: string): Promise<void>;
  tx<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id          text PRIMARY KEY,
  email       text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  company     text NOT NULL DEFAULT '',
  pipeline    text NOT NULL,
  stage       text NOT NULL,
  notes       text NOT NULL DEFAULT '',
  source      text NOT NULL,
  has_account boolean NOT NULL DEFAULT false,
  product     jsonb,
  transcripts jsonb NOT NULL DEFAULT '[]',
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_uniq ON contacts (lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
`;

const SCHEMA_LOCK = 727301;

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: local || /sslmode=/.test(url) ? undefined : true,
    });
    return {
      query: (text, params) => pool.query(text, params as any[]),
      exec: async (text) => void (await pool.query(text)),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn((text, params) => client.query(text, params as any[]));
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }

  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. Connect a Neon database to this Vercel project.');

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.join(process.cwd(), '.data', 'pglite');
  await fs.mkdir(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir);
  return {
    query: (text, params) => db.query(text, params as any[]),
    exec: async (text) => void (await db.exec(text)),
    tx: (fn) => db.transaction((t) => fn((text, params) => t.query(text, params as any[]))),
  };
}

let ready: Promise<Driver> | null = null;

/** Creates the schema on first use and runs the one-time Blob import. Retried if it fails. */
function driver(): Promise<Driver> {
  ready ??= (async () => {
    const d = await createDriver();
    await d.tx(async (q) => {
      await q('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK]); // serialize concurrent cold starts
      for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt);
      await importLegacyBlob(q);
    });
    return d;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export const query: Query = async (text, params) => (await driver()).query(text, params);
export async function tx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}

/** Postgres unique_violation, from either driver. */
export const isDuplicate = (e: unknown) => (e as { code?: string })?.code === '23505';
