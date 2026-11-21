import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createConfiguredTransactionalEmailMailer,
  type TransactionalEmailMailer,
} from './employee-invitation.js';
import {
  credentialVerificationAgent,
  organizationAccessPolicyAgent,
  type AccessDecision,
  type CredentialVerificationEvidence,
} from './access-agents.js';
import {
  organizationRegistrationCompletenessAgent,
  type OrganizationRegistrationDetails,
} from './organization-registration-agent.js';
import {
  consumeRecoveryToken,
  normalizeEmail,
  passwordRecoveryPolicyAgent,
  passwordReuseCheckAgent,
  readRecoveryToken,
  storeRecoveryToken,
} from './password-recovery.js';

export interface AuthProviderEvidence {
  accountExists: boolean;
  credentialsAccepted: boolean;
  emailSent: boolean;
  userId: string | null;
}

export interface OrganizationAuthResult {
  status: 'approved' | 'denied' | 'email_sent' | 'incomplete';
  decision: AccessDecision | null;
  missingFields: string[];
  userId: string | null;
  emailSent: boolean;
}

export interface PasswordRecoveryResult {
  status: 'email_sent' | 'denied';
  emailSent: boolean;
  accountExists: boolean;
}

export type PasswordResetReason =
  'approved' | 'password_reused' | 'email_mismatch' | 'invalid_token';

export interface PasswordResetResult {
  status: 'approved' | 'denied';
  decision: AccessDecision | null;
  userId: string | null;
  reason: PasswordResetReason;
}

export interface SupabaseAuthClient {
  resetPasswordForEmail?: (email: string) => Promise<{ emailSent: boolean }>;
  updateUserById?: (input: {
    userId: string;
    password: string;
  }) => Promise<{ error: { message: string } | null }>;
  findUserByEmail?: (email: string) => Promise<{ userId: string | null }>;
  signUp(input: {
    email: string;
    password: string;
    options: { data: Record<string, string> };
  }): Promise<{
    data: { user: { id: string } | null; session: unknown };
    error: { message: string } | null;
  }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { user: { id: string } | null; session: unknown };
    error: { message: string } | null;
  }>;
  listUsers?: (input: { page: number; perPage: number }) => Promise<{
    data: { users: Array<{ id: string; email: string }> };
    error: { message: string } | null;
  }>;
}

