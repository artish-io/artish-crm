import { guard, json, safe, toPublic } from '@/lib/api';
import { deleteTranscript } from '@/lib/files';
import { mutate } from '@/lib/store';
import { stagesFor, type Pipeline } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

async function patchHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const result = await mutate((data) => {
    const c = data.contacts.find((x) => x.id === id);
    if (!c) return { status: 404 as const };

    if (typeof body.name === 'string') c.name = body.name.trim();
    if (typeof body.company === 'string') c.company = body.company.trim();
    if (typeof body.notes === 'string') c.notes = body.notes;
    if (typeof body.archived === 'boolean') c.archived = body.archived;
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (email && data.contacts.some((x) => x.id !== id && x.email === email)) return { status: 409 as const };
      // The email is what links a contact to a product account, so only edit it for hand-added ones.
      if (c.source === 'manual') c.email = email;
    }

    if (body.pipeline === 'mql' || body.pipeline === 'sql') {
      const pipeline: Pipeline = body.pipeline;
      if (pipeline !== c.pipeline) {
        c.pipeline = pipeline;
        c.stage = pipeline === 'sql' ? 'initial_discovery' : c.hasAccount ? 'created_account' : 'signed_up';
      }
    }
    if (typeof body.stage === 'string') {
      // MQL stages come from the product data; only SQL stages are set by hand.
      if (c.pipeline === 'sql' && stagesFor('sql').some((s) => s.id === body.stage)) c.stage = body.stage;
    }

    c.updatedAt = new Date().toISOString();
    return { status: 200 as const, contact: c };
  });

  if (result.status === 404) return json({ error: 'Not found' }, 404);
  if (result.status === 409) return json({ error: 'A contact with that email already exists' }, 409);
  return json(toPublic(result.contact));
}

/** Only hand-added contacts can be deleted; synced ones are archived so a sync does not recreate them. */
async function deleteHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;

  const result = await mutate((data) => {
    const idx = data.contacts.findIndex((x) => x.id === id);
    if (idx === -1) return { status: 404 as const };
    if (data.contacts[idx].source !== 'manual') return { status: 400 as const };
    const [removed] = data.contacts.splice(idx, 1);
    return { status: 200 as const, files: removed.transcripts.flatMap((t) => (t.pathname ? [t.pathname] : [])) };
  });

  if (result.status === 404) return json({ error: 'Not found' }, 404);
  if (result.status === 400) return json({ error: 'Synced contacts cannot be deleted; archive them instead' }, 400);
  await Promise.all(result.files.map(deleteTranscript));
  return json({ ok: true });
}

export const PATCH = safe(patchHandler);

export const DELETE = safe(deleteHandler);
