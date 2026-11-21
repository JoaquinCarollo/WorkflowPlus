import { createHash } from 'node:crypto';

export type PasswordReuseReason = 'password_reused' | 'approved';

export interface PasswordRecoveryEvidence {
  newPasswordMatchesCurrent: boolean;
}

export interface PasswordResetDecision {
  allowed: boolean;
  reason: PasswordReuseReason;
  agentVersion: 'password-recovery-policy-v1';
}

export interface PasswordReuseAssessment {
  isReused: boolean;
  agentVersion: 'password-reuse-check-v1';
}

export interface PasswordResetCandidate {
  email: string;
  newPassword: string;
}

const RESET_TOKEN_STORAGE = new Map<string, { email: string; expiresAt: number }>();

export function passwordReuseCheckAgent(
  evidence: PasswordRecoveryEvidence,
): PasswordReuseAssessment {
  return {
    isReused: evidence.newPasswordMatchesCurrent,
    agentVersion: 'password-reuse-check-v1',
  };
}

export function passwordRecoveryPolicyAgent(
  assessment: PasswordReuseAssessment,
): PasswordResetDecision {
  if (assessment.isReused) {
    return {
      allowed: false,
      reason: 'password_reused',
      agentVersion: 'password-recovery-policy-v1',
    };
  }
  return { allowed: true, reason: 'approved', agentVersion: 'password-recovery-policy-v1' };
}

export function digestRecoveryToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface StoreRecoveryTokenInput {
  email: string;
  token: string;
  expiresInMinutes?: number;
}

export function storeRecoveryToken(input: StoreRecoveryTokenInput): void {
  const minutes = input.expiresInMinutes ?? 30;
  RESET_TOKEN_STORAGE.set(digestRecoveryToken(input.token), {
    email: normalizeEmail(input.email),
    expiresAt: Date.now() + minutes * 60_000,
  });
}

export interface RecoveryTokenRecord {
  email: string;
  consumed: boolean;
}

export function readRecoveryToken(
  token: string,
  now: number = Date.now(),
): RecoveryTokenRecord | null {
  const key = digestRecoveryToken(token);
  const record = RESET_TOKEN_STORAGE.get(key);
  if (!record) {
    return null;
  }
  if (record.expiresAt < now) {
    RESET_TOKEN_STORAGE.delete(key);
    return null;
  }
  return { email: record.email, consumed: false };
}

export function consumeRecoveryToken(token: string): void {
  RESET_TOKEN_STORAGE.delete(digestRecoveryToken(token));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
