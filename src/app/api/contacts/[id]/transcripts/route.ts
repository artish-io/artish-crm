import { randomUUID } from 'crypto';
import { guard, json, safe, toPublic } from '@/lib/api';
import { MAX_UPLOAD_BYTES, deleteTranscript, saveTranscript } from '@/lib/files';
import { getContact, updateContact } from '@/lib/repo';
import type { Transcript } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

/** Add a transcript: multipart `file` upload, or JSON `{ link, name }` for a Fathom/Otter/Zoom URL. */
async function postHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;

  const existing = await getContact(id);
  if (!existing) return json({ error: 'Not found' }, 404);

  const transcript: Transcript = { id: randomUUID(), name: '', kind: 'file', uploadedAt: new Date().toISOString() };

  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || file.size === 0) return json({ error: 'No file provided' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Add a link instead.` }, 413);
    }
    transcript.name = file.name;
    transcript.size = file.size;
    transcript.pathname = await saveTranscript(id, transcript.id, file);
  } else {
    const body = (await request.json().catch(() => ({}))) as { link?: string; name?: string };
    let url: URL;
    try {
      url = new URL(String(body.link ?? ''));
    } catch {
      return json({ error: 'A valid link is required' }, 400);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return json({ error: 'Link must be http(s)' }, 400);
    transcript.kind = 'link';
    transcript.url = url.toString();
    transcript.name = String(body.name ?? '').trim() || url.hostname;
  }

  const updated = await updateContact(id, (c) => {
    c.transcripts.push(transcript);
    c.updatedAt = new Date().toISOString();
  });
  if (!updated) {
    if (transcript.pathname) await deleteTranscript(transcript.pathname);
    return json({ error: 'Not found' }, 404);
  }
  return json(toPublic(updated.contact), 201);
}

async function deleteHandler(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const fileId = new URL(request.url).searchParams.get('fileId');
  if (!fileId) return json({ error: 'fileId is required' }, 400);

  const result = await updateContact(id, (c) => {
    const idx = c.transcripts.findIndex((t) => t.id === fileId);
    if (idx === -1) return null;
    const [removed] = c.transcripts.splice(idx, 1);
    c.updatedAt = new Date().toISOString();
    return removed.pathname ?? '';
  });
  if (!result || result.result === null) return json({ error: 'Not found' }, 404);
  if (result.result) await deleteTranscript(result.result);
  return json(toPublic(result.contact));
}

export const POST = safe(postHandler);

export const DELETE = safe(deleteHandler);
