import { guard, json, safe } from '@/lib/api';
import { runAutomation } from '@/lib/automation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Run now. Honors each rule's mode: dry run only logs, live really sends. */
export const POST = safe(async (request: Request) => {
  const denied = await guard(request);
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  return json({ results: await runAutomation(typeof b.ruleId === 'string' ? b.ruleId : undefined) });
});
