import { guard, json } from '@/lib/api';
import { getUserActivity } from '@/lib/analytics/user-activity';

export const dynamic = 'force-dynamic';

/** Per-user activity (last sign-in, last action). */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return json(await getUserActivity());
  } catch (error) {
    console.error('Failed to compute user activity:', error);
    return json({ error: 'Failed to compute user activity' }, 500);
  }
}
