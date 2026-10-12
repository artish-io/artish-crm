import type { Query } from './sql';

/**
 * Seeds one starter template and one rule, once (flagged in `meta`, so deleting
 * them never brings them back). The rule is created OFF: nothing is evaluated or sent
 * until you switch it to dry run or live in the Automation page.
 */
const TEMPLATE_ID = 'tpl_checkin_day3';
const RULE_ID = 'rule_checkin_day3';

const BODY = `Hi {{firstName}},

Thanks for signing up for Artish. I wanted to check in and see how it is going so far.

If you got stuck anywhere or something was not clear, just reply to this email. Happy to help, or hop on a quick call if that is easier.

Thanks,
The Artish team`;

// Anyone who has already done real work in the product is not nudged.
const ACTIVE_STEPS = ['project_created', 'invite_sent', 'gig_posted', 'hours_logged', 'gig_applied', 'work_sample', 'message_sent'];

export async function seedEmailDefaults(q: Query): Promise<void> {
  if ((await q(`SELECT 1 FROM meta WHERE key = 'email_seed_v1'`)).rows.length) return;
  const now = new Date().toISOString();
  await q(
    `INSERT INTO email_templates (id, name, subject, body, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT DO NOTHING`,
    [TEMPLATE_ID, 'Day 3 check-in', 'How is Artish going, {{firstName}}?', BODY, now],
  );
  await q(
    `INSERT INTO email_rules (id, name, template_id, trigger_type, days, window_days, user_type, skip_if_steps, enabled, live, created_at, updated_at)
     VALUES ($1,$2,$3,'days_after_account_created',3,3,NULL,$4::jsonb,false,false,$5,$5) ON CONFLICT DO NOTHING`,
    [RULE_ID, 'Check in 3 days after sign-up', TEMPLATE_ID, JSON.stringify(ACTIVE_STEPS), now],
  );
  await q(`INSERT INTO meta (key, value) VALUES ('email_seed_v1', $1::jsonb)`, [JSON.stringify({ at: now })]);
}
