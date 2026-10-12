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

/** Wraps a route handler so unexpected errors are logged and returned as JSON instead of a bare 500. */
export function safe<A extends unknown[]>(handler: (request: Request, ...args: A) => Promise<Response>) {
  return async (request: Request, ...args: A): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (e) {
      console.error(`${request.method} ${new URL(request.url).pathname} failed:`, e);
      return json({ error: e instanceof Error ? `${e.name}: ${e.message}` : 'Unexpected error' }, 500);
    }
  };
}
