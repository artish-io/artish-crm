import { promises as fs } from 'fs';
import path from 'path';
import { del, get, put } from '@vercel/blob';
import { usingBlob } from './store';

/** Transcript file storage: private Blob in production, ./.data/uploads in local dev. */
const LOCAL_DIR = path.join(process.cwd(), '.data', 'uploads');

/** Vercel functions reject request bodies over ~4.5 MB; stay under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const safeName = (name: string) => name.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'file';

export async function saveTranscript(contactId: string, id: string, file: File): Promise<string> {
  const pathname = `transcripts/${contactId}/${id}-${safeName(file.name)}`;
  if (usingBlob()) {
    await put(pathname, file, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type || 'application/octet-stream',
    });
  } else {
    const target = path.join(LOCAL_DIR, pathname);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
  }
  return pathname;
}

export async function openTranscript(
  pathname: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (usingBlob()) {
    const res = await get(pathname, { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { stream: res.stream, contentType: res.blob.contentType ?? 'application/octet-stream' };
  }
  try {
    const buf = await fs.readFile(path.join(LOCAL_DIR, pathname));
    return { stream: new Response(buf).body as ReadableStream<Uint8Array>, contentType: 'application/octet-stream' };
  } catch {
    return null;
  }
}

export async function deleteTranscript(pathname: string): Promise<void> {
  try {
    if (usingBlob()) await del(pathname);
    else await fs.rm(path.join(LOCAL_DIR, pathname), { force: true });
  } catch (e) {
    console.warn('Failed to delete transcript file:', e instanceof Error ? e.message : e);
  }
}
