'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { LogOut } from 'lucide-react';
import { useLogout } from '@/components/useLogout';
import type {
  ConversionMetrics,
  LeadMetrics,
  RecentSignup,
  SignupStage,
  RetentionRow,
  TypeSummary,
} from '@/lib/analytics/conversion-metrics';

const RANGES = [30, 90, 180, 365];
const RETENTION_WEEKS = [1, 2, 4, 8];
const TYPE_LABEL: Record<string, string> = { talent: 'Talent', manager: 'Manager' };

function formatHours(h: number | null) {
  if (h == null) return '—';
  if (h < 1) return '<1h';
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** Shade a retention cell from white to green by percentage. */
function retentionStyle(pct: number | null) {
  if (pct == null) return {};
  const alpha = Math.min(1, pct / 60);
  return { backgroundColor: `rgba(22, 163, 74, ${alpha * 0.75})` };
}

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <Card title={hint}>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {label}
          {hint && <span className="ml-1 cursor-help text-gray-400" aria-label={hint}>ⓘ</span>}
        </p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Funnel({ summary }: { summary: TypeSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {TYPE_LABEL[summary.type]} funnel{' '}
          <span className="text-sm font-normal text-gray-500">
            · {summary.signups} signups · {summary.activationPct}% activated
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.signups === 0 && <p className="text-sm text-gray-500">No signups in this range.</p>}
        {summary.signups > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">Signed up</span>
              <span className="text-gray-600">{summary.signups} · 100%</span>
            </div>
            <div className="h-2 rounded bg-gray-900" />
          </div>
        )}
        {summary.signups > 0 &&
          summary.funnel.map((step) => (
            <div key={step.kind}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{step.label}</span>
                <span className="text-gray-600">
                  {step.users} · {step.pct}%
                  <span className="ml-2 text-xs text-gray-400">median {formatHours(step.medianHoursToFirst)}</span>
                </span>
              </div>
              <div className="h-2 rounded bg-gray-100">
                <div className="h-2 rounded bg-green-600" style={{ width: `${step.pct}%` }} />
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function RetentionTable({ title, rows, labelHeader }: { title: string; rows: RetentionRow[]; labelHeader: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="py-2 pr-4">{labelHeader}</th>
              <th className="py-2 pr-4">Users</th>
              {RETENTION_WEEKS.map((w) => (
                <th key={w} className="py-2 px-3 text-center">
                  Week {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="py-2 pr-4 whitespace-nowrap">{TYPE_LABEL[row.label] ?? row.label}</td>
                <td className="py-2 pr-4">{row.size}</td>
                {RETENTION_WEEKS.map((w) => {
                  const cell = row.weeks[w];
                  return (
                    <td
                      key={w}
                      className="py-2 px-3 text-center"
                      style={retentionStyle(cell?.pct ?? null)}
                      title={cell ? `${cell.retained} of ${cell.eligible} eligible users` : undefined}
                    >
                      {cell?.pct == null ? <span className="text-gray-300">—</span> : `${cell.pct}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + RETENTION_WEEKS.length} className="py-4 text-gray-500">
                  No data in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_HINT =
  'Talent: added a work sample, applied to a gig, or logged hours. Manager: created a project, posted a gig, or reviewed hours. Either: invited someone, sent a message, or logged in again more than an hour after signup. Auto-generated invoices, nikatime-synced hours and the automatic login at the end of sign-up do not count.';

const STAGE: Record<SignupStage, { label: string; className: string; hint: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800',
    hint: `Has done at least one real action at some point (not necessarily recently; see Last activity). ${ACTIVITY_HINT}`,
  },
  onboarded: {
    label: 'Onboarded, not active',
    className: 'bg-amber-100 text-amber-800',
    hint: 'Did at least one setup step (connected a tool: Slack, WhatsApp or an integration, or added a payment method) but has not used the product yet: no project, gig, message, hours or later login. There is no "onboarding complete" flag, so these two steps are the proxy. Inviting a teammate counts as activity, so that shows as Active.',
  },
  account_only: {
    label: 'Account only',
    className: 'bg-gray-100 text-gray-700',
    hint: 'Has an account but did no setup (no tool connected, no payment method) and no activity. Usually means they stopped right after the account was created. Compare with "Onboarded, not active", who did at least one setup step.',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Check({ on }: { on: boolean }) {
  return on ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>;
}

function RecentSignups({ rows }: { rows: RecentSignup[] }) {
  const [filter, setFilter] = useState<SignupStage | 'all'>('all');
  const shown = filter === 'all' ? rows : rows.filter((r) => r.stage === filter);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Recent signups</CardTitle>
          <div className="flex gap-1 text-xs">
            {(['all', 'account_only', 'onboarded', 'active'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                title={f === 'all' ? 'Every signup in range' : STAGE[f].hint}
                className={`rounded-md px-2 py-1 ${filter === f ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f === 'all' ? `All (${rows.length})` : STAGE[f].label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Signed up</th>
              <th className="py-2 px-2 text-center">Tool</th>
              <th className="py-2 px-2 text-center">Team</th>
              <th className="py-2 px-2 text-center">Payment</th>
              <th className="py-2 pr-4">Last activity</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="py-2 pr-4">
                  <div className="font-medium text-gray-900">{r.email}</div>
                  <div className="text-xs text-gray-500">{r.name}</div>
                </td>
                <td className="py-2 pr-4">{TYPE_LABEL[r.type]}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.signedUpAt)}</td>
                <td className="py-2 px-2 text-center"><Check on={r.toolConnected} /></td>
                <td className="py-2 px-2 text-center"><Check on={r.teamInvited} /></td>
                <td className="py-2 px-2 text-center"><Check on={r.paymentAdded} /></td>
                <td className="py-2 pr-4 whitespace-nowrap">{r.lastActivityAt ? formatDate(r.lastActivityAt) : <span className="text-gray-300">—</span>}</td>
                <td className="py-2">
                  <span title={STAGE[r.stage].hint} className={`cursor-help rounded-full px-2 py-0.5 text-xs ${STAGE[r.stage].className}`}>{STAGE[r.stage].label}</span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-gray-500">No signups match.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-400">Showing the latest 100 in range. Team = invited someone; Payment applies to managers.</p>
      </CardContent>
    </Card>
  );
}

function PendingLeads({ leads }: { leads: LeadMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Started sign-up, no account yet
          {leads.tracking && <span className="text-sm font-normal text-gray-500"> · {leads.pending.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!leads.tracking && (
          <p className="text-sm text-gray-500">
            Not enabled yet. Apply migration 0020 (signup_leads) to start capturing Google sign-ins that never create an account.
          </p>
        )}
        {leads.tracking && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">First seen</th>
                <th className="py-2 pr-4">Last seen</th>
                <th className="py-2">Sign-ins</th>
              </tr>
            </thead>
            <tbody>
              {leads.pending.map((l) => (
                <tr key={l.email} className="border-t border-gray-100">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-gray-900">{l.email}</div>
                    {l.name && <div className="text-xs text-gray-500">{l.name}</div>}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(l.firstSeenAt)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(l.lastSeenAt)}</td>
                  <td className="py-2">{l.signInCount}</td>
                </tr>
              ))}
              {leads.pending.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-gray-500">No pending Google sign-ins in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const logout = useLogout();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ConversionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days, logout]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <meta name="robots" content="noindex, nofollow" />
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              ← CRM
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Conversion & retention</h1>
            <p className="text-sm text-gray-500">Signups, what users did next, and who came back.</p>
            <Link href="/analytics/users" className="text-sm text-gray-500 underline hover:text-gray-900">
              Per-user activity (last sign-in) →
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 bg-white p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setDays(r)}
                  className={`rounded-md px-3 py-1 text-sm ${days === r ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {r}d
                </button>
              ))}
            </div>
            <ThemeToggle className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100" />
            <button onClick={logout} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading && !data && <p className="text-sm text-gray-500">Loading…</p>}

        {data && (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label={`Signups (${data.days}d)`} value={String(data.totals.signups)} />
              <Kpi
                label="Activated"
                hint={`Share of signups who have done at least one real action. ${ACTIVITY_HINT}`}
                value={`${data.totals.activationPct}%`}
                sub={`${data.totals.activated} did something in-app`}
              />
              {data.byType.map((t) => (
                <Kpi key={t.type} label={`${TYPE_LABEL[t.type]} signups`} value={String(t.signups)} sub={`${t.activationPct}% activated`} />
              ))}
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Signups per day</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dailySignups}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <Legend />
                    <Bar dataKey="talent" name="Talent" stackId="a" fill="var(--color-gray-900)" />
                    <Bar dataKey="manager" name="Manager" stackId="a" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="mt-6 space-y-6">
              <PendingLeads leads={data.leads} />
              <RecentSignups rows={data.recentSignups} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {data.byType.map((t) => (
                <Funnel key={t.type} summary={t} />
              ))}
            </div>

            <div className="mt-6 space-y-6">
              <RetentionTable title="Retention by user type" rows={data.retentionByType} labelHeader="Type" />
              <RetentionTable title="Retention by signup week" rows={data.retentionByWeek} labelHeader="Week of" />
            </div>

            <ul className="mt-6 list-disc space-y-1 pl-5 text-xs text-gray-500">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
