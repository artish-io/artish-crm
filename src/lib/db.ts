import { Connector, IpAddressTypes, AuthTypes } from '@google-cloud/cloud-sql-connector';
import { GoogleAuth } from 'google-auth-library';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

/**
 * Read-only access to the main Artish Postgres (Cloud SQL).
 *
 * Production (Vercel): the Cloud SQL connector with a service account, so no
 * authorized-network entry or public-IP allowlist is needed.
 *   CLOUD_SQL_INSTANCE=project:region:instance, DB_USER, DB_PASSWORD, DB_NAME,
 *   GCP_SERVICE_ACCOUNT_KEY=<service account JSON>
 * Local dev: set MAIN_DATABASE_URL instead (DATABASE_URL is the CRM's own Neon database, see sql.ts) (e.g. through an allowlisted IP).
 *
 * Connect as a role that only has SELECT; the dashboard never writes.
 */

type Db = ReturnType<typeof drizzle>;
let pending: Promise<Db> | null = null;

async function poolConfig(): Promise<PoolConfig> {
  const instance = process.env.CLOUD_SQL_INSTANCE;
  if (instance) {
    const { DB_USER, DB_PASSWORD, DB_NAME, GCP_SERVICE_ACCOUNT_KEY } = process.env;
    if (!DB_USER || !DB_PASSWORD || !DB_NAME) throw new Error('DB_USER, DB_PASSWORD and DB_NAME are required with CLOUD_SQL_INSTANCE');
    const auth = GCP_SERVICE_ACCOUNT_KEY
      ? new GoogleAuth({
          credentials: JSON.parse(GCP_SERVICE_ACCOUNT_KEY),
          scopes: ['https://www.googleapis.com/auth/sqlservice.admin'],
        })
      : undefined; // falls back to application default credentials
    const connector = new Connector({ auth });
    const opts = await connector.getOptions({
      instanceConnectionName: instance,
      ipType: IpAddressTypes.PUBLIC,
      authType: AuthTypes.PASSWORD,
    });
    return { ...opts, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, max: 3 };
  }
  const url = process.env.MAIN_DATABASE_URL;
  if (!url) throw new Error('Set CLOUD_SQL_INSTANCE (production) or MAIN_DATABASE_URL (local) to read analytics');
  return { connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 3 };
}

function getDb(): Promise<Db> {
  pending ??= poolConfig()
    .then((cfg) => drizzle(new Pool(cfg)))
    .catch((e) => {
      pending = null; // retry on the next request instead of caching the failure
      throw e;
    });
  return pending;
}

/** Same `db.execute(sql\`...\`)` shape as the main app, initialised lazily so builds need no env. */
export const db = {
  execute: async (query: Parameters<Db['execute']>[0]) => (await getDb()).execute(query),
};
