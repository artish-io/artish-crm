import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Conversion / retention metrics for the internal analytics dashboard.
 *
 * There is no login or session tracking yet, so "activity" is inferred from
 * rows users create in the product (messages, hours, projects, ...). Steps with
 * `isActivity: false` still appear in the funnel but never count as retention
 * (e.g. auto-generated invoices, profile edits).
 */

export type UserType = 'talent' | 'manager';

interface StepDef {
  kind: string;
  label: string;
  /** Which signup types the step is shown for. */
  types: UserType[];
  /** Counts toward activation + retention when true. */
  isActivity: boolean;
  /** SQL selecting (user_id, at); `at` NULL means "no reliable timestamp". */
  source: string;
}

const STEPS: StepDef[] = [
  {
    kind: 'tool_connected',
    label: 'Connected a tool (Slack / WhatsApp / integration)',
    types: ['talent', 'manager'],
    isActivity: false, // part of onboarding, not ongoing usage
    source: `SELECT user_id, linked_at AS at FROM slack_user_links
             UNION ALL SELECT user_id, linked_at AS at FROM whatsapp_user_links
             UNION ALL SELECT user_id, linked_at AS at FROM user_integration_credentials`,
  },
  {
    kind: 'work_sample',
    label: 'Added a work sample',
    types: ['talent'],
    isActivity: true,
    source: `SELECT user_id, created_at AS at FROM user_work_samples`,
  },
  {
    kind: 'stripe_connected',
    label: 'Connected Stripe payouts',
    types: ['talent'],
    isActivity: false,
    source: `SELECT user_id, created_at AS at FROM stripe_connected_accounts WHERE charges_enabled AND payouts_enabled`,
  },
  {
    kind: 'gig_applied',
    label: 'Applied to a gig',
    types: ['talent'],
    isActivity: true,
    source: `SELECT talent_id AS user_id, submitted_at AS at FROM gig_applications WHERE submitted_at IS NOT NULL`,
  },
  {
    kind: 'hours_logged',
    label: 'Logged hours',
    types: ['talent'],
    isActivity: true,
    // nikatime rows are synced in, not entered by the user
    source: `SELECT talent_id AS user_id, created_at AS at FROM project_task_hours WHERE source = 'artish'`,
  },
  {
    kind: 'invoice_created',
    label: 'Had an invoice generated',
    types: ['talent'],
    isActivity: false, // auto-generated, not a user action
    source: `SELECT talent_id AS user_id, created_at AS at FROM invoices`,
  },
  {
    kind: 'project_created',
    label: 'Created a project',
    types: ['manager'],
    isActivity: true,
    source: `SELECT manager_id AS user_id, created_at AS at FROM projects`,
  },
  {
    kind: 'gig_posted',
    label: 'Posted a gig',
    types: ['manager'],
    isActivity: true,
    source: `SELECT manager_id AS user_id, created_at AS at FROM gigs WHERE manager_id IS NOT NULL`,
  },
  {
    kind: 'invite_sent',
    label: 'Invited someone to an org',
    types: ['manager'],
    isActivity: true,
    source: `SELECT inviter_user_id AS user_id, created_at AS at FROM org_invitations`,
  },
  {
    kind: 'payment_added',
    label: 'Added a payment method',
    types: ['manager'],
    isActivity: false,
    source: `SELECT user_id, created_at AS at FROM stripe_customers WHERE default_payment_method_id IS NOT NULL`,
  },
  {
    kind: 'hours_reviewed',
    label: 'Reviewed hours',
    types: ['manager'],
    isActivity: true,
    source: `SELECT reviewed_by AS user_id, reviewed_at AS at FROM project_task_hours WHERE reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL`,
  },
  {
    kind: 'message_sent',
    label: 'Sent a message',
    types: ['talent', 'manager'],
    isActivity: true,
    source: `SELECT sender_id AS user_id, created_at AS at FROM messages`,
  },
];

export const RETENTION_WEEKS = [1, 2, 4, 8] as const;

/**
 * Real sign-ins (user_login_events). A sign-in within the first hour is the
 * automatic login at the end of sign-up, not a return visit, so it is ignored.
 */
