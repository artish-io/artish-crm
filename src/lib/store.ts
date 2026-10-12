import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { get, head, put, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import type { Data } from './types';

/**
 * All contacts live in ONE private JSON blob (crm/data.json). Writes are
 * optimistic: we send the ETag we read, and retry if someone else saved first.
 * Without BLOB_READ_WRITE_TOKEN (local dev) the same JSON lives in ./.data.
 */
const BLOB_PATH = 'crm/data.json';
const FILE_PATH = path.join(process.cwd(), '.data', 'crm.json');

export const usingBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const empty = (): Data => ({ version: 1, contacts: [], lastSyncAt: null });
const hash = (text: string) => createHash('sha1').update(text).digest('hex');

class ConflictError extends Error {}

async function read(): Promise<{ data: Data; etag: string | null }> {
  if (usingBlob()) {
    // The ETag must come from head() (the Blob API's own value, which put's ifMatch compares against).
    // The HTTP etag header on a read can be a different representation and never matches.
    // Reading the ETag first is safe: if the blob changes before we write, the write fails and we retry.
    let etag: string;
    try {
      etag = (await head(BLOB_PATH)).etag;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return { data: empty(), etag: null };
      throw e;
    }
    const res = await get(BLOB_PATH, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error('Data blob disappeared while reading');
    return { data: JSON.parse(await new Response(res.stream).text()), etag };
  }
  try {
    const text = await fs.readFile(FILE_PATH, 'utf8');
    return { data: JSON.parse(text), etag: hash(text) };
  } catch {
    return { data: empty(), etag: null };
  }
}

async function write(data: Data, etag: string | null): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  if (usingBlob()) {
    try {
      await put(BLOB_PATH, body, {
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : {}),
      });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new ConflictError();
      console.error('Blob write failed:', e);
      throw e;
    }
    return;
  }
  const current = await read();
  if ((current.etag ?? null) !== (etag ?? null)) throw new ConflictError();
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, body);
}

export async function load(): Promise<Data> {
  return (await read()).data;
}

/** Read-modify-write with conflict retry. `fn` must be safe to run more than once. */
export async function mutate<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, etag } = await read();
    const result = await fn(data);
    try {
      await write(data, etag);
      return result;
    } catch (e) {
      if (e instanceof ConflictError) continue;
      throw e;
    }
  }
  throw new Error('Could not save: the stored data kept changing (ETag mismatch on every attempt)');
}
