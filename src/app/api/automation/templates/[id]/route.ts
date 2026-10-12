import { guard, json, safe } from '@/lib/api';
import { deleteTemplate, listTemplates, saveTemplate } from '@/lib/automation-repo';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = safe(async (request: Request, { params }: Ctx) => {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const existing = (await listTemplates()).find((t) => t.id === id);
  if (!existing) return json({ error: 'Not found' }, 404);
  const b = await request.json().catch(() => ({}));
  const t = {
    ...existing,
    name: typeof b.name === 'string' ? b.name.trim() || existing.name : existing.name,
    subject: typeof b.subject === 'string' ? b.subject : existing.subject,
    body: typeof b.body === 'string' ? b.body : existing.body,
    updatedAt: new Date().toISOString(),
  };
  await saveTemplate(t);
  return json(t);
});

export const DELETE = safe(async (request: Request, { params }: Ctx) => {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  return (await deleteTemplate(id)) === 'in_use'
    ? json({ error: 'A rule uses this template. Delete or change the rule first.' }, 409)
    : json({ ok: true });
});