const LOGIN_STEP: StepDef = {
  kind: 'logged_in_again',
  label: 'Came back and logged in',
  types: ['talent', 'manager'],
  isActivity: true,
  source: `SELECT l.user_id, l.created_at AS at FROM user_login_events l
           JOIN users u ON u.id = l.user_id
           WHERE l.created_at > u.created_at + interval '1 hour'`,
};

const activeSteps = (hasLogins: boolean) => (hasLogins ? [...STEPS, LOGIN_STEP] : STEPS);

/** Step definitions are code constants (never user input), so inlining them is safe. */
export const buildEventsCte = (hasLogins: boolean) =>
  sql.raw(
    activeSteps(hasLogins)
      .map(
        (s) => `SELECT user_id, '${s.kind}' AS kind, at, ${s.isActivity} AS is_activity FROM (${s.source}) s_${s.kind}`,
      )
      .join('\nUNION ALL\n'),
  );

/** Comma-separated ILIKE patterns (e.g. "%@artish.com,test+%") to keep test accounts out of the numbers. */
export function excludedEmailFilter(): SQL {
  const patterns = (process.env.ANALYTICS_EXCLUDED_EMAIL_PATTERNS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (patterns.length === 0) return sql``;
  return sql`AND ${sql.join(
    patterns.map((p) => sql`email NOT ILIKE ${p}`),
    sql` AND `,
  )}`;
}

function cohortCte(days: number, hasLogins: boolean): SQL {
  return sql`
    cohort AS (
      SELECT id, type, created_at, email, name FROM users
      WHERE created_at >= now() - make_interval(days => ${days}) ${excludedEmailFilter()}
    ),
    events AS (${buildEventsCte(hasLogins)}),
    first_events AS (
      SELECT user_id, kind, min(at) AS at, bool_or(is_activity) AS is_activity
      FROM events GROUP BY user_id, kind
    ),
    activity AS (
      SELECT user_id, at FROM events WHERE is_activity AND at IS NOT NULL
    )`;
}

export interface FunnelStep {
  kind: string;
  label: string;
  users: number;
  /** % of signups of this type */
  pct: number;
  medianHoursToFirst: number | null;
}

export interface TypeSummary {
  type: UserType;
  signups: number;
  activated: number;
  activationPct: number;
  funnel: FunnelStep[];
}

export interface RetentionCell {
  eligible: number;
  retained: number;
  pct: number | null;
}

export interface RetentionRow {
  label: string;
  size: number;
  weeks: Record<number, RetentionCell>;
}

export type SignupStage = 'active' | 'onboarded' | 'account_only';

export interface RecentSignup {
  id: number;
  email: string;
  name: string;
  type: UserType;
  signedUpAt: string;
  toolConnected: boolean;
  teamInvited: boolean;
  paymentAdded: boolean;
  lastActivityAt: string | null;
  stage: SignupStage;
}

export interface Lead {
  email: string;
  name: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  signInCount: number;
}

export interface LeadMetrics {
  /** false until the 0020 migration is applied */
  tracking: boolean;
  started: number;
  converted: number;
  conversionPct: number;
  /** Signed in with Google but have no account */
  pending: Lead[];
}

export interface ConversionMetrics {
  days: number;
  generatedAt: string;
  totals: { signups: number; activated: number; activationPct: number };
  byType: TypeSummary[];
  dailySignups: { day: string; talent: number; manager: number }[];
  recentSignups: RecentSignup[];
  leads: LeadMetrics;
  loginTracking: boolean;
  retentionByWeek: RetentionRow[];
  retentionByType: RetentionRow[];
  notes: string[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function retentionColumns(): SQL {
  return sql.join(
    RETENTION_WEEKS.map(
      (n) => sql`
        count(DISTINCT c.id) FILTER (WHERE c.created_at + make_interval(days => ${(n + 1) * 7}) <= now()) AS ${sql.raw(`eligible_${n}`)},
        count(DISTINCT c.id) FILTER (
          WHERE c.created_at + make_interval(days => ${(n + 1) * 7}) <= now()
            AND EXISTS (
              SELECT 1 FROM activity a
              WHERE a.user_id = c.id
                AND a.at >= c.created_at + make_interval(days => ${n * 7})
                AND a.at <  c.created_at + make_interval(days => ${(n + 1) * 7})
            )
        ) AS ${sql.raw(`retained_${n}`)}`,
    ),
    sql`,`,
  );
}

function toRetentionRow(r: Record<string, any>): RetentionRow {
  const weeks: Record<number, RetentionCell> = {};
  for (const n of RETENTION_WEEKS) {
    const eligible = Number(r[`eligible_${n}`]);
    const retained = Number(r[`retained_${n}`]);
    weeks[n] = { eligible, retained, pct: eligible > 0 ? pct(retained, eligible) : null };
  }
  return { label: String(r.label), size: Number(r.size), weeks };
}

async function getLeadMetrics(days: number, hasLeads: boolean): Promise<LeadMetrics> {
  if (!hasLeads) return { tracking: false, started: 0, converted: 0, conversionPct: 0, pending: [] };
  const patterns = (process.env.ANALYTICS_EXCLUDED_EMAIL_PATTERNS || '').split(',').map((p) => p.trim()).filter(Boolean);
  const exclude = patterns.length
    ? sql`AND ${sql.join(patterns.map((p) => sql`l.email NOT ILIKE ${p}`), sql` AND `)}`
    : sql``;
  const base = sql`FROM signup_leads l WHERE l.first_seen_at >= now() - make_interval(days => ${days}) ${exclude}`;
  const noAccount = sql`NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = l.email)`;

  const [countRes, pendingRes] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS started, count(*) FILTER (WHERE NOT ${noAccount})::int AS converted ${base}`),
    db.execute(sql`SELECT l.email, l.name, l.first_seen_at, l.last_seen_at, l.sign_in_count ${base} AND ${noAccount}
                   ORDER BY l.first_seen_at DESC LIMIT 100`),
  ]);
  const c = countRes.rows[0] as any;
  const started = Number(c.started);
  const converted = Number(c.converted);
  return {
    tracking: true,
    started,
    converted,
    conversionPct: pct(converted, started),
    pending: (pendingRes.rows as any[]).map((r) => ({
      email: String(r.email),
      name: r.name ?? null,
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      signInCount: Number(r.sign_in_count),
    })),
  };
}

/** Which migration-0020 tracking tables exist (the code is deployable before the migration). */
export async function getTrackingTables() {
  const res = await db.execute(sql`
    SELECT to_regclass('public.user_login_events') IS NOT NULL AS logins,
           to_regclass('public.signup_leads') IS NOT NULL AS leads`);
  const row = res.rows[0] as any;
  return { hasLogins: !!row?.logins, hasLeads: !!row?.leads };
}

export async function getConversionMetrics(days: number): Promise<ConversionMetrics> {
  // The tracking tables come from migration 0020; degrade gracefully until it is applied.
  const exists = await db.execute(sql`
    SELECT to_regclass('public.user_login_events') IS NOT NULL AS logins,
           to_regclass('public.signup_leads') IS NOT NULL AS leads`);
  const hasLogins = !!(exists.rows[0] as any)?.logins;
  const hasLeads = !!(exists.rows[0] as any)?.leads;

  const [summaryRes, funnelRes, dailyRes, weekRes, typeRes, recentRes] = await Promise.all([
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT c.type::text AS type,
             count(*)::int AS signups,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM first_events fe WHERE fe.user_id = c.id AND fe.is_activity
             ))::int AS activated
      FROM cohort c GROUP BY 1`),
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT c.type::text AS type, fe.kind,
             count(DISTINCT c.id)::int AS users,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY greatest(0, extract(epoch FROM (fe.at - c.created_at)) / 3600)
             ) AS median_hours
      FROM cohort c JOIN first_events fe ON fe.user_id = c.id
      GROUP BY 1, 2`),
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT created_at::date::text AS day, type::text AS type, count(*)::int AS n
      FROM cohort GROUP BY 1, 2 ORDER BY 1`),
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT date_trunc('week', c.created_at)::date::text AS label,
             count(DISTINCT c.id)::int AS size,
             ${retentionColumns()}
      FROM cohort c GROUP BY 1 ORDER BY 1 DESC`),
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT c.type::text AS label,
             count(DISTINCT c.id)::int AS size,
             ${retentionColumns()}
      FROM cohort c GROUP BY 1 ORDER BY 1`),
    db.execute(sql`
      WITH ${cohortCte(days, hasLogins)}
      SELECT c.id, c.email, c.name, c.type::text AS type, c.created_at,
             EXISTS (SELECT 1 FROM first_events fe WHERE fe.user_id = c.id AND fe.kind = 'tool_connected') AS tool_connected,
             EXISTS (SELECT 1 FROM first_events fe WHERE fe.user_id = c.id AND fe.kind = 'invite_sent') AS team_invited,
             EXISTS (SELECT 1 FROM first_events fe WHERE fe.user_id = c.id AND fe.kind = 'payment_added') AS payment_added,
             (SELECT max(a.at) FROM activity a WHERE a.user_id = c.id) AS last_activity_at
      FROM cohort c ORDER BY c.created_at DESC LIMIT 100`),
  ]);

  const leads = await getLeadMetrics(days, hasLeads);

  const signupsByType = new Map<string, { signups: number; activated: number }>();
  for (const r of summaryRes.rows as any[]) {
    signupsByType.set(r.type, { signups: Number(r.signups), activated: Number(r.activated) });
  }

  const funnelRows = funnelRes.rows as any[];
  const byType: TypeSummary[] = (['talent', 'manager'] as UserType[]).map((type) => {
    const s = signupsByType.get(type) ?? { signups: 0, activated: 0 };
    const funnel = activeSteps(hasLogins).filter((step) => step.types.includes(type)).map((step) => {
      const row = funnelRows.find((r) => r.type === type && r.kind === step.kind);
      const users = row ? Number(row.users) : 0;
      return {
        kind: step.kind,
        label: step.label,
        users,
        pct: pct(users, s.signups),
        medianHoursToFirst: row?.median_hours != null ? Math.round(Number(row.median_hours) * 10) / 10 : null,
      };
    });
    return { type, signups: s.signups, activated: s.activated, activationPct: pct(s.activated, s.signups), funnel };
  });

  const daily = new Map<string, { talent: number; manager: number }>();
  for (const r of dailyRes.rows as any[]) {
    const d = daily.get(r.day) ?? { talent: 0, manager: 0 };
    d[r.type as UserType] = Number(r.n);
    daily.set(r.day, d);
  }

  const recentSignups: RecentSignup[] = (recentRes.rows as any[]).map((r) => {
    const lastActivityAt = r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null;
    const onboarded = r.tool_connected || r.team_invited || r.payment_added;
    return {
      id: Number(r.id),
      email: String(r.email),
      name: String(r.name),
      type: r.type as UserType,
      signedUpAt: new Date(r.created_at).toISOString(),
      toolConnected: !!r.tool_connected,
      teamInvited: !!r.team_invited,
      paymentAdded: !!r.payment_added,
      lastActivityAt,
      stage: lastActivityAt ? 'active' : onboarded ? 'onboarded' : 'account_only',
    };
  });

  const signups = byType.reduce((a, t) => a + t.signups, 0);
  const activated = byType.reduce((a, t) => a + t.activated, 0);

  return {
    days,
    generatedAt: new Date().toISOString(),
    totals: { signups, activated, activationPct: pct(activated, signups) },
    byType,
    recentSignups,
    leads,
    loginTracking: hasLogins,
    dailySignups: [...daily.entries()].map(([day, v]) => ({ day, ...v })),
    retentionByWeek: (weekRes.rows as any[]).map(toRetentionRow),
    retentionByType: (typeRes.rows as any[]).map(toRetentionRow),
    notes: [
      hasLogins
        ? 'Retention counts in-app actions (messages, hours, projects, gigs, invites, work samples) and logins after the first hour. Login history only exists from when tracking was deployed.'
        : 'Retention is inferred from in-app actions (messages, hours, projects, gigs, invites, work samples); login tracking is not enabled yet (migration 0020).',
      'Retention week N = active between 7N and 7(N+1) days after signup. Only users old enough to have completed that window are counted.',
      'Median hours uses each user\'s first occurrence of a step.',
      leads.tracking
        ? 'Signups counts accounts. "Started sign-up" counts Google sign-ins from when lead tracking was deployed (earlier drop-offs were never stored).'
        : 'An account is created partway through sign-up, just before "Connect your tools". People who leave before that point are not stored until lead tracking is enabled (migration 0020).',
    ],
  };
}
