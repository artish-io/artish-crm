import { suppress } from '@/lib/automation-repo';
import { verifyUnsubToken } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Rendering the page unsubscribes; links are signed so addresses can't be unsubscribed by guessing.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ e?: string; t?: string }> }) {
  const { e, t } = await searchParams;
  const ok = !!e && !!t && verifyUnsubToken(e, t);
  if (ok) await suppress(e, 'unsubscribed');
  return (
    <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>{ok ? 'You are unsubscribed' : 'This link is not valid'}</h1>
      <p style={{ color: '#6b7280' }}>{ok ? 'You will not receive any more emails from us.' : 'Please use the link from the email you received.'}</p>
    </main>
  );
}
