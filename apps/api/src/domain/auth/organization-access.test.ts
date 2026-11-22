import { describe, expect, it, vi } from 'vitest';
import {
  registerOrganization,
  signInOrganization,
  verifyAccountExists,
  type SupabaseAuthClient,
} from './organization-access.js';

function fakeClient(overrides: {
  users?: Array<{ id: string; email: string }>;
  signUpResult?: { userId: string | null; session: unknown; errorMessage: string | null };
  signInResult?: { userId: string | null; errorMessage: string | null };
}): SupabaseAuthClient {
  return {
    listUsers: async () => ({
      data: { users: overrides.users ?? [] },
      error: null,
    }),
    signUp: async () => ({
      data: {
        user: overrides.signUpResult?.userId ? { id: overrides.signUpResult.userId } : null,
        session: overrides.signUpResult?.session ?? null,
      },
      error: overrides.signUpResult?.errorMessage
        ? { message: overrides.signUpResult.errorMessage }
        : null,
    }),
    signInWithPassword: async () => ({
      data: {
        user: overrides.signInResult?.userId ? { id: overrides.signInResult.userId } : null,
        session: overrides.signInResult?.userId ? {} : null,
      },
      error: overrides.signInResult?.errorMessage
        ? { message: overrides.signInResult.errorMessage }
        : null,
    }),
  };
}

const validDetails = {
  companyName: 'Norte Studio',
  email: 'owner@empresa.test',
  password: 'never-logged',
  organizationType: 'Empresa de servicios',
};

describe('organization access flow', () => {
  it('denies registration when the email already exists', async () => {
    const client = fakeClient({ users: [{ id: 'u1', email: 'owner@empresa.test' }] });
    const result = await registerOrganization(validDetails, client);
    expect(result.status).toBe('denied');
    expect(result.decision?.reason).toBe('account_already_exists');
  });

  it('approves registration and reports email sent when confirmation is pending', async () => {
    const client = fakeClient({
      users: [],
      signUpResult: { userId: 'u2', session: null, errorMessage: null },
    });
    const result = await registerOrganization(validDetails, client);
    expect(result.status).toBe('email_sent');
    expect(result.emailSent).toBe(true);
    expect(result.userId).toBe('u2');
    expect(JSON.stringify(result)).not.toContain('never-logged');
  });

  it('denies sign-in when the provider rejects credentials', async () => {
    const client = fakeClient({
      users: [{ id: 'u1', email: 'owner@empresa.test' }],
      signInResult: { userId: null, errorMessage: 'invalid credentials' },
    });
    const result = await signInOrganization(
      { email: 'owner@empresa.test', password: 'wrong' },
      client,
    );
    expect(result.status).toBe('denied');
    expect(result.decision?.reason).toBe('invalid_credentials');
  });

  it('approves sign-in when the provider accepts the credentials', async () => {
    const client = fakeClient({
      users: [{ id: 'u1', email: 'owner@empresa.test' }],
      signInResult: { userId: 'u1', errorMessage: null },
    });
    const result = await signInOrganization(
      { email: 'owner@empresa.test', password: 'correct' },
      client,
    );
    expect(result.status).toBe('approved');
    expect(result.userId).toBe('u1');
  });

  it('verifies account existence case-insensitively', async () => {
    const client = fakeClient({ users: [{ id: 'u1', email: 'Owner@Empresa.test' }] });
    await expect(verifyAccountExists(client, 'owner@empresa.test')).resolves.toBe(true);
    await expect(verifyAccountExists(client, 'other@empresa.test')).resolves.toBe(false);
  });

  it('logs account lookup errors without exposing the email', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client: SupabaseAuthClient = {
      listUsers: async () => ({
        data: { users: [] },
        error: { message: 'invalid service role' },
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: null,
      }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: null,
      }),
    };

    try {
      await expect(verifyAccountExists(client, 'owner@empresa.test')).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        '[supabase] Account lookup failed:',
        'invalid service role',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
