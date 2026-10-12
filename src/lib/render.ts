/**
 * Template rendering. Pure and dependency-free so the browser preview and the
 * server produce the same email. Bodies are plain text: blank line = new paragraph,
 * URLs become links, and everything (including variable values) is HTML-escaped.
 */

export const TEMPLATE_VARS = ['firstName', 'name', 'email', 'company'] as const;

export function buildVars(c: { name?: string; email?: string; company?: string }): Record<string, string> {
  const name = (c.name ?? '').trim();
  return {
    firstName: name.split(/\s+/)[0] || 'there',
    name,
    email: c.email ?? '',
    company: c.company ?? '',
  };
}

const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const linkify = (escaped: string) =>
  escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    // keep trailing punctuation out of the link
    const trail = /[.,;:!?)]+$/.exec(url)?.[0] ?? '';
    const href = trail ? url.slice(0, -trail.length) : url;
    return `<a href="${href}">${href}</a>${trail}`;
  });

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(
  tpl: { subject: string; body: string },
  vars: Record<string, string>,
  unsubscribeUrl: string,
): Rendered {
  const subject = fill(tpl.subject, vars).replace(/\s+/g, ' ').trim();
  const body = fill(tpl.body, vars).replace(/\r\n/g, '\n').trim();

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${linkify(escapeHtml(p)).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const footer = unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">You are receiving this because you signed up for Artish. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff"><div style="max-width:560px;margin:0 auto;font:15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">${paragraphs}${footer}</div></body></html>`;
  const text = unsubscribeUrl ? `${body}\n\n--\nUnsubscribe: ${unsubscribeUrl}` : body;
  return { subject, html, text };
}
