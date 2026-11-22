import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { clearDepartmentsForTest } from '../departments.js';
import { digestEmployeeAccessCode, generateEmployeeAccessCode } from './employee-access-code.js';
import { normalizeEmail } from './password-recovery.js';

export type AuthorityLevel = 'administrative' | 'operative';

export const AUTHORITY_LEVELS: AuthorityLevel[] = ['administrative', 'operative'];

export const INVITATION_EXPIRY_DAYS = 30;

export const DEFAULT_DEPARTMENT = 'General';

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

export type EmployeeAvailabilityStatus =
  'available' | 'vacation' | 'leave' | 'absent' | 'temporarily_unavailable';

export const EMPLOYEE_AVAILABILITY_STATUSES: EmployeeAvailabilityStatus[] = [
  'available',
  'vacation',
  'leave',
  'absent',
  'temporarily_unavailable',
];

export function normalizeWeeklyCapacityHours(value: number | undefined): number {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return DEFAULT_WEEKLY_CAPACITY_HOURS;
  }
  return Math.max(0, Number(value));
}

export function normalizeAvailabilityStatus(value: string | undefined): EmployeeAvailabilityStatus {
  if (
    value === 'vacation' ||
    value === 'leave' ||
    value === 'absent' ||
    value === 'temporarily_unavailable'
  ) {
    return value;
  }
  return 'available';
}

export interface EmployeeInvitationInput {
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department?: string;
  authorityLevel?: AuthorityLevel;
  skills?: string[];
  weeklyCapacityHours?: number;
  availabilityStatus?: EmployeeAvailabilityStatus;
}

export type SessionActor =
  | { kind: 'organization'; employeeId?: string }
  | { kind: 'employee'; authorityLevel: AuthorityLevel; employeeId?: string };

export function canInviteEmployees(actor: SessionActor | null): boolean {
  return actor?.kind === 'organization';
}

export function canCreateTask(actor: SessionActor | null): boolean {
  return actor?.kind === 'organization' || actor?.authorityLevel === 'administrative';
}

export function canDeleteEmployeeAccount(actor: SessionActor | null, employeeId: string): boolean {
  return (
    actor?.kind === 'organization' ||
    (actor?.kind === 'employee' && actor.employeeId === employeeId)
  );
}

export function canViewOrganizationTasks(actor: SessionActor | null): boolean {
  return actor !== null;
}

export type RequiredEmployeeInvitationField = 'firstName' | 'lastName' | 'email' | 'position';

export interface EmployeeInvitationCompletenessAssessment {
  complete: boolean;
  missingFields: RequiredEmployeeInvitationField[];
  agentVersion: 'employee-invitation-completeness-v1';
}

export interface EmployeeEmailUniquenessEvidence {
  organizationId: string;
  email: string;
  existingEmails: string[];
  accountExists?: boolean;
}

export interface EmployeeEmailUniquenessAssessment {
  organizationId: string;
  emailAlreadyExists: boolean;
  agentVersion: 'employee-email-uniqueness-v1';
}

export interface EmployeeCodeUniquenessAssessment {
  accessCode: string;
  accessCodeDigest: string;
  attempts: number;
  agentVersion: 'employee-access-code-uniqueness-v1';
}

export type EmployeeInvitationDecisionReason =
  'approved' | 'email_already_exists' | 'incomplete' | 'email_not_sent';

export interface EmployeeInvitationDecision {
  allowed: boolean;
  reason: EmployeeInvitationDecisionReason;
  agentVersion: 'employee-invitation-policy-v1';
  organizationId: string;
}

