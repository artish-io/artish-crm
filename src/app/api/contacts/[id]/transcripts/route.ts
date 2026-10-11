import { randomUUID } from 'crypto';
import { guard, json, toPublic } from '@/lib/api';
import { MAX_UPLOAD_BYTES, deleteTranscript, saveTranscript } from '@/lib/files';
import { load, mutate } from '@/lib/store';
import type { Transcript } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

/** Add a transcript: multipart `file` upload, or JSON `{ link, name }` for a Fathom/Otter/Zoom URL. */
export async function POST(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;

  const existing = (await load()).contacts.find((c) => c.id === id);
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

  const updated = await mutate((data) => {
    const c = data.contacts.find((x) => x.id === id);
    if (!c) return null;
    c.transcripts.push(transcript);
    c.updatedAt = new Date().toISOString();
    return c;
  });
  if (!updated) {
    if (transcript.pathname) await deleteTranscript(transcript.pathname);
    return json({ error: 'Not found' }, 404);
  }
  return json(toPublic(updated), 201);
}

export async function DELETE(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const fileId = new URL(request.url).searchParams.get('fileId');
  if (!fileId) return json({ error: 'fileId is required' }, 400);

  const result = await mutate((data) => {
    const c = data.contacts.find((x) => x.id === id);
    const idx = c ? c.transcripts.findIndex((t) => t.id === fileId) : -1;
    if (!c || idx === -1) return null;
    const [removed] = c.transcripts.splice(idx, 1);
    c.updatedAt = new Date().toISOString();
    return { contact: c, pathname: removed.pathname };
  });
  if (!result) return json({ error: 'Not found' }, 404);
  if (result.pathname) await deleteTranscript(result.pathname);
  return json(toPublic(result.contact));
}
