import { guard, json, safe } from '@/lib/api';
import { emailConfig } from '@/lib/email';
import { listRules, listSends, listTemplates } from '@/lib/automation-repo';

export const dynamic = 'force-dynamic';

export const GET = safe(async (request: Request) => {
  const denied = await guard(request);
  if (denied) return denied;
  const cfg = emailConfig();
  const [templates, rules, sends] = await Promise.all([listTemplates(), listRules(), listSends(100)]);
  return json({
    templates, rules, sends,
    config: { from: cfg.from, replyTo: cfg.replyTo, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey, cronSecret: cfg.cronSecret, problem: cfg.problem },
  });
});
