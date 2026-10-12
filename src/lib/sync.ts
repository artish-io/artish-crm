import { randomUUID } from 'crypto';
import { getConversionMetrics } from './analytics/conversion-metrics';
import { getUserActivity } from './analytics/user-activity';
import { listContacts, saveSynced } from './repo';
import type { Contact, Data, ProductInfo } from './types';

/**
 * Reads signups and per-user product activity straight from the main Artish
 * database (read-only) and merges them into contacts
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

export async function fetchMainAppData(): Promise<{ users: MainUser[]; leads: MainLead[] }> {
  const [activity, metrics] = await Promise.all([getUserActivity(), getConversionMetrics(365)]);
  return { users: activity.users, leads: metrics.leads.pending };
}

const key = (email: string) => email.trim().toLowerCase();

/** Applies main-app data to `data` in place. Returns counts for the UI. */
export function mergeMainAppData(data: Data, main: { users: MainUser[]; leads: MainLead[] }) {
  const byEmail = new Map(data.contacts.filter((c) => c.email).map((c) => [key(c.email), c]));
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const touched = new Set<Contact>();

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
    touched.add(c);
  }

  for (const l of main.leads) {
    if (byEmail.has(key(l.email))) continue; // already known (maybe now has an account)
    const c = blank(l.email, l.name ?? '');
    c.createdAt = l.firstSeenAt;
    data.contacts.push(c);
    byEmail.set(key(l.email), c);
    created++;
    touched.add(c);
  }

  data.lastSyncAt = now;
  return { created, updated, total: data.contacts.length, touched: [...touched] };
}

/** Merges main-app data into the stored contacts and saves only what changed. */
export async function syncFromMainApp(main: { users: MainUser[]; leads: MainLead[] }) {
  const data: Data = { version: 1, contacts: await listContacts(), lastSyncAt: null };
  const { touched, ...summary } = mergeMainAppData(data, main);
  await saveSynced(touched, data.lastSyncAt!);
  return summary;
}
