import { query } from './sql';
import type { EmailRule, EmailSend, EmailTemplate } from './types';

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

const templateFrom = (r: any): EmailTemplate => ({
  id: r.id, name: r.name, subject: r.subject, body: r.body, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

const ruleFrom = (r: any): EmailRule => ({
  id: r.id, name: r.name, templateId: r.template_id, trigger: r.trigger_type, days: r.days, windowDays: r.window_days,
  userType: r.user_type ?? null, skipIfSteps: r.skip_if_steps ?? [], enabled: r.enabled, live: r.live,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

const sendFrom = (r: any): EmailSend => ({
  id: r.id, ruleId: r.rule_id, contactId: r.contact_id, toEmail: r.to_email, subject: r.subject, status: r.status,
  error: r.error ?? null, resendId: r.resend_id ?? null, createdAt: iso(r.created_at),
});

export async function listTemplates(): Promise<EmailTemplate[]> {
  return (await query(`SELECT * FROM email_templates ORDER BY created_at`)).rows.map(templateFrom);
}

export async function saveTemplate(t: EmailTemplate): Promise<void> {
  await query(
    `INSERT INTO email_templates (id, name, subject, body, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
    [t.id, t.name, t.subject, t.body, t.createdAt, t.updatedAt],
  );
}

export async function deleteTemplate(id: string): Promise<'deleted' | 'in_use'> {
  const used = await query(`SELECT 1 FROM email_rules WHERE template_id = $1 LIMIT 1`, [id]);
  if (used.rows.length) return 'in_use';
  await query(`DELETE FROM email_templates WHERE id = $1`, [id]);
  return 'deleted';
}

export async function listRules(): Promise<EmailRule[]> {
  return (await query(`SELECT * FROM email_rules ORDER BY created_at`)).rows.map(ruleFrom);
}

export async function getRule(id: string): Promise<EmailRule | null> {
  const { rows } = await query(`SELECT * FROM email_rules WHERE id = $1`, [id]);
  return rows[0] ? ruleFrom(rows[0]) : null;
}

export async function saveRule(r: EmailRule): Promise<void> {
  await query(
    `INSERT INTO email_rules (id, name, template_id, trigger_type, days, window_days, user_type, skip_if_steps, enabled, live, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, template_id = EXCLUDED.template_id, trigger_type = EXCLUDED.trigger_type,
       days = EXCLUDED.days, window_days = EXCLUDED.window_days, user_type = EXCLUDED.user_type, skip_if_steps = EXCLUDED.skip_if_steps,
       enabled = EXCLUDED.enabled, live = EXCLUDED.live, updated_at = EXCLUDED.updated_at`,
    [r.id, r.name, r.templateId, r.trigger, r.days, r.windowDays, r.userType, JSON.stringify(r.skipIfSteps), r.enabled, r.live, r.createdAt, r.updatedAt],
  );
}

export async function deleteRule(id: string): Promise<void> {
  await query(`DELETE FROM email_rules WHERE id = $1`, [id]);
}

export async function listSends(limit = 100): Promise<EmailSend[]> {
  return (await query(`SELECT * FROM email_sends ORDER BY created_at DESC LIMIT $1`, [limit])).rows.map(sendFrom);
}

/** Real sends (sent or still pending) since `sinceIso`, used for the minimum gap between emails to one contact. */
export async function recentRealSends(sinceIso: string): Promise<EmailSend[]> {
  const { rows } = await query(`SELECT * FROM email_sends WHERE status IN ('sent','pending') AND created_at >= $1`, [sinceIso]);
  return rows.map(sendFrom);
}

type NewSend = { id: string; ruleId: string; contactId: string; toEmail: string; subject: string };

/** Logs what a dry run WOULD send, once per (rule, contact). Returns false if already logged or really sent. */
export async function recordDryRun(s: NewSend): Promise<boolean> {
  const { rows } = await query(
    `INSERT INTO email_sends (id, rule_id, contact_id, to_email, subject, status, created_at)
     SELECT $1,$2,$3,$4,$5,'dry_run',$6
     WHERE NOT EXISTS (SELECT 1 FROM email_sends WHERE rule_id = $2 AND contact_id = $3)
     RETURNING id`,
    [s.id, s.ruleId, s.contactId, s.toEmail, s.subject, new Date().toISOString()],
  );
  return rows.length > 0;
}

/**
 * Claims the one real send for (rule, contact). The unique index makes this atomic, so two
 * overlapping runs can never both send. Returns false if someone already claimed it.
 */
export async function claimSend(s: NewSend): Promise<boolean> {
  const { rows } = await query(
    `INSERT INTO email_sends (id, rule_id, contact_id, to_email, subject, status, created_at)
     VALUES ($1,$2,$3,$4,$5,'pending',$6)
     ON CONFLICT (rule_id, contact_id) WHERE status <> 'dry_run' DO NOTHING
     RETURNING id`,
    [s.id, s.ruleId, s.contactId, s.toEmail, s.subject, new Date().toISOString()],
  );
  return rows.length > 0;
}

export async function finishSend(id: string, patch: { status: 'sent' | 'failed'; error?: string; resendId?: string }): Promise<void> {
  await query(`UPDATE email_sends SET status = $2, error = $3, resend_id = $4 WHERE id = $1`, [
    id, patch.status, patch.error ?? null, patch.resendId ?? null,
  ]);
}

export async function suppressedEmails(): Promise<Set<string>> {
  const { rows } = await query(`SELECT email FROM email_suppressions`);
  return new Set(rows.map((r) => String(r.email).toLowerCase()));
}

export async function suppress(email: string, reason: string): Promise<void> {
  await query(
    `INSERT INTO email_suppressions (email, reason, created_at) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase(), reason, new Date().toISOString()],
  );
}
