import { NextResponse } from 'next/server';
import { isAuthed } from './auth';
import type { Contact, PublicContact } from './types';

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Returns a 401 response when the request has no valid session, else null. */
export async function guard(request: Request): Promise<NextResponse | null> {
  return (await isAuthed(request)) ? null : json({ error: 'Unauthorized' }, 401);
}

/** Strips internal storage paths before sending a contact to the browser. */
export function toPublic(c: Contact): PublicContact {
  return { ...c, transcripts: c.transcripts.map(({ pathname: _pathname, ...t }) => t) };
}
