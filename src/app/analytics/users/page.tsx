'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogout } from '@/components/useLogout';
import type { UserActivityResult, UserActivityRow } from '@/lib/analytics/user-activity';

const TYPE_LABEL: Record<string, string> = { talent: 'Talent', manager: 'Manager' };

type SortKey = 'lastSeenAt' | 'lastSignInAt' | 'lastActionAt' | 'signedUpAt' | 'actions30d';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'lastSeenAt', label: 'Last seen' },
  { key: 'lastSignInAt', label: 'Last sign-in' },
  { key: 'lastActionAt', label: 'Last action' },
  { key: 'signedUpAt', label: 'Signed up' },
  { key: 'actions30d', label: 'Actions (30d)' },
];

function ago(iso: string | null) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function When({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-300">—</span>;
  return (
    <span title={new Date(iso).toLocaleString()} className="whitespace-nowrap">
      {ago(iso)}
    </span>
  );
}

export default function UserActivityPage() {
  const logout = useLogout();
  const [data, setData] = useState<UserActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'talent' | 'manager'>('all');
  const [sort, setSort] = useState<SortKey>('lastSeenAt');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/analytics/users');
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message || 'Failed to load user activity');
      }
    })();
  }, [logout]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.users.filter(
      (u: UserActivityRow) =>
        (type === 'all' || u.type === type) &&
        (!q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)),
    );
    const val = (u: UserActivityRow) => {
      const v = u[sort];
      return typeof v === 'number' ? v : v ? new Date(v).getTime() : -1;
    };
    return [...filtered].sort((a, b) => val(b) - val(a));
  }, [data, query, type, sort]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <meta name="robots" content="noindex, nofollow" />
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex gap-3 text-sm text-gray-500">
              <Link href="/" className="hover:text-gray-900">
                ← CRM
              </Link>
              <Link href="/analytics" className="hover:text-gray-900">
                Signups & retention
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">User activity</h1>
            <p className="text-sm text-gray-500">When each user last signed in and what they did.</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100" />
            <button onClick={logout} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

        {data && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">
                  Users <span className="text-sm font-normal text-gray-500">· {rows.length}</span>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search email or name"
                    className="rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded-lg border border-gray-200 px-2 py-1.5">
                    <option value="all">All types</option>
                    <option value="talent">Talent</option>
                    <option value="manager">Manager</option>
                  </select>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-gray-200 px-2 py-1.5">
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        Sort: {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Signed up</th>
                    <th className="py-2 pr-4" title="Most recent recorded sign-in. Only tracked since login tracking was deployed.">Last sign-in</th>
                    <th className="py-2 pr-4 text-right" title="Sign-ins recorded since tracking started">Sign-ins</th>
                    <th className="py-2 pr-4" title="Most recent real in-app action: project, gig, message, hours, invite, work sample. Not sign-ins.">Last action</th>
                    <th className="py-2 text-right" title="Real in-app actions in the last 30 days">Actions (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{u.email}</div>
                        <div className="text-xs text-gray-500">{u.name}</div>
                      </td>
                      <td className="py-2 pr-4">{TYPE_LABEL[u.type]}</td>
                      <td className="py-2 pr-4"><When iso={u.signedUpAt} /></td>
                      <td className="py-2 pr-4"><When iso={u.lastSignInAt} /></td>
                      <td className="py-2 pr-4 text-right">{u.signInCount || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 pr-4"><When iso={u.lastActionAt} /></td>
                      <td className="py-2 text-right">{u.actions30d || <span className="text-gray-300">0</span>}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-gray-500">No users match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-gray-400">
                {data.loginTracking
                  ? `Sign-in history starts ${data.trackingSince ? new Date(data.trackingSince).toLocaleDateString() : 'when tracking was deployed'}; earlier sign-ins were not recorded, so older users show — until they sign in again.`
                  : 'Sign-in tracking is not enabled yet (migration 0020).'}{' '}
                Showing up to 500 users. Hover a time for the exact date.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
