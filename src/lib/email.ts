import { createHmac, timingSafeEqual } from 'crypto';

/** Resend delivery plus the signed unsubscribe links. Server only. */

export interface EmailConfig {
  apiKey: string | null;
  from: string | null;
  replyTo: string | null;
  baseUrl: string | null;
  cronSecret: boolean;
  /** Why live sending can't happen right now, or null if it can. */
  problem: string | null;
}

export function emailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY || null;
  const from = process.env.EMAIL_FROM || null;
  const explicit = process.env.CRM_BASE_URL?.replace(/\/+$/, '');
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const baseUrl = explicit || (vercelHost ? `https://${vercelHost}` : process.env.VERCEL ? null : 'http://localhost:3000');

  const problem = !apiKey
    ? 'RESEND_API_KEY is not set'
    : !from
      ? 'EMAIL_FROM is not set'
      : !baseUrl
        ? 'CRM_BASE_URL is not set (needed for unsubscribe links)'
        : !process.env.SESSION_SECRET
          ? 'SESSION_SECRET is not set (needed to sign unsubscribe links)'
          : null;

  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO || null, baseUrl, cronSecret: !!process.env.CRON_SECRET, problem };
}

const sign = (email: string) =>
  createHmac('sha256', process.env.SESSION_SECRET ?? '').update(`unsub:${email.toLowerCase()}`).digest('hex').slice(0, 32);

export function verifyUnsubToken(email: string, token: string): boolean {
  if (!process.env.SESSION_SECRET) return false;
  const expected = Buffer.from(sign(email));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email: string): string {
  const { baseUrl } = emailConfig();
  if (!baseUrl) throw new Error('CRM_BASE_URL is not set');
  return `${baseUrl}/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${sign(email)}`;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  /** Resend de-duplicates retries carrying the same key. */
  idempotencyKey?: string;
}

/** Sends one email through Resend. Throws on any failure. */
export async function sendEmail(m: OutgoingEmail): Promise<{ id: string }> {
  const cfg = emailConfig();
  if (cfg.problem || !cfg.apiKey || !cfg.from) throw new Error(cfg.problem ?? 'Email is not configured');

  const res = await fetch(`${process.env.RESEND_API_URL ?? 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      headers: {
        'List-Unsubscribe': `<${m.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? 'no id returned'}`);
  return { id: body.id };
}
