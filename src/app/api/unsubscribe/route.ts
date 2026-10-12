import { suppress } from '@/lib/automation-repo';
import { verifyUnsubToken } from '@/lib/email';
import { safe } from '@/lib/api';

async function handle(email: string | null, token: string | null) {
  if (!email || !token || !verifyUnsubToken(email, token)) return false;
  await suppress(email, 'unsubscribed');
  return true;
}

/** One-click unsubscribe (RFC 8058): mail clients POST here. */
export const POST = safe(async (request: Request) => {
  const u = new URL(request.url);
  const ok = await handle(u.searchParams.get('e'), u.searchParams.get('t'));
  return new Response(ok ? 'Unsubscribed' : 'Invalid link', { status: ok ? 200 : 400 });
});
