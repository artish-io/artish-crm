import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildEventsCte, excludedEmailFilter, getTrackingTables, type UserType } from './conversion-metrics';

export interface UserActivityRow {
  id: number;
  email: string;
  name: string;
  type: UserType;
  signedUpAt: string;
  /** Last recorded sign-in. Only exists from when login tracking was deployed. */
  lastSignInAt: string | null;
  signInCount: number;
  /** Last real in-app action (not a sign-in). */
  lastActionAt: string | null;
  actions30d: number;
  /** Most recent of last sign-in and last action. */
  lastSeenAt: string | null;
  /** Funnel step kinds this user has reached (e.g. project_created, invite_sent, tool_connected). */
  steps: string[];
}

export interface UserActivityResult {
  loginTracking: boolean;
  trackingSince: string | null;
  users: UserActivityRow[];
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** Per-user activity for every account (not limited to a signup window), most recently seen first. */
export async function getUserActivity(): Promise<UserActivityResult> {
  const { hasLogins } = await getTrackingTables();

  const lastSignIn = hasLogins
    ? sql`(SELECT max(l.created_at) FROM user_login_events l WHERE l.user_id = u.id)`
    : sql`NULL::timestamp`;
  const signInCount = hasLogins
    ? sql`(SELECT count(*) FROM user_login_events l WHERE l.user_id = u.id)::int`
    : sql`0`;

  const res = await db.execute(sql`
    WITH events AS (${buildEventsCte(hasLogins)}),
    actions AS (
      SELECT user_id, at FROM events WHERE is_activity AND at IS NOT NULL AND kind <> 'logged_in_again'
    )
    SELECT * FROM (
      SELECT u.id, u.email, u.name, u.type::text AS type, u.created_at,
             ${lastSignIn} AS last_sign_in,
             ${signInCount} AS sign_in_count,
             (SELECT max(a.at) FROM actions a WHERE a.user_id = u.id) AS last_action,
             (SELECT count(*) FROM actions a WHERE a.user_id = u.id AND a.at >= now() - interval '30 days')::int AS actions_30d,
             (SELECT coalesce(array_agg(DISTINCT e.kind), '{}') FROM events e WHERE e.user_id = u.id) AS steps
      FROM users u
      WHERE true ${excludedEmailFilter()}
    ) t
    ORDER BY greatest(t.last_sign_in, t.last_action) DESC NULLS LAST, t.created_at DESC
    LIMIT 500`);

  const first = hasLogins
    ? ((await db.execute(sql`SELECT min(created_at) AS first FROM user_login_events`)).rows[0] as any)?.first
    : null;

  return {
    loginTracking: hasLogins,
    trackingSince: iso(first),
    users: (res.rows as any[]).map((r) => {
      const lastSignInAt = iso(r.last_sign_in);
      const lastActionAt = iso(r.last_action);
      const seen = [lastSignInAt, lastActionAt].filter(Boolean).sort().pop() ?? null;
      return {
        id: Number(r.id),
        email: String(r.email),
        name: String(r.name),
        type: r.type as UserType,
        signedUpAt: new Date(r.created_at).toISOString(),
        lastSignInAt,
        signInCount: Number(r.sign_in_count),
        lastActionAt,
        actions30d: Number(r.actions_30d),
        lastSeenAt: seen,
        steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
      };
    }),
  };
}
