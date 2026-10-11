import { randomUUID } from 'crypto';
import { guard, json, toPublic } from '@/lib/api';
import { load, mutate } from '@/lib/store';
import type { Contact, Pipeline } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const data = await load();
  return json({ contacts: data.contacts.map(toPublic), lastSyncAt: data.lastSyncAt });
}

/** Add a contact by hand (typically a sales lead who may not have an account). */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Partial<Contact>;
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!name && !email) return json({ error: 'Name or email is required' }, 400);
  const pipeline: Pipeline = body.pipeline === 'mql' ? 'mql' : 'sql';

  const now = new Date().toISOString();
  const contact: Contact = {
    id: randomUUID(),
    email,
    name,
    company: String(body.company ?? '').trim(),
    pipeline,
    stage: pipeline === 'sql' ? 'initial_discovery' : 'signed_up',
    notes: '',
    source: 'manual',
    hasAccount: false,
    product: null,
    transcripts: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const created = await mutate((data) => {
    if (email && data.contacts.some((c) => c.email === email)) return null;
    data.contacts.push(contact);
    return contact;
  });
  if (!created) return json({ error: 'A contact with that email already exists' }, 409);
  return json(toPublic(created), 201);
}
