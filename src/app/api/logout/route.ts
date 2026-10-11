import { NextResponse } from 'next/server';
import { COOKIE, sessionCookieOptions } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