export function createSupabaseAuthClient(): SupabaseAuthClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase auth is not configured');
  }
  const client: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const auth = client.auth as unknown as SupabaseAuthClient;
  // Admin operations live under auth.admin in supabase-js, not on the public auth client.
  const admin = (
    auth as unknown as {
      admin: {
        listUsers: (input: { page: number; perPage: number }) => Promise<{
          data: { users: Array<{ id: string; email: string }> };
          error: { message: string } | null;
        }>;
        updateUserById: (
          id: string,
          attrs: { password: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    }
  ).admin;
  const wired: SupabaseAuthClient = {
    signUp: auth.signUp.bind(auth),
    signInWithPassword: auth.signInWithPassword.bind(auth),
    listUsers: admin.listUsers.bind(admin),
    findUserByEmail: async (userEmail: string) => {
      const normalized = normalizeEmail(userEmail);
      let page = 1;
      for (;;) {
        const { data, error } = await admin.listUsers({ page, perPage: 200 });
        if (error) {
          return { userId: null };
        }
        const user = data.users.find((entry) => entry.email.trim().toLowerCase() === normalized);
        if (user) {
          return { userId: user.id };
        }
        if (data.users.length < 200) {
          return { userId: null };
        }
        page += 1;
      }
    },
    updateUserById: async ({ userId, password }) => {
      const result = await admin.updateUserById(userId, { password });
      return { error: result.error ? { message: result.error.message } : null };
    },
    resetPasswordForEmail: async (email: string) => {
      const redirectTo = process.env.PASSWORD_RESET_REDIRECT_URL;
      const reset = (
        auth as unknown as {
          resetPasswordForEmail: (
            email: string,
            options?: { redirectTo?: string },
          ) => Promise<{ error: { message: string } | null }>;
        }
      ).resetPasswordForEmail;
      const result = await reset.call(auth, email, redirectTo ? { redirectTo } : undefined);
      return { emailSent: !result.error };
    },
  };
  return wired;
}

export async function verifyAccountExists(
  client: SupabaseAuthClient,
  email: string,
): Promise<boolean> {
  if (!client.listUsers) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await client.listUsers({ page, perPage: 200 });
    if (error) {
      return false;
    }
    if (data.users.some((user) => user.email.trim().toLowerCase() === normalized)) {
      return true;
    }
    if (data.users.length < 200) {
      return false;
    }
    page += 1;
  }
}

export async function registerOrganization(
  details: OrganizationRegistrationDetails,
  client: SupabaseAuthClient = createSupabaseAuthClient(),
): Promise<OrganizationAuthResult> {
  const completeness = organizationRegistrationCompletenessAgent(details);
  if (!completeness.complete) {
    return {
      status: 'incomplete',
      decision: null,
      missingFields: completeness.missingFields,
      userId: null,
      emailSent: false,
    };
  }

  const accountExists = await verifyAccountExists(client, details.email);
  const evidence: CredentialVerificationEvidence = {
    intent: 'register',
    accountExists,
    credentialsAccepted: false,
  };
  const verification = credentialVerificationAgent(evidence);
  const decision = organizationAccessPolicyAgent('register', verification);
  if (!decision.allowed) {
    return { status: 'denied', decision, missingFields: [], userId: null, emailSent: false };
  }

  const { data, error } = await client.signUp({
    email: details.email.trim().toLowerCase(),
    password: details.password,
    options: {
      data: {
        company_name: details.companyName.trim(),
        organization_type: details.organizationType.trim(),
        description: (details.description ?? '').trim(),
      },
    },
  });

  if (error || !data.user) {
    const denied = organizationAccessPolicyAgent(
      'register',
      credentialVerificationAgent({
        intent: 'register',
        accountExists: true,
        credentialsAccepted: false,
      }),
    );
    return {
      status: 'denied',
      decision: denied,
      missingFields: [],
      userId: null,
      emailSent: false,
    };
  }

  const emailSent = data.session === null;
  return {
    status: emailSent ? 'email_sent' : 'approved',
    decision,
    missingFields: [],
    userId: data.user.id,
    emailSent,
  };
}

export async function signInOrganization(
  input: { email: string; password: string },
  client: SupabaseAuthClient = createSupabaseAuthClient(),
): Promise<OrganizationAuthResult> {
  const accountExists = await verifyAccountExists(client, input.email);
  const { data, error } = await client.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  const credentialsAccepted = !error && data.user !== null;
  const verification = credentialVerificationAgent({
    intent: 'sign_in',
    accountExists: accountExists || credentialsAccepted,
    credentialsAccepted,
  });
  const decision = organizationAccessPolicyAgent('sign_in', verification);
  if (!decision.allowed) {
    return { status: 'denied', decision, missingFields: [], userId: null, emailSent: false };
  }
  return {
    status: 'approved',
    decision,
    missingFields: [],
    userId: data.user?.id ?? null,
    emailSent: false,
  };
}

export function buildPasswordRecoveryLink(token: string): string {
  const baseUrl = (
    process.env.PASSWORD_RESET_REDIRECT_URL ??
    process.env.WEB_ORIGIN ??
    'http://localhost:5173'
  ).replace(/\/+$/, '');
  return `${baseUrl}/?token=${encodeURIComponent(token)}`;
}

export async function requestPasswordRecovery(
  input: { email: string },
  client: SupabaseAuthClient = createSupabaseAuthClient(),
  mailer: TransactionalEmailMailer = createConfiguredTransactionalEmailMailer(),
): Promise<PasswordRecoveryResult> {
  const accountExists = await verifyAccountExists(client, input.email);
  if (!accountExists) {
    return { status: 'denied', emailSent: false, accountExists: false };
  }
  const email = normalizeEmail(input.email);
  const token = randomBytes(32).toString('base64url');
  storeRecoveryToken({ email, token });
  const link = buildPasswordRecoveryLink(token);
  const { emailSent } = await mailer.sendEmail({
    to: email,
    subject: 'Recuperá tu contraseña de WorkFlowPlus',
    text: `Hola, para recuperar tu contraseña de WorkFlowPlus entrá a este enlace: ${link}. El enlace es de un solo uso.`,
  });
  if (!emailSent) {
    consumeRecoveryToken(token);
  }
  return { status: emailSent ? 'email_sent' : 'denied', emailSent, accountExists };
}

export async function resetPasswordWithToken(
  input: { email: string; token: string; newPassword: string },
  client: SupabaseAuthClient = createSupabaseAuthClient(),
): Promise<PasswordResetResult> {
  const record = readRecoveryToken(input.token);
  if (!record) {
    return { status: 'denied', decision: null, userId: null, reason: 'invalid_token' };
  }
  if (normalizeEmail(input.email) !== record.email) {
    return { status: 'denied', decision: null, userId: null, reason: 'email_mismatch' };
  }
  const email = record.email;
  const currentCheck = await client.signInWithPassword({
    email,
    password: input.newPassword,
  });
  const newPasswordMatchesCurrent = !currentCheck.error && currentCheck.data.user !== null;
  const assessment = passwordReuseCheckAgent({ newPasswordMatchesCurrent });
  const policy = passwordRecoveryPolicyAgent(assessment);
  const verification = credentialVerificationAgent({
    intent: 'password_reset',
    accountExists: true,
    credentialsAccepted: newPasswordMatchesCurrent,
  });
  const decision = organizationAccessPolicyAgent('password_reset', verification);
  if (!policy.allowed || !decision.allowed) {
    return { status: 'denied', decision, userId: null, reason: 'password_reused' };
  }
  if (!client.findUserByEmail || !client.updateUserById) {
    return { status: 'denied', decision: null, userId: null, reason: 'invalid_token' };
  }
  const found = await client.findUserByEmail(email);
  if (!found.userId) {
    return { status: 'denied', decision: null, userId: null, reason: 'invalid_token' };
  }
  const update = await client.updateUserById({ userId: found.userId, password: input.newPassword });
  if (update.error) {
    return { status: 'denied', decision: null, userId: null, reason: 'invalid_token' };
  }
  consumeRecoveryToken(input.token);
  return { status: 'approved', decision, userId: found.userId, reason: 'approved' };
}

export function registerRecoveryTokenForTest(email: string, token: string): void {
  storeRecoveryToken({ email, token });
}
