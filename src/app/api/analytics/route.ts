import { guard, json } from '@/lib/api';
import { getConversionMetrics } from '@/lib/analytics/conversion-metrics';

export const dynamic = 'force-dynamic';

const ALLOWED_DAYS = [30, 90, 180, 365];

/** GET /api/analytics?days=90 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const requested = Number(new URL(request.url).searchParams.get('days'));
    return json(await getConversionMetrics(ALLOWED_DAYS.includes(requested) ? requested : 90));
  } catch (error) {
    console.error('Failed to compute analytics metrics:', error);
    return json({ error: 'Failed to compute analytics metrics' }, 500);
  }
}
