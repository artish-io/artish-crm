import { randomUUID } from 'crypto';
import { guard, json, safe } from '@/lib/api';
import { saveTemplate } from '@/lib/automation-repo';

export const POST = safe(async (request: Request) => {
  const denied = await guard(request);
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const t = {
    id: `tpl_${randomUUID().slice(0, 8)}`,
    name: String(b.name ?? '').trim() || 'Untitled template',
    subject: String(b.subject ?? ''), body: String(b.body ?? ''), createdAt: now, updatedAt: now,
  };
  await saveTemplate(t);
  return json(t, 201);
});
