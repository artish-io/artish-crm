import { createHash, timingSafeEqual } from 'crypto';

/** Constant-time password check (compares fixed-length digests). Node runtime only. */
export function passwordMatches(input: string): boolean {
  const expected = process.env.CRM_PASSWORD;
  if (!expected) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
