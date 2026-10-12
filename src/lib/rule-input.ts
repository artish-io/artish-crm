import { CHECKLIST, TRIGGERS, type EmailRule } from './types';

/** Validates and applies a partial rule payload. Returns an error string if invalid. */
export function applyRuleInput(base: EmailRule, b: Record<string, unknown>): EmailRule | string {
  const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);
  const r = { ...base };
  if (typeof b.name === 'string') r.name = b.name.trim() || r.name;
  if (typeof b.templateId === 'string') r.templateId = b.templateId;
  if (b.trigger !== undefined) {
    if (!TRIGGERS.some((t) => t.id === b.trigger)) return 'Unknown trigger';
    r.trigger = b.trigger as EmailRule['trigger'];
  }
  if (b.days !== undefined) { const n = int(b.days, 0, 365); if (n === null) return 'Days must be 0-365'; r.days = n; }
  if (b.windowDays !== undefined) { const n = int(b.windowDays, 1, 90); if (n === null) return 'Window must be 1-90 days'; r.windowDays = n; }
  if (b.userType !== undefined) {
    if (b.userType !== null && b.userType !== 'talent' && b.userType !== 'manager') return 'Bad user type';
    r.userType = b.userType as EmailRule['userType'];
  }
  if (b.skipIfSteps !== undefined) {
    const kinds = CHECKLIST.map((c) => c.kind as string);
    if (!Array.isArray(b.skipIfSteps) || b.skipIfSteps.some((s) => !kinds.includes(s as string))) return 'Bad steps';
    r.skipIfSteps = b.skipIfSteps as string[];
  }
  if (b.mode !== undefined) {
    if (b.mode !== 'off' && b.mode !== 'dry_run' && b.mode !== 'live') return 'Bad mode';
    r.enabled = b.mode !== 'off';
    r.live = b.mode === 'live';
  }
  r.updatedAt = new Date().toISOString();
  return r;
}
