import { randomUUID } from 'crypto';
import { guard, json, safe, toPublic } from '@/lib/api';
import { insertContact, lastSyncAt, listContacts } from '@/lib/repo';
import { isDuplicate } from '@/lib/sql';
import type { Contact, Pipeline } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getHandler(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const [contacts, synced] = await Promise.all([listContacts(), lastSyncAt()]);
  return json({ contacts: contacts.map(toPublic), lastSyncAt: synced });
}

/** Add a contact by hand (typically a sales lead who may not have an account). */
async function postHandler(request: Request) {
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

  try {
    await insertContact(contact);
  } catch (e) {
    if (isDuplicate(e)) return json({ error: 'A contact with that email already exists' }, 409);
    throw e;
  }
  return json(toPublic(contact), 201);
}

export const GET = safe(getHandler);
export const POST = safe(postHandler);
