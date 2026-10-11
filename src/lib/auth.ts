/** Edge-safe (used by middleware): Web Crypto only, no Node imports. */

export const COOKIE = 'crm_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const enc = new TextEncoder();

/** Login fails closed: with no password or a weak secret configured, nobody gets in. */
export function authConfigured(): boolean {
  return !!process.env.CRM_PASSWORD && (process.env.SESSION_SECRET ?? '').length >= 16;
}

function b64url(buf: ArrayBuffer): string {
  let bin = '';
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(process.env.SESSION_SECRET ?? ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}

export async function createSessionToken(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  return `${exp}.${await sign(exp)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = await sign(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};

/** Route-handler guard (defense in depth on top of the middleware). */
export async function isAuthed(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return verifySessionToken(match?.slice(COOKIE.length + 1));
}
