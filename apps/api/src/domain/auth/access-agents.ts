export type OrganizationAccessIntent =
  'register' | 'sign_in' | 'password_recovery' | 'password_reset';

export type AccessDecisionReason =
  'account_already_exists' | 'invalid_credentials' | 'password_reused' | 'approved';

export interface CredentialVerificationEvidence {
  intent: OrganizationAccessIntent;
  accountExists: boolean;
  credentialsAccepted: boolean;
}

export interface CredentialVerificationResult {
  accountExists: boolean;
  credentialsAccepted: boolean;
  agentVersion: 'credential-verifier-v1';
}

export interface AccessDecision {
  allowed: boolean;
  reason: AccessDecisionReason;
  agentVersion: 'organization-access-policy-v1';
}

// Supabase Auth verifies password hashes. This agent only receives boolean evidence, never a password.
export function credentialVerificationAgent(
  evidence: CredentialVerificationEvidence,
): CredentialVerificationResult {
  return {
    accountExists: evidence.accountExists,
    credentialsAccepted: evidence.credentialsAccepted,
    agentVersion: 'credential-verifier-v1',
  };
}

export function organizationAccessPolicyAgent(
  intent: OrganizationAccessIntent,
  verification: CredentialVerificationResult,
): AccessDecision {
  if (intent === 'register' && verification.accountExists) {
    return denied('account_already_exists');
  }

  if (intent === 'sign_in' && !verification.credentialsAccepted) {
    return denied('invalid_credentials');
  }

  if (intent === 'password_reset' && verification.credentialsAccepted) {
    return denied('password_reused');
  }

  return { allowed: true, reason: 'approved', agentVersion: 'organization-access-policy-v1' };
}

function denied(reason: Exclude<AccessDecisionReason, 'approved'>): AccessDecision {
  return { allowed: false, reason, agentVersion: 'organization-access-policy-v1' };
}
