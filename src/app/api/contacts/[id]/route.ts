import { guard, json, safe, toPublic } from '@/lib/api';
import { deleteTranscript } from '@/lib/files';
import { deleteContact, getContact, updateContact } from '@/lib/repo';
import { isDuplicate } from '@/lib/sql';
import { stagesFor, type Pipeline } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

async function patchHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const updated = await updateContact(id, (c) => {
      if (typeof body.name === 'string') c.name = body.name.trim();
      if (typeof body.company === 'string') c.company = body.company.trim();
      if (typeof body.notes === 'string') c.notes = body.notes;
      if (typeof body.archived === 'boolean') c.archived = body.archived;
      // The email is what links a contact to a product account, so only edit it for hand-added ones.
      if (typeof body.email === 'string' && c.source === 'manual') c.email = body.email.trim().toLowerCase();

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
    });
    if (!updated) return json({ error: 'Not found' }, 404);
    return json(toPublic(updated.contact));
  } catch (e) {
    if (isDuplicate(e)) return json({ error: 'A contact with that email already exists' }, 409);
    throw e;
  }
}

/** Only hand-added contacts can be deleted; synced ones are archived so a sync does not recreate them. */
async function deleteHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;

  const contact = await getContact(id);
  if (!contact) return json({ error: 'Not found' }, 404);
  if (contact.source !== 'manual') return json({ error: 'Synced contacts cannot be deleted; archive them instead' }, 400);

  await deleteContact(id);
  await Promise.all(contact.transcripts.flatMap((t) => (t.pathname ? [deleteTranscript(t.pathname)] : [])));
  return json({ ok: true });
}

export const PATCH = safe(patchHandler);
export const DELETE = safe(deleteHandler);
