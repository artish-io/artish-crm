import { guard, json } from '@/lib/api';
import { fetchMainAppData, syncFromMainApp } from '@/lib/sync';

export const dynamic = 'force-dynamic';

/** Pull signups + product activity from the main app and merge into contacts. */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  try {
    return json(await syncFromMainApp(await fetchMainAppData()));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sync failed' }, 502);
  }
}
