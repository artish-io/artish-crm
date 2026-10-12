import { guard, json } from '@/lib/api';
import { openTranscript } from '@/lib/files';
import { getContact } from '@/lib/repo';

type Ctx = { params: Promise<{ contactId: string; fileId: string }> };

/** Streams a private transcript. The storage path is looked up by id, never taken from the request. */
export async function GET(request: Request, { params }: Ctx) {
  const denied = await guard(request);
  if (denied) return denied;
  const { contactId, fileId } = await params;

  const contact = await getContact(contactId);
  const transcript = contact?.transcripts.find((t) => t.id === fileId);
  if (!transcript?.pathname) return json({ error: 'Not found' }, 404);

  const file = await openTranscript(transcript.pathname);
  if (!file) return json({ error: 'File missing from storage' }, 404);

  return new Response(file.stream, {
    headers: {
      // Always a download, never rendered inline, so an uploaded .html cannot run in this origin.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(transcript.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
