import { describe, expect, it, vi } from 'vitest';
import {
  passwordRecoveryPolicyAgent,
  passwordReuseCheckAgent,
  storeRecoveryToken,
  readRecoveryToken,
} from './password-recovery.js';
import {
  requestPasswordRecovery,
  resetPasswordWithToken,
  verifyAccountExists,
  type SupabaseAuthClient,
} from './organization-access.js';
import type { TransactionalEmailMailer, TransactionalEmailMessage } from './employee-invitation.js';

function capturingMailer() {
  const messages: TransactionalEmailMessage[] = [];
  const mailer: TransactionalEmailMailer = {
    sendEmail: async (message: TransactionalEmailMessage) => {
      messages.push(message);
      return { emailSent: true };
    },
  };
  return { messages, mailer };
}

describe('password recovery agents', () => {
  it('rejects reusing the forgotten password', () => {
    const assessment = passwordReuseCheckAgent({ newPasswordMatchesCurrent: true });
    expect(passwordRecoveryPolicyAgent(assessment)).toMatchObject({
      allowed: false,
      reason: 'password_reused',
    });
  });

  it('allows a genuinely new password', () => {
    const assessment = passwordReuseCheckAgent({ newPasswordMatchesCurrent: false });
    expect(passwordRecoveryPolicyAgent(assessment)).toMatchObject({
      allowed: true,
      reason: 'approved',
    });
  });

  it('stores only a digest of the recovery token', () => {
    storeRecoveryToken({ email: 'Owner@Empresa.test', token: 'raw-token', expiresInMinutes: 30 });
    expect(readRecoveryToken('raw-token')).toMatchObject({ email: 'owner@empresa.test' });
  });
});

function fakeRecoveryClient(matchesCurrent: boolean): SupabaseAuthClient {
  return {
    listUsers: async () => ({
      data: { users: [{ id: 'u1', email: 'owner@empresa.test' }] },
      error: null,
    }),
    signUp: async () => ({ data: { user: null, session: null }, error: null }),
    signInWithPassword: async () =>
      matchesCurrent
        ? { data: { user: { id: 'u1' }, session: {} }, error: null }
        : { data: { user: null, session: null }, error: { message: 'invalid credentials' } },
    resetPasswordForEmail: async () => ({ emailSent: true }),
    findUserByEmail: async () => ({ userId: 'u1' }),
    updateUserById: async () => ({ error: null }),
  };
}

describe('account existence checks', () => {
  it('finds a registered account across pages and casing', async () => {
    const client: SupabaseAuthClient = {
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: 'invalid credentials' },
      }),
      listUsers: async ({ page }) => ({
        data: {
          users:
            page === 1
              ? Array.from({ length: 200 }, (_, index) => ({
                  id: `u-${index}`,
                  email: `user-${index}@empresa.test`,
                }))
              : [{ id: 'u-owner', email: 'Owner@Empresa.test' }],
        },
        error: null,
      }),
    };
    await expect(verifyAccountExists(client, 'owner@empresa.test')).resolves.toBe(true);
    await expect(verifyAccountExists(client, '  OWNER@EMPRESA.TEST ')).resolves.toBe(true);
    await expect(verifyAccountExists(client, 'nadie@empresa.test')).resolves.toBe(false);
  });

  it('recovers the password for a registered account typed with different casing', async () => {
    const client = fakeRecoveryClient(false);
    const { mailer } = capturingMailer();
    await expect(
      requestPasswordRecovery({ email: 'OWNER@EMPRESA.TEST' }, client, mailer),
    ).resolves.toMatchObject({ status: 'email_sent', emailSent: true, accountExists: true });
  });

  it('logs when recovery is skipped for an unknown account', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const client: SupabaseAuthClient = {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: 'invalid credentials' },
      }),
    };

    try {
      await requestPasswordRecovery(
        { email: 'unknown@example.test' },
        client,
        capturingMailer().mailer,
      );
      expect(infoSpy).toHaveBeenCalledWith('[email] Recovery skipped: account not found');
    } finally {
      infoSpy.mockRestore();
    }
  });
});

describe('password reset flow', () => {
  it('sends a recovery link email only for an existing account', async () => {
    const client = fakeRecoveryClient(false);
    const { messages, mailer } = capturingMailer();
    await expect(
      requestPasswordRecovery({ email: 'owner@empresa.test' }, client, mailer),
    ).resolves.toMatchObject({ status: 'email_sent', emailSent: true });
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('owner@empresa.test');
    expect(messages[0].text).toMatch(/token=/);
    const token = messages[0].text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
    expect(readRecoveryToken(token)).toMatchObject({ email: 'owner@empresa.test' });

    const deniedMailer = capturingMailer();
    await expect(
      requestPasswordRecovery({ email: 'other@empresa.test' }, client, deniedMailer.mailer),
    ).resolves.toMatchObject({ status: 'denied', emailSent: false });
    expect(deniedMailer.messages).toHaveLength(0);
  });

  it('reports a delivery failure for an existing account and discards the token', async () => {
    const client = fakeRecoveryClient(false);
    let capturedToken = '';
    const failingMailer: TransactionalEmailMailer = {
      sendEmail: async (message) => {
        capturedToken = message.text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
        return { emailSent: false };
      },
    };

    await expect(
      requestPasswordRecovery({ email: 'owner@empresa.test' }, client, failingMailer),
    ).resolves.toMatchObject({ status: 'denied', emailSent: false, accountExists: true });
    expect(capturedToken).not.toBe('');
    expect(readRecoveryToken(capturedToken)).toBeNull();
  });

  it('denies reset when the new password matches the forgotten one', async () => {
    storeRecoveryToken({ email: 'owner@empresa.test', token: 'token-reused' });
    const result = await resetPasswordWithToken(
      { email: 'owner@empresa.test', token: 'token-reused', newPassword: 'forgotten' },
      fakeRecoveryClient(true),
    );
    expect(result.status).toBe('denied');
    expect(result.reason).toBe('password_reused');
    expect(result.decision?.reason).toBe('password_reused');
  });

  it('denies reset when the entered email differs from the recovery email', async () => {
    storeRecoveryToken({ email: 'owner@empresa.test', token: 'token-mismatch' });
    const result = await resetPasswordWithToken(
      { email: 'other@empresa.test', token: 'token-mismatch', newPassword: 'brand-new' },
      fakeRecoveryClient(false),
    );
    expect(result).toMatchObject({ status: 'denied', reason: 'email_mismatch' });
    expect(readRecoveryToken('token-mismatch')).not.toBeNull();
  });

  it('approves reset for a new password and consumes the token', async () => {
    storeRecoveryToken({ email: 'owner@empresa.test', token: 'token-fresh' });
    const result = await resetPasswordWithToken(
      { email: 'owner@empresa.test', token: 'token-fresh', newPassword: 'brand-new' },
      fakeRecoveryClient(false),
    );
    expect(result.status).toBe('approved');
    expect(result.reason).toBe('approved');
    expect(readRecoveryToken('token-fresh')).toBeNull();
  });
});
