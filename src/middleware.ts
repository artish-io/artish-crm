import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySessionToken } from '@/lib/auth';

// /api/cron/automation checks its own CRON_SECRET; unsubscribe links are signed.
const PUBLIC_PATHS = ['/login', '/api/login', '/unsubscribe', '/api/unsubscribe', '/api/cron/automation'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (await verifySessionToken(request.cookies.get(COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
