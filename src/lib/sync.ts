import { randomUUID } from 'crypto';
import type { Contact, Data, ProductInfo } from './types';

/**
 * Pulls signups and per-user product activity from the main Artish app's admin
 * API (same password gate as its admin dashboard) and merges them into contacts
 * by lowercased email. Never overwrites hand-managed SQL stages, notes or files.
 */

interface MainUser {
  id: number;
  email: string;
  name: string;
  type: 'talent' | 'manager';
  signedUpAt: string;
  lastSignInAt: string | null;
  lastActionAt: string | null;
  actions30d: number;
  steps: string[];
}

interface MainLead {
  email: string;
  name: string | null;
  firstSeenAt: string;
}

async function mainApi<T>(token: string, base: string, p: string): Promise<T> {
  const res = await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Main app ${p} failed (${res.status})`);
  return res.json();
}

export async function fetchMainAppData(): Promise<{ users: MainUser[]; leads: MainLead[] }> {
  const base = process.env.MAIN_APP_URL?.replace(/\/+$/, '');
  const password = process.env.MAIN_APP_ADMIN_PASSWORD;
  if (!base || !password) throw new Error('MAIN_APP_URL and MAIN_APP_ADMIN_PASSWORD must be set to sync');

  const auth = await fetch(`${base}/api/admin/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    cache: 'no-store',
  });
  if (!auth.ok) throw new Error(`Main app login failed (${auth.status}); check MAIN_APP_ADMIN_PASSWORD`);
  const { token } = (await auth.json()) as { token: string };

  const [users, analytics] = await Promise.all([
    mainApi<{ users: MainUser[] }>(token, base, '/api/admin/analytics/users'),
    mainApi<{ leads: { pending: MainLead[] } }>(token, base, '/api/admin/analytics?days=365'),
  ]);
  return { users: users.users, leads: analytics.leads?.pending ?? [] };
}

const key = (email: string) => email.trim().toLowerCase();

/** Applies main-app data to `data` in place. Returns counts for the UI. */
export function mergeMainAppData(data: Data, main: { users: MainUser[]; leads: MainLead[] }) {
  const byEmail = new Map(data.contacts.filter((c) => c.email).map((c) => [key(c.email), c]));
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  const blank = (email: string, name: string): Contact => ({
    id: randomUUID(),
    email: key(email),
    name,
    company: '',
    pipeline: 'mql',
    stage: 'signed_up',
    notes: '',
    source: 'sync',
    hasAccount: false,
    product: null,
    transcripts: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  });

  for (const u of main.users) {
    let c = byEmail.get(key(u.email));
    if (!c) {
      c = blank(u.email, u.name);
      data.contacts.push(c);
      byEmail.set(key(u.email), c);
      created++;
    } else {
      updated++;
    }
    const product: ProductInfo = {
      userId: u.id,
      type: u.type,
      signedUpAt: u.signedUpAt,
      lastSignInAt: u.lastSignInAt,
      lastActionAt: u.lastActionAt,
      actions30d: u.actions30d,
      steps: u.steps,
    };
    c.product = product;
    c.hasAccount = true;
    if (!c.name) c.name = u.name;
    // MQL stage is derived from the product data; SQL stages are hand-managed.
    if (c.pipeline === 'mql') c.stage = 'created_account';
    c.updatedAt = now;
  }

  for (const l of main.leads) {
    if (byEmail.has(key(l.email))) continue; // already known (maybe now has an account)
    const c = blank(l.email, l.name ?? '');
    c.createdAt = l.firstSeenAt;
    data.contacts.push(c);
    byEmail.set(key(l.email), c);
    created++;
  }

  data.lastSyncAt = now;
  return { created, updated, total: data.contacts.length };
}
