import { timingSafeEqual } from 'crypto';
import { json, safe } from '@/lib/api';
import { runAutomation } from '@/lib/automation';
import { fetchMainAppData, syncFromMainApp } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron: refresh contacts from the main DB, then run every enabled rule. */
export const GET = safe(async (request: Request) => {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
  let sync: unknown;
  try {
    sync = await syncFromMainApp(await fetchMainAppData());
  } catch (e) {
    // Fall back to the last synced data rather than skipping the run.
    sync = { error: e instanceof Error ? e.message : 'sync failed' };
  }
  return json({ sync, results: await runAutomation() });
});
