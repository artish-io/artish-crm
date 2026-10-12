export type Pipeline = 'mql' | 'sql';

export interface StageDef {
  id: string;
  label: string;
}

/** Marketing-qualified: derived from the product data (has an account or not). */
export const MQL_STAGES: StageDef[] = [
  { id: 'signed_up', label: 'Signed up (no account)' },
  { id: 'created_account', label: 'Created account' },
];

/** Sales-qualified: moved by hand. */
export const SQL_STAGES: StageDef[] = [
  { id: 'initial_discovery', label: 'Initial discovery' },
  { id: 'post_demo', label: 'Post-demo' },
  { id: 'close', label: 'Close' },
  { id: 'sustained', label: 'Sustained' },
];

export const stagesFor = (p: Pipeline) => (p === 'mql' ? MQL_STAGES : SQL_STAGES);

/**
 * Feature checklist for contacts that have an account. `kind` must match the
 * step kinds returned by the main app's /api/admin/analytics/users.
 */
export const CHECKLIST: { kind: string; label: string; types: ('talent' | 'manager')[] }[] = [
  { kind: 'tool_connected', label: 'Connected a tool', types: ['manager', 'talent'] },
  { kind: 'project_created', label: 'Created a project', types: ['manager'] },
  { kind: 'invite_sent', label: 'Invited team', types: ['manager'] },
  { kind: 'gig_posted', label: 'Posted a gig', types: ['manager'] },
  { kind: 'payment_added', label: 'Added a payment method', types: ['manager'] },
  { kind: 'hours_reviewed', label: 'Reviewed hours', types: ['manager'] },
  { kind: 'work_sample', label: 'Added a work sample', types: ['talent'] },
  { kind: 'stripe_connected', label: 'Connected Stripe payouts', types: ['talent'] },
  { kind: 'gig_applied', label: 'Applied to a gig', types: ['talent'] },
  { kind: 'hours_logged', label: 'Logged hours', types: ['talent'] },
  { kind: 'message_sent', label: 'Sent a message', types: ['manager', 'talent'] },
  { kind: 'logged_in_again', label: 'Came back and logged in', types: ['manager', 'talent'] },
];

export interface Transcript {
  id: string;
  name: string;
  kind: 'file' | 'link';
  /** Blob pathname (or local path in dev) for uploaded files. Never exposed to the browser. */
  pathname?: string;
  url?: string;
  size?: number;
  uploadedAt: string;
}

export interface ProductInfo {
  userId: number;
  type: 'talent' | 'manager';
  signedUpAt: string;
  lastSignInAt: string | null;
  lastActionAt: string | null;
  actions30d: number;
  steps: string[];
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  company: string;
  pipeline: Pipeline;
  stage: string;
  notes: string;
  source: 'manual' | 'sync';
  hasAccount: boolean;
  product: ProductInfo | null;
  transcripts: Transcript[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Data {
  version: 1;
  contacts: Contact[];
  lastSyncAt: string | null;
}

/** What the browser sees: transcripts without internal storage paths. */
export type PublicContact = Omit<Contact, 'transcripts'> & {
  transcripts: Omit<Transcript, 'pathname'>[];
};

/** Plain-text template; {{firstName}}, {{name}}, {{email}}, {{company}} are filled in per contact. */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type Trigger = 'days_after_account_created' | 'days_after_lead_no_account';

export const TRIGGERS: { id: Trigger; label: string }[] = [
  { id: 'days_after_account_created', label: 'days after the account was created' },
  { id: 'days_after_lead_no_account', label: 'days after Google sign-in with no account' },
];

export type RuleMode = 'off' | 'dry_run' | 'live';

export interface EmailRule {
  id: string;
  name: string;
  templateId: string;
  trigger: Trigger;
  /** Send once a contact is at least this many days past the trigger... */
  days: number;
  /** ...and no more than this many days later, so enabling a rule never emails old contacts. */
  windowDays: number;
  /** Only for the account trigger. null = any. */
  userType: 'talent' | 'manager' | null;
  /** Skip contacts who have already done ANY of these checklist steps. */
  skipIfSteps: string[];
  enabled: boolean;
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSend {
  id: string;
  ruleId: string;
  contactId: string;
  toEmail: string;
  subject: string;
  status: 'dry_run' | 'pending' | 'sent' | 'failed';
  error: string | null;
  resendId: string | null;
  createdAt: string;
}