export interface EmployeeInvitationRecord {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  skills: string[];
  authorityLevel: AuthorityLevel;
  weeklyCapacityHours: number;
  availabilityStatus: EmployeeAvailabilityStatus;
  onboardingCompleted: boolean;
  accessCodeDigest: string;
  status: 'sent' | 'redeemed';
  createdAt: string;
  sentAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

export interface EmployeeCodeEmailMessage {
  to: string;
  employeeId: string;
  organizationId: string;
  firstName: string;
  position: string;
  accessCode: string;
}

export interface EmployeeCodeEmailMailer {
  sendEmployeeCodeEmail: (message: EmployeeCodeEmailMessage) => Promise<{ emailSent: boolean }>;
}

export interface EmployeeInvitationDeps {
  mailer?: EmployeeCodeEmailMailer;
  emailAccountExists?: (email: string) => Promise<boolean>;
  generateAccessCode?: () => string;
  now?: () => number;
}

export interface EmployeeInvitationEmployee {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  skills: string[];
  authorityLevel: AuthorityLevel;
  weeklyCapacityHours: number;
  availabilityStatus: EmployeeAvailabilityStatus;
  onboardingCompleted: boolean;
  joinedAt: string | null;
}

export interface EmployeeInvitationView {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  skills: string[];
  authorityLevel: AuthorityLevel;
  weeklyCapacityHours: number;
  availabilityStatus: EmployeeAvailabilityStatus;
  onboardingCompleted: boolean;
  status: 'pending' | 'accepted';
  sentAt: string;
  expiresAt: string;
  joinedAt: string | null;
}

export function normalizeSkills(skills: string[] | undefined): string[] {
  if (!skills) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const skill of skills) {
    const trimmed = skill.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized.slice(0, 30);
}

export function normalizeDepartment(department?: string): string {
  const trimmed = (department ?? '').trim();
  return trimmed;
}

function toEmployee(record: EmployeeInvitationRecord): EmployeeInvitationEmployee {
  return {
    id: record.id,
    organizationId: record.organizationId,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    position: record.position,
    department: record.department,
    skills: [...record.skills],
    authorityLevel: record.authorityLevel,
    weeklyCapacityHours: record.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY_HOURS,
    availabilityStatus: record.availabilityStatus ?? 'available',
    onboardingCompleted: record.onboardingCompleted ?? false,
    joinedAt: record.redeemedAt,
  };
}

function toView(record: EmployeeInvitationRecord): EmployeeInvitationView {
  return {
    id: record.id,
    organizationId: record.organizationId,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    position: record.position,
    department: record.department,
    skills: [...record.skills],
    authorityLevel: record.authorityLevel,
    weeklyCapacityHours: record.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY_HOURS,
    availabilityStatus: record.availabilityStatus ?? 'available',
    onboardingCompleted: record.onboardingCompleted ?? false,
    status: record.status === 'redeemed' ? 'accepted' : 'pending',
    sentAt: record.sentAt,
    expiresAt: record.expiresAt,
    joinedAt: record.redeemedAt,
  };
}

export interface EmployeeInvitationResult {
  status: 'email_sent' | 'denied' | 'incomplete';
  decision: EmployeeInvitationDecision | null;
  missingFields: RequiredEmployeeInvitationField[];
  employee: EmployeeInvitationEmployee | null;
  emailSent: boolean;
  emailAlreadyExists: boolean;
}

const MAX_CODE_ATTEMPTS = 100;

const EMPLOYEE_INVITATIONS = new Map<string, EmployeeInvitationRecord>();

export const employeeCodeEmailOutbox: EmployeeCodeEmailMessage[] = [];

export function employeeInvitationCompletenessAgent(
  input: EmployeeInvitationInput,
): EmployeeInvitationCompletenessAssessment {
  const fields: Array<[RequiredEmployeeInvitationField, string]> = [
    ['firstName', input.firstName],
    ['lastName', input.lastName],
    ['email', input.email],
    ['position', input.position],
  ];
  const missingFields = fields
    .filter(([, value]) => value.trim().length === 0)
    .map(([field]) => field);
  return {
    complete: missingFields.length === 0,
    missingFields,
    agentVersion: 'employee-invitation-completeness-v1',
  };
}

export function employeeEmailUniquenessAgent(
  evidence: EmployeeEmailUniquenessEvidence,
): EmployeeEmailUniquenessAssessment {
  const normalized = normalizeEmail(evidence.email);
  const existsAmongEmployees = evidence.existingEmails.some(
    (existingEmail) => normalizeEmail(existingEmail) === normalized,
  );
  return {
    organizationId: evidence.organizationId,
    emailAlreadyExists: existsAmongEmployees || evidence.accountExists === true,
    agentVersion: 'employee-email-uniqueness-v1',
  };
}

export function employeeCodeUniquenessAgent(
  existingDigests: Iterable<string>,
  generate: () => string = generateEmployeeAccessCode,
): EmployeeCodeUniquenessAssessment {
  const takenDigests = new Set(existingDigests);
  for (let attempts = 1; attempts <= MAX_CODE_ATTEMPTS; attempts += 1) {
    const accessCode = generate();
    const accessCodeDigest = digestEmployeeAccessCode(accessCode);
    if (!takenDigests.has(accessCodeDigest)) {
      return {
        accessCode,
        accessCodeDigest,
        attempts,
        agentVersion: 'employee-access-code-uniqueness-v1',
      };
    }
  }
  throw new Error('No se pudo generar un c\u00f3digo de acceso \u00fanico');
}

export function employeeInvitationPolicyAgent(
  completeness: EmployeeInvitationCompletenessAssessment,
  emailAssessment: EmployeeEmailUniquenessAssessment,
): EmployeeInvitationDecision {
  if (!completeness.complete) {
    return {
      allowed: false,
      reason: 'incomplete',
      agentVersion: 'employee-invitation-policy-v1',
      organizationId: emailAssessment.organizationId,
    };
  }
  if (emailAssessment.emailAlreadyExists) {
    return {
      allowed: false,
      reason: 'email_already_exists',
      agentVersion: 'employee-invitation-policy-v1',
      organizationId: emailAssessment.organizationId,
    };
  }
  return {
    allowed: true,
    reason: 'approved',
    agentVersion: 'employee-invitation-policy-v1',
    organizationId: emailAssessment.organizationId,
  };
}

export function storeEmployeeInvitation(record: EmployeeInvitationRecord): void {
  EMPLOYEE_INVITATIONS.set(record.id, record);
}

export function getEmployeeInvitationById(id: string): EmployeeInvitationRecord | undefined {
  return EMPLOYEE_INVITATIONS.get(id);
}

export function listEmployeeInvitations(): EmployeeInvitationRecord[] {
  return [...EMPLOYEE_INVITATIONS.values()];
}

export function registeredEmployeeEmails(): string[] {
  return listEmployeeInvitations().map((record) => record.email);
}

export function registeredAccessCodeDigests(): string[] {
  return listEmployeeInvitations().map((record) => record.accessCodeDigest);
}

export function isEmployeeEmailRegistered(email: string): boolean {
  const normalized = normalizeEmail(email);
  return listEmployeeInvitations().some((record) => record.email === normalized);
}

export function isEmployeeAccessCodeDigestTaken(digest: string): boolean {
  return listEmployeeInvitations().some((record) => record.accessCodeDigest === digest);
}

export function listJoinedEmployees(organizationId: string): EmployeeInvitationEmployee[] {
  return listEmployeeInvitations()
    .filter((record) => record.organizationId === organizationId && record.status === 'redeemed')
    .map(toEmployee);
}

export function listInvitations(organizationId: string): EmployeeInvitationView[] {
  return listEmployeeInvitations()
    .filter((record) => record.organizationId === organizationId)
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
    .map(toView);
}

export function isInvitationExpired(
  record: EmployeeInvitationRecord,
  now: number = Date.now(),
): boolean {
  return record.status === 'sent' && Date.parse(record.expiresAt) <= now;
}

export function getEmployeeProfile(
  organizationId: string,
  employeeId: string,
): EmployeeInvitationEmployee | null {
  const record = EMPLOYEE_INVITATIONS.get(employeeId);
  if (!record || record.organizationId !== organizationId) {
    return null;
  }
  return toEmployee(record);
}

export function deleteEmployeeAccount(organizationId: string, employeeId: string): boolean {
  const record = EMPLOYEE_INVITATIONS.get(employeeId);
  if (!record || record.organizationId !== organizationId || record.status !== 'redeemed') {
    return false;
  }
  EMPLOYEE_INVITATIONS.delete(employeeId);
  return true;
}

export function cancelEmployeeInvitation(organizationId: string, invitationId: string): boolean {
  const record = EMPLOYEE_INVITATIONS.get(invitationId);
  if (!record || record.organizationId !== organizationId || record.status !== 'sent') {
    return false;
  }
  EMPLOYEE_INVITATIONS.delete(invitationId);
  return true;
}

export interface UpdateEmployeeProfileInput {
  position?: string;
  department?: string;
  authorityLevel?: AuthorityLevel;
  skills?: string[];
  weeklyCapacityHours?: number;
  availabilityStatus?: EmployeeAvailabilityStatus;
  onboardingCompleted?: boolean;
}

export interface UpdateEmployeeProfileResult {
  status: 'updated' | 'denied';
  employee: EmployeeInvitationEmployee | null;
}

export function updateEmployeeProfile(
  organizationId: string,
  employeeId: string,
  input: UpdateEmployeeProfileInput,
): UpdateEmployeeProfileResult {
  const record = EMPLOYEE_INVITATIONS.get(employeeId);
  if (!record || record.organizationId !== organizationId) {
    return { status: 'denied', employee: null };
  }
  const hasPosition = input.position !== undefined;
  const hasDepartment = input.department !== undefined;
  const hasAuthority = input.authorityLevel !== undefined;
  const hasSkills = input.skills !== undefined;
  const hasCapacity = input.weeklyCapacityHours !== undefined;
  const hasAvailability = input.availabilityStatus !== undefined;
  const hasOnboarding = input.onboardingCompleted !== undefined;
  if (
    !hasPosition &&
    !hasDepartment &&
    !hasAuthority &&
    !hasSkills &&
    !hasCapacity &&
    !hasAvailability &&
    !hasOnboarding
  ) {
    return { status: 'denied', employee: null };
  }
  if (hasPosition && !input.position?.trim()) {
    return { status: 'denied', employee: null };
  }
  if (hasPosition) {
    record.position = input.position?.trim() ?? record.position;
  }
  if (hasDepartment) {
    record.department = normalizeDepartment(input.department);
  }
  if (hasAuthority) {
    record.authorityLevel = input.authorityLevel as AuthorityLevel;
  }
  if (hasSkills) {
    record.skills = normalizeSkills(input.skills);
  }
  if (hasCapacity) {
    record.weeklyCapacityHours = normalizeWeeklyCapacityHours(input.weeklyCapacityHours);
  }
  if (hasAvailability) {
    record.availabilityStatus = normalizeAvailabilityStatus(input.availabilityStatus);
  }
  if (hasOnboarding) {
    record.onboardingCompleted = input.onboardingCompleted === true;
  }
  return { status: 'updated', employee: toEmployee(record) };
}

export interface ResendInvitationResult {
  status: 'email_sent' | 'denied';
  employee: EmployeeInvitationEmployee | null;
  emailSent: boolean;
}

export async function resendEmployeeInvitation(
  organizationId: string,
  invitationId: string,
  deps: EmployeeInvitationDeps = {},
  now: number = Date.now(),
): Promise<ResendInvitationResult> {
  const record = EMPLOYEE_INVITATIONS.get(invitationId);
  if (!record || record.organizationId !== organizationId || record.status !== 'sent') {
    return { status: 'denied', employee: null, emailSent: false };
  }
  const previousDigest = record.accessCodeDigest;
  const previousSentAt = record.sentAt;
  const previousExpiresAt = record.expiresAt;
  const codeAssessment = employeeCodeUniquenessAgent(
    registeredAccessCodeDigests(),
    deps.generateAccessCode,
  );
  const sentAt = new Date(now).toISOString();
  const expiresAt = new Date(now + INVITATION_EXPIRY_DAYS * 24 * 60 * 60_000).toISOString();
  record.accessCodeDigest = codeAssessment.accessCodeDigest;
  record.sentAt = sentAt;
  record.expiresAt = expiresAt;
  const mailer = deps.mailer ?? createConfiguredEmployeeCodeMailer();
  const delivery = await mailer.sendEmployeeCodeEmail({
    to: record.email,
    employeeId: record.id,
    organizationId: record.organizationId,
    firstName: record.firstName,
    position: record.position,
    accessCode: codeAssessment.accessCode,
  });
  if (!delivery.emailSent) {
    record.accessCodeDigest = previousDigest;
    record.sentAt = previousSentAt;
    record.expiresAt = previousExpiresAt;
    return { status: 'denied', employee: null, emailSent: false };
  }
  return { status: 'email_sent', employee: toEmployee(record), emailSent: true };
}

export interface SmtpMailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export type SendSmtpMail = (options: SmtpMailOptions) => Promise<void>;

export function buildEmployeeLoginUrl(): string {
  const base = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/?page=login&role=employee`;
}

export function buildEmployeeCodeEmailText(message: EmployeeCodeEmailMessage): string {
  const loginUrl = buildEmployeeLoginUrl();
  return `Hola ${message.firstName}, tu código de acceso es ${message.accessCode}. Este enlace te lleva directamente a la pantalla de inicio de sesión para empleados de WorkFlowPlus: ${loginUrl}. Ingresá tu código de acceso allí para entrar a tu cuenta; no necesitás ni podés usar este enlace para entrar a la cuenta de la organización.`;
}

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface TransactionalEmailMailer {
  sendEmail: (message: TransactionalEmailMessage) => Promise<{ emailSent: boolean }>;
}

export const devEmailOutbox: TransactionalEmailMessage[] = [];

export function createSmtpTransactionalEmailMailer(
  sendMail: SendSmtpMail,
): TransactionalEmailMailer {
  return {
    async sendEmail(message: TransactionalEmailMessage) {
      try {
        await sendMail({
          from: process.env.TRANSACTIONAL_EMAIL_FROM ?? 'access@your-domain.com',
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return { emailSent: true };
      } catch {
        return { emailSent: false };
      }
    },
  };
}

export function createSmtpEmployeeCodeMailer(sendMail: SendSmtpMail): EmployeeCodeEmailMailer {
  const transactionalMailer = createSmtpTransactionalEmailMailer(sendMail);
  return {
    async sendEmployeeCodeEmail(message: EmployeeCodeEmailMessage) {
      return transactionalMailer.sendEmail({
        to: message.to,
        subject: 'Tu c\u00f3digo de acceso a WorkFlowPlus',
        text: buildEmployeeCodeEmailText(message),
      });
    },
  };
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return { host, port: Number(process.env.SMTP_PORT ?? 587), user, pass };
}

export function assertTransactionalEmailProviderConfigured(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    !readSmtpConfig() &&
    !process.env.TRANSACTIONAL_EMAIL_API_URL
  ) {
    throw new Error('No transactional email provider is configured');
  }
}

async function sendViaSmtp(config: SmtpConfig, options: SmtpMailOptions): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transporter.sendMail(options);
}

export function createConfiguredEmployeeCodeMailer(): EmployeeCodeEmailMailer {
  assertTransactionalEmailProviderConfigured();
  return {
    async sendEmployeeCodeEmail(message: EmployeeCodeEmailMessage) {
      const smtpConfig = readSmtpConfig();
      if (smtpConfig) {
        return createSmtpEmployeeCodeMailer((options) =>
          sendViaSmtp(smtpConfig, options),
        ).sendEmployeeCodeEmail(message);
      }
      const apiUrl = process.env.TRANSACTIONAL_EMAIL_API_URL;
      if (!apiUrl) {
        if (process.env.NODE_ENV !== 'production') {
          employeeCodeEmailOutbox.push(message);
          return { emailSent: true };
        }
        return { emailSent: false };
      }
      const apiKey = process.env.TRANSACTIONAL_EMAIL_API_KEY;
      const from = process.env.TRANSACTIONAL_EMAIL_FROM ?? 'access@your-domain.com';
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject: 'Tu c\u00f3digo de acceso a WorkFlowPlus',
            text: buildEmployeeCodeEmailText(message),
            employeeId: message.employeeId,
          }),
        });
        return { emailSent: response.ok };
      } catch {
        return { emailSent: false };
      }
    },
  };
}

export function createConfiguredTransactionalEmailMailer(): TransactionalEmailMailer {
  assertTransactionalEmailProviderConfigured();
  return {
    async sendEmail(message: TransactionalEmailMessage) {
      const smtpConfig = readSmtpConfig();
      if (smtpConfig) {
        return createSmtpTransactionalEmailMailer((options) =>
          sendViaSmtp(smtpConfig, options),
        ).sendEmail(message);
      }
      const apiUrl = process.env.TRANSACTIONAL_EMAIL_API_URL;
      if (!apiUrl) {
        if (process.env.NODE_ENV !== 'production') {
          devEmailOutbox.push(message);
          return { emailSent: true };
        }
        return { emailSent: false };
      }
      const apiKey = process.env.TRANSACTIONAL_EMAIL_API_KEY;
      const from = process.env.TRANSACTIONAL_EMAIL_FROM ?? 'access@your-domain.com';
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ from, ...message }),
        });
        return { emailSent: response.ok };
      } catch {
        return { emailSent: false };
      }
    },
  };
}

export function generateUniqueEmployeeId(): string {
  let id = randomUUID();
  while (EMPLOYEE_INVITATIONS.has(id)) {
    id = randomUUID();
  }
  return id;
}

export function isEmployeeIdTaken(id: string): boolean {
  return EMPLOYEE_INVITATIONS.has(id);
}

export async function createEmployeeInvitation(
  input: EmployeeInvitationInput,
  deps: EmployeeInvitationDeps = {},
): Promise<EmployeeInvitationResult> {
  const completeness = employeeInvitationCompletenessAgent(input);
  const accountExists = deps.emailAccountExists
    ? await deps.emailAccountExists(input.email)
    : false;
  const emailAssessment = employeeEmailUniquenessAgent({
    organizationId: input.organizationId,
    email: input.email,
    existingEmails: registeredEmployeeEmails(),
    accountExists,
  });
  const decision = employeeInvitationPolicyAgent(completeness, emailAssessment);
  if (!decision.allowed) {
    return {
      status: completeness.complete ? 'denied' : 'incomplete',
      decision,
      missingFields: completeness.missingFields,
      employee: null,
      emailSent: false,
      emailAlreadyExists: emailAssessment.emailAlreadyExists,
    };
  }

  const codeAssessment = employeeCodeUniquenessAgent(
    registeredAccessCodeDigests(),
    deps.generateAccessCode,
  );
  const now = deps.now ? deps.now() : Date.now();
  const sentAt = new Date(now).toISOString();
  const expiresAt = new Date(now + INVITATION_EXPIRY_DAYS * 24 * 60 * 60_000).toISOString();
  const weeklyCapacityHours = normalizeWeeklyCapacityHours(input.weeklyCapacityHours);
  const availabilityStatus = normalizeAvailabilityStatus(input.availabilityStatus);
  const employee: EmployeeInvitationEmployee = {
    id: generateUniqueEmployeeId(),
    organizationId: input.organizationId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizeEmail(input.email),
    position: input.position.trim(),
    department: normalizeDepartment(input.department),
    skills: normalizeSkills(input.skills),
    authorityLevel: input.authorityLevel ?? 'operative',
    weeklyCapacityHours,
    availabilityStatus,
    onboardingCompleted: false,
    joinedAt: null,
  };
  const record: EmployeeInvitationRecord = {
    id: employee.id,
    organizationId: employee.organizationId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    position: employee.position,
    department: employee.department,
    skills: [...employee.skills],
    authorityLevel: employee.authorityLevel,
    weeklyCapacityHours,
    availabilityStatus,
    onboardingCompleted: false,
    accessCodeDigest: codeAssessment.accessCodeDigest,
    status: 'sent',
    createdAt: sentAt,
    sentAt,
    expiresAt,
    redeemedAt: null,
  };
  storeEmployeeInvitation(record);

  const mailer = deps.mailer ?? createConfiguredEmployeeCodeMailer();
  const delivery = await mailer.sendEmployeeCodeEmail({
    to: employee.email,
    employeeId: employee.id,
    organizationId: employee.organizationId,
    firstName: employee.firstName,
    position: employee.position,
    accessCode: codeAssessment.accessCode,
  });
  if (!delivery.emailSent) {
    EMPLOYEE_INVITATIONS.delete(employee.id);
    return {
      status: 'denied',
      decision: {
        allowed: false,
        reason: 'email_not_sent',
        agentVersion: 'employee-invitation-policy-v1',
        organizationId: employee.organizationId,
      },
      missingFields: [],
      employee: null,
      emailSent: false,
      emailAlreadyExists: false,
    };
  }

  return {
    status: 'email_sent',
    decision,
    missingFields: [],
    employee,
    emailSent: true,
    emailAlreadyExists: false,
  };
}

export interface EmployeeSignInResult {
  status: 'approved' | 'denied';
  employee: EmployeeInvitationEmployee | null;
  acceptedNow: boolean;
}

// The access code is reusable: every sign-in with it assigns the same employee id. It stops working only when the owner deletes the employee account.
// Pending invitations expire INVITATION_EXPIRY_DAYS after the last send; joined (redeemed) employees keep using the same code without expiry.
export function redeemEmployeeAccessCode(
  accessCode: string,
  organizationId?: string,
  now: number = Date.now(),
): EmployeeSignInResult {
  const digest = digestEmployeeAccessCode(accessCode.trim());
  const record = listEmployeeInvitations().find(
    (invitation) => invitation.accessCodeDigest === digest,
  );
  if (!record) {
    return { status: 'denied', employee: null, acceptedNow: false };
  }
  // Los códigos de acceso son únicos en toda la plataforma, por eso el código solo basta.
  // Si se pasa organizationId se valida que pertenezca a esa organización (compatibilidad).
  if (organizationId !== undefined && record.organizationId !== organizationId) {
    return { status: 'denied', employee: null, acceptedNow: false };
  }
  if (record.status !== 'redeemed' && isInvitationExpired(record, now)) {
    return { status: 'denied', employee: null, acceptedNow: false };
  }
  const acceptedNow = record.status !== 'redeemed';
  if (record.status !== 'redeemed') {
    record.status = 'redeemed';
    record.redeemedAt = new Date(now).toISOString();
  }
  return {
    status: 'approved',
    employee: toEmployee(record),
    acceptedNow,
  };
}

export interface DepartmentLead {
  organizationId: string;
  department: string;
  employeeId: string;
  assignedAt: string;
  assignedBy: string | null;
}

export interface AssignDepartmentLeadResult {
  status: 'assigned' | 'denied';
  reason: 'not_owner' | 'not_administrative' | 'not_employee' | 'already_lead' | null;
  lead: DepartmentLead | null;
}

const DEPARTMENT_LEADS = new Map<string, DepartmentLead>();

function departmentLeadKey(organizationId: string, department: string): string {
  return `${organizationId}|${department}`;
}

function employeeLeadKey(organizationId: string, employeeId: string): string {
  return `${organizationId}|${employeeId}`;
}

export function unassignEmployeesFromDepartment(
  organizationId: string,
  department: string,
): number {
  const target = department.trim().toLowerCase();
  if (!target) {
    return 0;
  }
  let unassigned = 0;
  for (const record of EMPLOYEE_INVITATIONS.values()) {
    if (
      record.organizationId === organizationId &&
      record.department.trim().toLowerCase() === target
    ) {
      record.department = '';
      unassigned += 1;
    }
  }
  for (const [key, lead] of [...DEPARTMENT_LEADS.entries()]) {
    if (lead.organizationId === organizationId && lead.department.trim().toLowerCase() === target) {
      DEPARTMENT_LEADS.delete(key);
    }
  }
  return unassigned;
}

export function assignDepartmentLead(
  organizationId: string,
  department: string,
  employeeId: string,
  actor: SessionActor | null,
): AssignDepartmentLeadResult {
  if (!actor || actor.kind !== 'organization') {
    return { status: 'denied', reason: 'not_owner', lead: null };
  }
  const normalizedDepartment = normalizeDepartment(department);
  const employee = getEmployeeProfile(organizationId, employeeId);
  if (!employee) {
    return { status: 'denied', reason: 'not_employee', lead: null };
  }
  if (employee.authorityLevel !== 'administrative') {
    return { status: 'denied', reason: 'not_administrative', lead: null };
  }
  const record = EMPLOYEE_INVITATIONS.get(employeeId);
  if (record) {
    record.department = normalizedDepartment;
  }
  const existingLeadKey = departmentLeadKey(organizationId, normalizedDepartment);
  if (DEPARTMENT_LEADS.has(existingLeadKey)) {
    return { status: 'denied', reason: 'already_lead', lead: null };
  }
  const existingEmployeeLeadKey = employeeLeadKey(organizationId, employeeId);
  if (DEPARTMENT_LEADS.has(existingEmployeeLeadKey)) {
    return { status: 'denied', reason: 'already_lead', lead: null };
  }
  const lead: DepartmentLead = {
    organizationId,
    department: normalizedDepartment,
    employeeId,
    assignedAt: new Date().toISOString(),
    assignedBy: actor.employeeId ?? null,
  };
  DEPARTMENT_LEADS.set(existingLeadKey, lead);
  DEPARTMENT_LEADS.set(existingEmployeeLeadKey, lead);
  return { status: 'assigned', reason: null, lead };
}

export function removeDepartmentLead(
  organizationId: string,
  department: string,
  actor: SessionActor | null,
): { status: 'removed' | 'denied'; reason: 'not_owner' | 'not_found' | null } {
  if (!actor || actor.kind !== 'organization') {
    return { status: 'denied', reason: 'not_owner' };
  }
  const normalizedDepartment = normalizeDepartment(department);
  const key = departmentLeadKey(organizationId, normalizedDepartment);
  const lead = DEPARTMENT_LEADS.get(key);
  if (!lead) {
    return { status: 'denied', reason: 'not_found' };
  }
  DEPARTMENT_LEADS.delete(key);
  DEPARTMENT_LEADS.delete(employeeLeadKey(organizationId, lead.employeeId));
  return { status: 'removed', reason: null };
}

export function getDepartmentLead(
  organizationId: string,
  department: string,
): DepartmentLead | null {
  const normalizedDepartment = normalizeDepartment(department);
  const lead = DEPARTMENT_LEADS.get(departmentLeadKey(organizationId, normalizedDepartment));
  return lead ?? null;
}

export function listDepartmentLeads(organizationId: string): DepartmentLead[] {
  const leads: DepartmentLead[] = [];
  const seen = new Set<string>();
  for (const lead of DEPARTMENT_LEADS.values()) {
    if (lead.organizationId !== organizationId) {
      continue;
    }
    const key = departmentLeadKey(organizationId, lead.department);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    leads.push(lead);
  }
  return leads.sort((a, b) => a.department.localeCompare(b.department));
}

export function isDepartmentLead(organizationId: string, employeeId: string): boolean {
  return DEPARTMENT_LEADS.has(employeeLeadKey(organizationId, employeeId));
}

export function getDepartmentLeadByEmployee(
  organizationId: string,
  employeeId: string,
): DepartmentLead | null {
  const lead = DEPARTMENT_LEADS.get(employeeLeadKey(organizationId, employeeId));
  return lead ?? null;
}

export function canAssignTaskToEmployee(
  actor: SessionActor | null,
  organizationId: string,
  ownerId: string | null | undefined,
): { allowed: boolean; reason: 'invalid_owner' | null } {
  if (!ownerId) {
    return { allowed: true, reason: null };
  }
  if (!actor) {
    return { allowed: true, reason: null };
  }
  if (actor.kind === 'organization') {
    return { allowed: true, reason: null };
  }
  if (actor.kind === 'employee' && actor.authorityLevel === 'administrative') {
    const employee = getEmployeeProfile(organizationId, actor.employeeId ?? '');
    if (!employee) {
      return { allowed: false, reason: 'invalid_owner' };
    }
    const lead = getDepartmentLeadByEmployee(organizationId, actor.employeeId ?? '');
    if (!lead) {
      return { allowed: true, reason: null };
    }
    const target = getEmployeeProfile(organizationId, ownerId);
    if (!target) {
      return { allowed: false, reason: 'invalid_owner' };
    }
    if (target.authorityLevel !== 'operative') {
      return { allowed: false, reason: 'invalid_owner' };
    }
    if (target.department !== lead.department) {
      return { allowed: false, reason: 'invalid_owner' };
    }
    return { allowed: true, reason: null };
  }
  return { allowed: true, reason: null };
}

export function clearEmployeeInvitationsForTest(): void {
  EMPLOYEE_INVITATIONS.clear();
  clearDepartmentsForTest();
  employeeCodeEmailOutbox.length = 0;
  devEmailOutbox.length = 0;
}
