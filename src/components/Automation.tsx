'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHECKLIST, TRIGGERS, type EmailRule, type EmailSend, type EmailTemplate, type RuleMode } from '@/lib/types';
import { TEMPLATE_VARS, buildVars, renderEmail } from '@/lib/render';
import ThemeToggle from './ThemeToggle';

interface Config { from: string | null; replyTo: string | null; baseUrl: string | null; hasKey: boolean; cronSecret: boolean; problem: string | null }
interface State { templates: EmailTemplate[]; rules: EmailRule[]; sends: EmailSend[]; config: Config }

const modeOf = (r: EmailRule): RuleMode => (!r.enabled ? 'off' : r.live ? 'live' : 'dry_run');

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) window.location.href = '/login';
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export default function Automation() {
  const [state, setState] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [tplId, setTplId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; subject: string; body: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setState(await api('/api/automation', 'GET')); } catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!state) return;
    const t = state.templates.find((x) => x.id === tplId) ?? state.templates[0];
    if (t && t.id !== tplId) setTplId(t.id);
    if (t) setDraft({ name: t.name, subject: t.subject, body: t.body });
    else setDraft(null);
    // reset the editor only when switching templates or after a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplId, state?.templates]);

  const preview = useMemo(
    () => (draft ? renderEmail(draft, buildVars({ name: 'Alex Example', email: 'alex@example.com', company: 'Example Co' }), '#unsubscribe') : null),
    [draft],
  );

  async function act(fn: () => Promise<string | void>) {
    setBusy(true); setMsg('');
    try { const m = await fn(); if (m) setMsg(m); await load(); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  if (!state) return <div className="wrap"><p className="muted">{msg || 'Loading…'}</p></div>;
  const { templates, rules, sends, config } = state;
  const tplName = (id: string) => templates.find((t) => t.id === id)?.name ?? '(missing)';
  const dirty = draft && templates.find((t) => t.id === tplId) && (() => { const t = templates.find((x) => x.id === tplId)!; return t.name !== draft.name || t.subject !== draft.subject || t.body !== draft.body; })();

  return (
    <>
      <div className="topbar">
        <h2>Automation</h2>
        <a href="/">← CRM</a>
        <span className="spacer" />
        <ThemeToggle />
      </div>
      <div className="wrap" style={{ display: 'grid', gap: 24 }}>
        {msg && <p className="muted">{msg}</p>}

        <section>
          <h3>Sending</h3>
          <p className="muted">
            {config.problem ? `Live sending is blocked: ${config.problem}.` : `Live sending is ready. From ${config.from}${config.replyTo ? `, replies to ${config.replyTo}` : ''}.`}
            {' '}Daily cron: {config.cronSecret ? 'configured' : 'CRON_SECRET not set, so it will not run automatically'}. Dry run works without any of this.
          </p>
        </section>

        <section>
          <h3>Rules</h3>
          {rules.length === 0 && <p className="muted">No rules yet.</p>}
          {rules.map((r) => <RuleCard key={r.id} rule={r} templates={templates} busy={busy} act={act} tplName={tplName} />)}
          <button disabled={busy || templates.length === 0} onClick={() => act(async () => { await api('/api/automation/rules', 'POST', { templateId: templates[0].id }); })}>Add rule</button>
        </section>

        <section>
          <h3>Templates</h3>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {templates.map((t) => <button key={t.id} className={t.id === tplId ? 'active' : ''} onClick={() => setTplId(t.id)}>{t.name}</button>)}
            <button onClick={() => act(async () => { const t = await api('/api/automation/templates', 'POST', { name: 'New template', subject: 'Subject', body: 'Hi {{firstName}},\n\n' }); setTplId(t.id); })}>+ New</button>
          </div>
          {draft && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Template name" />
                <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Subject" />
                <textarea rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <p className="muted">Variables: {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(' ')}. Blank line = new paragraph. An unsubscribe link is added automatically.</p>
                <div className="row">
                  <button className="primary" disabled={busy || !dirty} onClick={() => act(async () => { await api(`/api/automation/templates/${tplId}`, 'PATCH', draft); return 'Template saved'; })}>Save</button>
                  <button disabled={busy} onClick={() => confirm('Delete this template?') && act(async () => { await api(`/api/automation/templates/${tplId}`, 'DELETE'); setTplId(null); })}>Delete</button>
                </div>
                <div className="row">
                  <input type="email" placeholder="Send a test to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button disabled={busy || !testTo} onClick={() => act(async () => { await api('/api/automation/test', 'POST', { to: testTo, subject: draft.subject, body: draft.body }); return `Test sent to ${testTo} (uses the unsaved text above, sample name Alex Example)`; })}>Send test</button>
                </div>
              </div>
              <div>
                <p className="muted">Preview: <strong>{preview?.subject}</strong></p>
                <iframe title="Preview" sandbox="" srcDoc={preview?.html} style={{ width: '100%', height: 380, border: '1px solid var(--border, #ddd)', background: '#fff' }} />
              </div>
            </div>
          )}
        </section>

        <section>
          <h3>Activity</h3>
          {sends.length === 0 ? <p className="muted">Nothing yet.</p> : (
            <table>
              <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Rule</th><th>Status</th></tr></thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                    <td>{s.toEmail}</td>
                    <td>{s.subject}</td>
                    <td>{rules.find((r) => r.id === s.ruleId)?.name ?? s.ruleId}</td>
                    <td title={s.error ?? ''}>{s.status === 'dry_run' ? 'would send (dry run)' : s.status}{s.error ? `: ${s.error}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function RuleCard({ rule, templates, busy, act, tplName }: {
  rule: EmailRule; templates: EmailTemplate[]; busy: boolean;
  act: (fn: () => Promise<string | void>) => Promise<void>; tplName: (id: string) => string;
}) {
  const patch = (body: object, note?: string) => act(async () => { await api(`/api/automation/rules/${rule.id}`, 'PATCH', body); return note; });
  const num = (field: 'days' | 'windowDays', min: number) => (
    <input type="number" min={min} style={{ width: 70 }} defaultValue={rule[field]} key={`${field}${rule[field]}`}
      onBlur={(e) => Number(e.target.value) !== rule[field] && patch({ [field]: Number(e.target.value) })} />
  );
  const mode = modeOf(rule);
  return (
    <div className="card" style={{ marginBottom: 12, cursor: 'default' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{rule.name}</strong>
        <div className="tabs">
          {(['off', 'dry_run', 'live'] as RuleMode[]).map((m) => (
            <button key={m} className={m === mode ? 'active' : ''} disabled={busy}
              onClick={() => m !== mode && (m !== 'live' || confirm('Go live? Real emails will be sent to matching contacts on the next run.')) && patch({ mode: m })}>
              {m === 'off' ? 'Off' : m === 'dry_run' ? 'Dry run' : 'Live'}
            </button>
          ))}
        </div>
      </div>
      <p className="row" style={{ flexWrap: 'wrap' }}>
        Send {num('days', 0)} days after
        <select value={rule.trigger} onChange={(e) => patch({ trigger: e.target.value })}>{TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        , for up to {num('windowDays', 1)} days after that. Template
        <select value={rule.templateId} onChange={(e) => patch({ templateId: e.target.value })}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </p>
      {rule.trigger === 'days_after_account_created' && (
        <p className="row">Account type
          <select value={rule.userType ?? ''} onChange={(e) => patch({ userType: e.target.value || null })}>
            <option value="">Any</option><option value="talent">Talent</option><option value="manager">Manager</option>
          </select>
        </p>
      )}
      <details>
        <summary className="muted">Skip anyone who already did: {rule.skipIfSteps.length ? rule.skipIfSteps.length + ' steps' : 'nothing'}</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {CHECKLIST.map((c) => (
            <label key={c.kind} className="row">
              <input type="checkbox" style={{ width: 'auto' }} checked={rule.skipIfSteps.includes(c.kind)}
                onChange={(e) => patch({ skipIfSteps: e.target.checked ? [...rule.skipIfSteps, c.kind] : rule.skipIfSteps.filter((k) => k !== c.kind) })} />
              {c.label}
            </label>
          ))}
        </div>
      </details>
      <div className="row" style={{ marginTop: 8 }}>
        <button disabled={busy || mode === 'off'} onClick={() => act(async () => {
          const r = (await api('/api/automation/run', 'POST', { ruleId: rule.id })).results[0];
          return r.skipped ? `Skipped: ${r.skipped}` : r.mode === 'live' ? `Sent ${r.sent}, failed ${r.failed} (${r.eligible} eligible)` : `Dry run: ${r.wouldSend} new would be sent (${r.eligible} eligible). See Activity.`;
        })}>Run now</button>
        <button disabled={busy} onClick={() => confirm('Delete this rule?') && act(async () => { await api(`/api/automation/rules/${rule.id}`, 'DELETE'); })}>Delete</button>
        <span className="muted">Template: {tplName(rule.templateId)}. Runs daily and syncs contacts first.</span>
      </div>
    </div>
  );
}
