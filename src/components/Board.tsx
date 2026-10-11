'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHECKLIST, MQL_STAGES, SQL_STAGES, type Pipeline, type PublicContact } from '@/lib/types';
import ContactPanel from './ContactPanel';

const rel = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 60 / 24)}d ago`;
};

export function checklistFor(c: PublicContact) {
  const type = c.product?.type;
  const items = CHECKLIST.filter((i) => !type || i.types.includes(type));
  const done = items.filter((i) => c.product?.steps.includes(i.kind));
  return { items, done: done.length, total: items.length };
}

export default function Board() {
  const [contacts, setContacts] = useState<PublicContact[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Pipeline>('sql');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const body = await res.json();
    setContacts(body.contacts);
    setLastSyncAt(body.lastSyncAt);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsert = (c: PublicContact) =>
    setContacts((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]));

  async function sync() {
    setSyncing(true);
    setMessage('');
    const res = await fetch('/api/sync', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Synced: ${JSON.stringify(body)}` : `Sync failed: ${body.error ?? res.status}`);
    setSyncing(false);
    refresh();
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contacts
      .filter((c) => c.pipeline === tab && (showArchived || !c.archived))
      .filter((c) => !needle || `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [contacts, tab, q, showArchived]);

  const count = (p: Pipeline) => contacts.filter((c) => c.pipeline === p && !c.archived).length;
  const open = contacts.find((c) => c.id === openId) ?? null;

  return (
    <>
      <div className="topbar">
        <h2>Artish CRM</h2>
        <div className="tabs">
          <button className={tab === 'sql' ? 'active' : ''} onClick={() => setTab('sql')}>
            SQL ({count('sql')})
          </button>
          <button className={tab === 'mql' ? 'active' : ''} onClick={() => setTab('mql')}>
            MQL ({count('mql')})
          </button>
        </div>
        <span className="spacer" />
        <span className="muted">{lastSyncAt ? `Synced ${rel(lastSyncAt)}` : 'Never synced'}</span>
        <button onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync from app'}
        </button>
        <button className="primary" onClick={() => setAdding(true)}>
          Add contact
        </button>
        <button onClick={logout}>Log out</button>
      </div>

      <div className="wrap">
        {message && <p className="muted">{message}</p>}
        <div className="toolbar">
          <input type="search" placeholder="Search name, email, company" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="row">
            <input type="checkbox" style={{ width: 'auto' }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {tab === 'sql' ? (
          <div className="kanban">
            {SQL_STAGES.map((s) => {
              const col = visible.filter((c) => c.stage === s.id);
              return (
                <div className="col" key={s.id}>
                  <h3>
                    {s.label} <span className="muted">{col.length}</span>
                  </h3>
                  {col.map((c) => (
                    <div className="card" key={c.id} onClick={() => setOpenId(c.id)}>
                      <strong>{c.name || c.email}</strong>
                      <div className="muted">{c.company || c.email}</div>
                      {c.transcripts.length > 0 && <div className="muted">📎 {c.transcripts.length}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Stage</th>
                <th>Type</th>
                <th>Feature checklist</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const cl = checklistFor(c);
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)}>
                    <td>
                      <strong>{c.name || '—'}</strong>
                      <div className="muted">{c.email}</div>
                    </td>
                    <td>
                      <span className="badge">{MQL_STAGES.find((s) => s.id === c.stage)?.label ?? c.stage}</span>
                    </td>
                    <td>{c.product?.type ?? '—'}</td>
                    <td>
                      {c.hasAccount ? (
                        <div className="row">
                          <div className="progress" style={{ flex: 1 }}>
                            <div style={{ width: `${(cl.done / Math.max(cl.total, 1)) * 100}%` }} />
                          </div>
                          <span className="muted">
                            {cl.done}/{cl.total}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">no account</span>
                      )}
                    </td>
                    <td>{rel(c.product?.lastSignInAt)}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No contacts. Try “Sync from app”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <ContactPanel
          contact={open}
          onClose={() => setOpenId(null)}
          onChange={upsert}
          onDeleted={(id) => {
            setContacts((prev) => prev.filter((c) => c.id !== id));
            setOpenId(null);
          }}
        />
      )}
      {adding && (
        <AddContact
          defaultPipeline={tab}
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            upsert(c);
            setAdding(false);
            setTab(c.pipeline);
            setOpenId(c.id);
          }}
        />
      )}
    </>
  );
}

function AddContact({
  defaultPipeline,
  onClose,
  onCreated,
}: {
  defaultPipeline: Pipeline;
  onClose: () => void;
  onCreated: (c: PublicContact) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', company: '', pipeline: defaultPipeline });
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? 'Failed');
    onCreated(body);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Add contact</h3>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <select value={form.pipeline} onChange={(e) => setForm({ ...form, pipeline: e.target.value as Pipeline })}>
          <option value="sql">SQL (sales)</option>
          <option value="mql">MQL (marketing)</option>
        </select>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="primary">Add</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
