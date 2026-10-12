import { randomUUID } from 'crypto';
import { emailConfig, sendEmail, unsubscribeUrl } from './email';
import { buildVars, renderEmail } from './render';
import {
  claimSend, finishSend, getRule, listRules, listTemplates, recentRealSends, recordDryRun, suppressedEmails,
} from './automation-repo';
import { listContacts } from './repo';
import type { Contact, EmailRule } from './types';

const DAY = 86_400_000;
/** One real email per contact per this many days, across all rules. */
const MIN_GAP_DAYS = 2;
/** Safety valve: most real emails a single run may send. */
const MAX_LIVE_PER_RUN = 50;

export interface RuleResult {
  ruleId: string;
  name: string;
  mode: 'dry_run' | 'live';
  eligible: number;
  sent: number;
  failed: number;
  wouldSend: number;
  skipped: string | null;
}

/** The moment the rule's clock starts for this contact, or null if the trigger doesn't apply. */
function anchor(rule: EmailRule, c: Contact): number | null {
  if (rule.trigger === 'days_after_account_created') {
    if (!c.hasAccount || !c.product) return null;
    if (rule.userType && c.product.type !== rule.userType) return null;
    return Date.parse(c.product.signedUpAt);
  }
  if (c.hasAccount) return null;
  return Date.parse(c.createdAt);
}

export function isDue(rule: EmailRule, c: Contact, now: number): boolean {
  if (c.archived || !c.email.includes('@')) return false;
  const start = anchor(rule, c);
  if (start === null || Number.isNaN(start)) return false;
  const age = (now - start) / DAY;
  if (age < rule.days || age > rule.days + rule.windowDays) return false;
  const done = c.product?.steps ?? [];
  return !rule.skipIfSteps.some((s) => done.includes(s));
}

export async function runRule(rule: EmailRule, opts: { now?: number } = {}): Promise<RuleResult> {
  const now = opts.now ?? Date.now();
  const mode = rule.live ? 'live' : 'dry_run';
  const result: RuleResult = { ruleId: rule.id, name: rule.name, mode, eligible: 0, sent: 0, failed: 0, wouldSend: 0, skipped: null };

  const template = (await listTemplates()).find((t) => t.id === rule.templateId);
  if (!template) return { ...result, skipped: 'template missing' };
  const cfg = emailConfig();
  if (rule.live && cfg.problem) return { ...result, skipped: cfg.problem };

  const [contacts, suppressed, recent] = await Promise.all([
    listContacts(), suppressedEmails(), recentRealSends(new Date(now - MIN_GAP_DAYS * DAY).toISOString()),
  ]);
  const recentlyEmailed = new Set(recent.map((s) => s.contactId));

  let liveBudget = MAX_LIVE_PER_RUN;
  for (const c of contacts) {
    if (!isDue(rule, c, now) || suppressed.has(c.email.toLowerCase())) continue;
    result.eligible++;
    const rendered = renderEmail(template, buildVars(c), rule.live ? unsubscribeUrl(c.email) : '');
    const send = { id: randomUUID(), ruleId: rule.id, contactId: c.id, toEmail: c.email, subject: rendered.subject };

    if (!rule.live) {
      if (await recordDryRun(send)) result.wouldSend++;
      continue;
    }
    if (recentlyEmailed.has(c.id) || liveBudget <= 0) continue;
    if (!(await claimSend(send))) continue; // already sent (or being sent) by another run
    liveBudget--;
    try {
      const { id } = await sendEmail({
        to: c.email, ...rendered, unsubscribeUrl: unsubscribeUrl(c.email), idempotencyKey: `crm-${rule.id}-${c.id}`,
      });
      await finishSend(send.id, { status: 'sent', resendId: id });
      result.sent++;
    } catch (e) {
      await finishSend(send.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
      result.failed++;
    }
  }
  return result;
}

/** Runs every enabled rule (or just one). */
export async function runAutomation(onlyRuleId?: string): Promise<RuleResult[]> {
  const rules = onlyRuleId ? [await getRule(onlyRuleId)].filter((r): r is EmailRule => !!r) : (await listRules()).filter((r) => r.enabled);
  const out: RuleResult[] = [];
  for (const rule of rules) out.push(await runRule(rule));
  return out;
}
