import { guard, json, safe } from '@/lib/api';
import { deleteRule, getRule, listTemplates, saveRule } from '@/lib/automation-repo';
import { emailConfig } from '@/lib/email';
import { applyRuleInput } from '@/lib/rule-input';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = safe(async (request: Request, { params }: Ctx) => {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  const existing = await getRule(id);
  if (!existing) return json({ error: 'Not found' }, 404);
  const rule = applyRuleInput(existing, await request.json().catch(() => ({})));
  if (typeof rule === 'string') return json({ error: rule }, 400);
  if (!(await listTemplates()).some((t) => t.id === rule.templateId)) return json({ error: 'Pick a template' }, 400);
  if (rule.live && !existing.live) {
    const problem = emailConfig().problem;
    if (problem) return json({ error: `Can't go live: ${problem}` }, 400);
  }
  await saveRule(rule);
  return json(rule);
});

export const DELETE = safe(async (request: Request, { params }: Ctx) => {
  const denied = await guard(request);
  if (denied) return denied;
  await deleteRule((await params).id);
  return json({ ok: true });
});
