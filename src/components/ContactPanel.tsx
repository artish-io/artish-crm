'use client';

import { useEffect, useRef, useState } from 'react';
import { MQL_STAGES, SQL_STAGES, type PublicContact } from '@/lib/types';
import { checklistFor } from './Board';

interface Props {
  contact: PublicContact;
  onClose: () => void;
  onChange: (c: PublicContact) => void;
  onDeleted: (id: string) => void;
}

export default function ContactPanel({ contact, onClose, onChange, onDeleted }: Props) {
  const [notes, setNotes] = useState(contact.notes);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset local notes when a different contact is opened.
  useEffect(() => {
    setNotes(contact.notes);
    setError('');
  }, [contact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError('');
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `Request failed (${res.status})`);
      return null;
    }
    return body;
  }

  const patch = async (changes: Record<string, unknown>) => {
    const body = await call(`/api/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (body) onChange(body);
  };

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const body = await call(`/api/contacts/${contact.id}/transcripts`, { method: 'POST', body: fd });
    if (body) onChange(body);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function addLink() {
    const body = await call(`/api/contacts/${contact.id}/transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });
    if (body) {
      onChange(body);
      setLink('');
    }
  }

  async function removeTranscript(fileId: string) {
    if (!confirm('Remove this transcript?')) return;
    const body = await call(`/api/contacts/${contact.id}/transcripts?fileId=${fileId}`, { method: 'DELETE' });
    if (body) onChange(body);
  }

  async function remove() {
    if (!confirm('Delete this contact and its files?')) return;
    const body = await call(`/api/contacts/${contact.id}`, { method: 'DELETE' });
    if (body) onDeleted(contact.id);
  }

  const cl = checklistFor(contact);
  const stages = contact.pipeline === 'sql' ? SQL_STAGES : MQL_STAGES;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ flex: 1 }}>{contact.name || contact.email}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="muted">
          {contact.email || 'no email'}
          {contact.company && ` · ${contact.company}`}
          {contact.source === 'sync' && ' · synced from app'}
        </div>
        {error && <div className="error">{error}</div>}

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Pipeline</label>
            <select value={contact.pipeline} disabled={busy} onChange={(e) => patch({ pipeline: e.target.value })}>
              <option value="sql">SQL (sales)</option>
              <option value="mql">MQL (marketing)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Stage</label>
            <select
              value={contact.stage}
              disabled={busy || contact.pipeline === 'mql'}
              title={contact.pipeline === 'mql' ? 'MQL stage follows the app data' : undefined}
              onChange={(e) => patch({ stage: e.target.value })}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {contact.hasAccount && contact.product && (
          <section>
            <label>
              Feature checklist ({cl.done}/{cl.total}) · {contact.product.type}
            </label>
            <ul className="checklist">
              {cl.items.map((i) => {
                const done = contact.product!.steps.includes(i.kind);
                return (
                  <li key={i.kind} className={done ? 'done' : 'muted'}>
                    {done ? '✓' : '○'} {i.label}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button disabled={busy || notes === contact.notes} onClick={() => patch({ notes })} style={{ marginTop: 6 }}>
            Save notes
          </button>
        </section>

        <section>
          <label>Meeting transcripts</label>
          <ul className="checklist">
            {contact.transcripts.map((t) => (
              <li key={t.id} className="row">
                {t.kind === 'link' ? (
                  <a href={t.url} target="_blank" rel="noopener noreferrer">
                    🔗 {t.name}
                  </a>
                ) : (
                  <a href={`/api/transcripts/${contact.id}/${t.id}`}>📄 {t.name}</a>
                )}
                <span className="muted" style={{ flex: 1 }}>
                  {new Date(t.uploadedAt).toLocaleDateString()}
                </span>
                <button className="danger" disabled={busy} onClick={() => removeTranscript(t.id)}>
                  ✕
                </button>
              </li>
            ))}
            {contact.transcripts.length === 0 && <li className="muted">None yet</li>}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <input ref={fileRef} type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="…or paste a transcript link (https://)" value={link} onChange={(e) => setLink(e.target.value)} />
            <button disabled={busy || !link} onClick={addLink}>
              Add
            </button>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Files up to 4 MB.
          </div>
        </section>

        <div className="row" style={{ marginTop: 'auto' }}>
          <button disabled={busy} onClick={() => patch({ archived: !contact.archived })}>
            {contact.archived ? 'Unarchive' : 'Archive'}
          </button>
          {contact.source === 'manual' && (
            <button className="danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
