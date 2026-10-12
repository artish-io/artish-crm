import { query, tx, type Query } from './sql';
import type { Contact } from './types';

/** Row-level access to contacts. Edits run in a transaction holding a row lock (SELECT … FOR UPDATE). */

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

function fromRow(r: any): Contact {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    company: r.company,
    pipeline: r.pipeline,
    stage: r.stage,
    notes: r.notes,
    source: r.source,
    hasAccount: r.has_account,
    product: r.product ?? null,
    transcripts: r.transcripts ?? [],
    archived: r.archived,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const COLUMNS = `id, email, name, company, pipeline, stage, notes, source, has_account, product, transcripts, archived, created_at, updated_at`;

export async function listContacts(): Promise<Contact[]> {
  const { rows } = await query(`SELECT ${COLUMNS} FROM contacts ORDER BY updated_at DESC`);
  return rows.map(fromRow);
}

export async function getContact(id: string): Promise<Contact | null> {
  const { rows } = await query(`SELECT ${COLUMNS} FROM contacts WHERE id = $1`, [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Inserts a contact. Throws a unique violation (see isDuplicate) if the email is taken. */
export async function insertContact(c: Contact): Promise<void> {
  await query(
    `INSERT INTO contacts (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14)`,
    [
      c.id, c.email, c.name, c.company, c.pipeline, c.stage, c.notes, c.source, c.hasAccount,
      c.product ? JSON.stringify(c.product) : null, JSON.stringify(c.transcripts), c.archived, c.createdAt, c.updatedAt,
    ],
  );
}

/**
 * Locks the contact's row, lets `fn` mutate it, and saves all editable columns.
 * Returns null if it does not exist. Throws a unique violation if `fn` changes the email to a taken one.
 */
export async function updateContact<T>(
  id: string,
  fn: (c: Contact) => T | Promise<T>,
): Promise<{ contact: Contact; result: T } | null> {
  return tx(async (q) => {
    const { rows } = await q(`SELECT ${COLUMNS} FROM contacts WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows[0]) return null;
    const contact = fromRow(rows[0]);
    const result = await fn(contact);
    await q(
      `UPDATE contacts SET email=$2, name=$3, company=$4, pipeline=$5, stage=$6, notes=$7, has_account=$8,
         product=$9::jsonb, transcripts=$10::jsonb, archived=$11, updated_at=$12 WHERE id=$1`,
      [
        id, contact.email, contact.name, contact.company, contact.pipeline, contact.stage, contact.notes,
        contact.hasAccount, contact.product ? JSON.stringify(contact.product) : null,
        JSON.stringify(contact.transcripts), contact.archived, contact.updatedAt,
      ],
    );
    return { contact, result };
  });
}

export async function deleteContact(id: string): Promise<void> {
  await query(`DELETE FROM contacts WHERE id = $1`, [id]);
}

/**
 * Applies a sync: inserts new contacts and, for existing ones, updates only the
 * product-derived columns so a concurrent edit to notes or SQL stage is never overwritten.
 */
export async function saveSynced(contacts: Contact[], syncedAt: string): Promise<void> {
  await tx(async (q: Query) => {
    for (const c of contacts) {
      await q(
        `INSERT INTO contacts (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET product = EXCLUDED.product, has_account = EXCLUDED.has_account,
           name = EXCLUDED.name, updated_at = EXCLUDED.updated_at,
           stage = CASE WHEN contacts.pipeline = 'mql' THEN EXCLUDED.stage ELSE contacts.stage END`,
        [
          c.id, c.email, c.name, c.company, c.pipeline, c.stage, c.notes, c.source, c.hasAccount,
          c.product ? JSON.stringify(c.product) : null, JSON.stringify(c.transcripts), c.archived, c.createdAt, c.updatedAt,
        ],
      );
    }
    await q(
      `INSERT INTO meta (key, value) VALUES ('last_sync_at', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(syncedAt)],
    );
  });
}

export async function lastSyncAt(): Promise<string | null> {
  const { rows } = await query(`SELECT value FROM meta WHERE key = 'last_sync_at'`);
  return rows[0]?.value ?? null;
}
