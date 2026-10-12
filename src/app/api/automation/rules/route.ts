import { randomUUID } from 'crypto';
import { guard, json, safe } from '@/lib/api';
import { listTemplates, saveRule } from '@/lib/automation-repo';
import { applyRuleInput } from '@/lib/rule-input';
import type { EmailRule } from '@/lib/types';

export const POST = safe(async (request: Request) => {
  const denied = await guard(request);
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const blank: EmailRule = {
    id: `rule_${randomUUID().slice(0, 8)}`, name: 'New rule', templateId: '', trigger: 'days_after_account_created',
    days: 3, windowDays: 3, userType: null, skipIfSteps: [], enabled: false, live: false, createdAt: now, updatedAt: now,
  };
  const rule = applyRuleInput(blank, { ...b, mode: 'off' });
  if (typeof rule === 'string') return json({ error: rule }, 400);
  if (!(await listTemplates()).some((t) => t.id === rule.templateId)) return json({ error: 'Pick a template' }, 400);
  await saveRule(rule);
  return json(rule, 201);
});
