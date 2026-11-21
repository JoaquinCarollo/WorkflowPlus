import { describe, expect, it } from 'vitest';
import { credentialVerificationAgent, organizationAccessPolicyAgent } from './access-agents.js';

describe('organization access agents', () => {
  it('rejects registration when the account already exists', () => {
    const verification = credentialVerificationAgent({
      intent: 'register',
      accountExists: true,
      credentialsAccepted: false,
    });

    expect(organizationAccessPolicyAgent('register', verification)).toMatchObject({
      allowed: false,
      reason: 'account_already_exists',
    });
  });

  it('rejects sign-in when Supabase does not accept the credentials', () => {
    const verification = credentialVerificationAgent({
      intent: 'sign_in',
      accountExists: true,
      credentialsAccepted: false,
    });

    expect(organizationAccessPolicyAgent('sign_in', verification)).toMatchObject({
      allowed: false,
      reason: 'invalid_credentials',
    });
  });

  it('allows a valid sign-in', () => {
    const verification = credentialVerificationAgent({
      intent: 'sign_in',
      accountExists: true,
      credentialsAccepted: true,
    });

    expect(organizationAccessPolicyAgent('sign_in', verification)).toMatchObject({
      allowed: true,
      reason: 'approved',
    });
  });
});
