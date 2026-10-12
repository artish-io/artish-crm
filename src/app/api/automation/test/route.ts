import { guard, json, safe } from '@/lib/api';
import { emailConfig, sendEmail, unsubscribeUrl } from '@/lib/email';
import { buildVars, renderEmail } from '@/lib/render';

/** Sends ONE test email to an address you type, using sample data. Never touches contacts or the send log. */
export const POST = safe(async (request: Request) => {
  const denied = await guard(request);
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  const to = String(b.to ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'Enter a valid email address' }, 400);
  const problem = emailConfig().problem;
  if (problem) return json({ error: problem }, 400);
  const r = renderEmail(
    { subject: `[Test] ${String(b.subject ?? '')}`, body: String(b.body ?? '') },
    buildVars({ name: 'Alex Example', email: to, company: 'Example Co' }),
    unsubscribeUrl(to),
  );
  const { id } = await sendEmail({ to, ...r, unsubscribeUrl: unsubscribeUrl(to) });
  return json({ ok: true, id });
});
