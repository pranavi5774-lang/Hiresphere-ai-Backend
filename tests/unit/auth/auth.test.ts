import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateResetToken,
  hashPassword,
  sha256,
  signSession,
  verifyPassword,
  verifySession,
} from '@/lib/auth';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authentication utilities', () => {
  it('hashes passwords and verifies only the matching password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-42');

    expect(hash).not.toBe('Correct-Horse-Battery-42');
    await expect(verifyPassword('Correct-Horse-Battery-42', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('signs and verifies a role-bearing session and rejects tampered or invalid tokens', async () => {
    vi.stubEnv('SESSION_SECRET', 'unit-test-session-secret-with-sufficient-entropy');
    const token = await signSession({
      sub: 'user-test-1',
      email: 'candidate@example.test',
      name: 'Test Candidate',
      role: 'CANDIDATE',
    });

    await expect(verifySession(token)).resolves.toMatchObject({
      sub: 'user-test-1',
      email: 'candidate@example.test',
      name: 'Test Candidate',
      role: 'CANDIDATE',
    });
    await expect(verifySession(`${token}tampered`)).resolves.toBeNull();
    await expect(verifySession('not-a-jwt')).resolves.toBeNull();
  });

  it('generates unique reset tokens and hashes them as SHA-256 hex', async () => {
    const first = generateResetToken();
    const second = generateResetToken();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    await expect(sha256('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});