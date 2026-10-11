import { guard, json } from '@/lib/api';
import { mutate } from '@/lib/store';
import { fetchMainAppData, mergeMainAppData } from '@/lib/sync';

export const dynamic = 'force-dynamic';

/** Pull signups + product activity from the main app and merge into contacts. */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  try {
    const main = await fetchMainAppData();
    const summary = await mutate((data) => mergeMainAppData(data, main));
    return json(summary);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sync failed' }, 502);
  }
}
