import { NextResponse } from 'next/server';
import { COOKIE, authConfigured, createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { passwordMatches } from '@/lib/password';

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'Login is disabled: set CRM_PASSWORD and a SESSION_SECRET of at least 16 characters.' },
      { status: 503 },
    );
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== 'string' || !passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 600)); // blunt brute-force speed bump
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}
