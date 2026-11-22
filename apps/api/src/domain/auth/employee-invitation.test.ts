import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { digestEmployeeAccessCode } from './employee-access-code.js';
import {
  assertTransactionalEmailProviderConfigured,
  assignDepartmentLead,
  canAssignTaskToEmployee,
  clearEmployeeInvitationsForTest,
  createConfiguredEmployeeCodeMailer,
  createConfiguredTransactionalEmailMailer,
  createEmployeeInvitation,
  createSmtpEmployeeCodeMailer,
  createSmtpTransactionalEmailMailer,
  employeeCodeEmailOutbox,
  employeeCodeUniquenessAgent,
  employeeEmailUniquenessAgent,
  employeeInvitationCompletenessAgent,
  getDepartmentLead,
  getEmployeeInvitationById,
  isDepartmentLead,
  isEmployeeAccessCodeDigestTaken,
  isEmployeeEmailRegistered,
  isEmployeeIdTaken,
  listDepartmentLeads,
  redeemEmployeeAccessCode,
  removeDepartmentLead,
  type EmployeeCodeEmailMailer,
  type EmployeeCodeEmailMessage,
} from './employee-invitation.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function capturingMailer() {
  const messages: EmployeeCodeEmailMessage[] = [];
  const mailer: EmployeeCodeEmailMailer = {
    sendEmployeeCodeEmail: async (message: EmployeeCodeEmailMessage) => {
      messages.push(message);
      return { emailSent: true };
    },
  };
  return { messages, mailer };
}

async function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('employee invitation agents', () => {
  beforeEach(() => {
    clearEmployeeInvitationsForTest();
  });

  afterEach(() => {
    clearEmployeeInvitationsForTest();
  });

  it('reports missing employee fields without field values', () => {
    const result = employeeInvitationCompletenessAgent({
      organizationId: ORGANIZATION_ID,
      firstName: '',
      lastName: 'LÃ³pez',
      email: '  ',
      position: '',
    });
    expect(result.complete).toBe(false);
    expect(result.missingFields).toEqual(['firstName', 'email', 'position']);
    expect(result.agentVersion).toBe('employee-invitation-completeness-v1');
  });

  it('detects a repeated email across organizations', () => {
    const result = employeeEmailUniquenessAgent({
      organizationId: OTHER_ORGANIZATION_ID,
      email: 'Andrea@Correo.com',
      existingEmails: ['andrea@correo.com'],
    });
    expect(result.emailAlreadyExists).toBe(true);
    expect(result.agentVersion).toBe('employee-email-uniqueness-v1');
  });

  it('regenerates a code when its digest is already taken', () => {
    const takenCode = 'TFA-AAAA-BBBB-CCCC';
    const freshCode = 'TFA-DDDD-EEEE-FFFF';
    const codes = [takenCode, freshCode];
    const result = employeeCodeUniquenessAgent(
      [digestEmployeeAccessCode(takenCode)],
      () => codes.shift() ?? freshCode,
    );
    expect(result.accessCode).toBe(freshCode);
    expect(result.attempts).toBe(2);
    expect(result.agentVersion).toBe('employee-access-code-uniqueness-v1');
  });

  it('creates an invitation with an automatic id, a unique code digest and a sent email', async () => {
    const { messages, mailer } = capturingMailer();
    const result = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'Andrea@Correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );

    expect(result.status).toBe('email_sent');
    expect(result.emailSent).toBe(true);
    expect(result.employee?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.employee?.email).toBe('andrea@correo.com');
    expect('accessCode' in result).toBe(false);
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('andrea@correo.com');
    expect(messages[0].accessCode).toMatch(/^TFA-/);
    const stored = getEmployeeInvitationById(result.employee?.id ?? '');
    expect(stored?.accessCodeDigest).toBe(digestEmployeeAccessCode(messages[0].accessCode));
    expect(stored).not.toHaveProperty('accessCode');
    expect(isEmployeeEmailRegistered('andrea@correo.com')).toBe(true);
    expect(isEmployeeAccessCodeDigestTaken(stored?.accessCodeDigest ?? '')).toBe(true);
  });

  it('sends the code by SMTP to the entered email with a direct login link', async () => {
    const previousOrigin = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = 'https://app.workflowplus.test';
    try {
      const sent: Array<{ to: string; subject: string; text: string }> = [];
      const mailer = createSmtpEmployeeCodeMailer(async (options) => {
        sent.push({ to: options.to, subject: options.subject, text: options.text });
      });
      const result = await createEmployeeInvitation(
        {
          organizationId: ORGANIZATION_ID,
          firstName: 'Andrea',
          lastName: 'López',
          email: 'andrea@correo.com',
          position: 'Diseñadora',
        },
        { mailer },
      );
      expect(result.status).toBe('email_sent');
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('andrea@correo.com');
      expect(sent[0].subject).toContain('código de acceso');
      expect(sent[0].text).toMatch(/TFA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/);
      expect(sent[0].text).toContain('https://app.workflowplus.test/?page=login&role=employee');
    } finally {
      if (previousOrigin === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = previousOrigin;
      }
    }
  });

  it('queues the code for the entered email in the dev outbox when no provider is configured', async () => {
    const result = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer: createConfiguredEmployeeCodeMailer() },
    );
    expect(result.status).toBe('email_sent');
    expect(employeeCodeEmailOutbox).toHaveLength(1);
    expect(employeeCodeEmailOutbox[0].to).toBe('andrea@correo.com');
    expect(employeeCodeEmailOutbox[0].accessCode).toMatch(/^TFA-/);
  });

  it('does not keep the invitation when the mail cannot be sent', async () => {
    const failingMailer = createSmtpEmployeeCodeMailer(async () => {
      throw new Error('SMTP unavailable');
    });
    const result = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer: failingMailer },
    );
    expect(result.status).toBe('denied');
    expect(result.emailSent).toBe(false);
    expect(isEmployeeEmailRegistered('andrea@correo.com')).toBe(false);
  });

  it('denies a repeated email globally and does not send another code', async () => {
    const { messages, mailer } = capturingMailer();
    await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    const duplicate = await createEmployeeInvitation(
      {
        organizationId: OTHER_ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'ANDREA@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );

    expect(duplicate.status).toBe('denied');
    expect(duplicate.emailAlreadyExists).toBe(true);
    expect(duplicate.decision?.reason).toBe('email_already_exists');
    expect(messages).toHaveLength(1);
  });

  it('never issues the same access code to two employees', async () => {
    const { messages, mailer } = capturingMailer();
    const repeatedCode = 'TFA-AAAA-BBBB-CCCC';
    const uniqueCode = 'TFA-DDDD-EEEE-FFFF';
    const codes = [repeatedCode, repeatedCode, uniqueCode];
    const generateAccessCode = () => codes.shift() ?? uniqueCode;

    await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer, generateAccessCode },
    );
    await createEmployeeInvitation(
      {
        organizationId: OTHER_ORGANIZATION_ID,
        firstName: 'Bruno',
        lastName: 'MÃ©ndez',
        email: 'bruno@correo.com',
        position: 'Analista',
      },
      { mailer, generateAccessCode },
    );

    expect(new Set(messages.map((message) => message.accessCode)).size).toBe(2);
  });

  it('assigns a different system-generated id to each employee', async () => {
    const { mailer } = capturingMailer();
    const first = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    const second = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Bruno',
        lastName: 'MÃ©ndez',
        email: 'bruno@correo.com',
        position: 'Analista',
      },
      { mailer },
    );
    expect(first.employee?.id).not.toBe(second.employee?.id);
    expect(isEmployeeIdTaken(first.employee?.id ?? '')).toBe(true);
    expect(isEmployeeIdTaken(second.employee?.id ?? '')).toBe(true);
  });

  it('assigns the system id on every sign-in with the reusable code', async () => {
    const { messages, mailer } = capturingMailer();
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    const code = messages[0].accessCode;

    expect(redeemEmployeeAccessCode(code, OTHER_ORGANIZATION_ID).status).toBe('denied');
    const firstSignIn = redeemEmployeeAccessCode(code, ORGANIZATION_ID);
    expect(firstSignIn.status).toBe('approved');
    expect(firstSignIn.employee?.id).toBe(created.employee?.id);
    const secondSignIn = redeemEmployeeAccessCode(code, ORGANIZATION_ID);
    expect(secondSignIn.status).toBe('approved');
    expect(secondSignIn.employee?.id).toBe(created.employee?.id);
    expect(redeemEmployeeAccessCode('TFA-XXXX-YYYY-ZZZZ', ORGANIZATION_ID).status).toBe('denied');
  });

  it('keeps the code valid long after creation until the account is deleted once joined', async () => {
    const { messages, mailer } = capturingMailer();
    const createdAt = Date.parse('2026-11-08T10:00:00.000Z');
    await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer, now: () => createdAt },
    );
    redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID, createdAt);
    const muchLater = createdAt + 365 * 24 * 60 * 60_000;
    expect(
      redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID, muchLater).status,
    ).toBe('approved');
  });

  it('expires pending invitations but lets resend issue a fresh code', async () => {
    const { messages, mailer } = capturingMailer();
    const { cancelEmployeeInvitation, listInvitations, resendEmployeeInvitation } =
      await import('./employee-invitation.js');
    const createdAt = Date.parse('2026-11-08T10:00:00.000Z');
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
        department: 'DiseÃ±o',
        skills: ['Excel'],
      },
      { mailer, now: () => createdAt },
    );
    expect(created.employee).toMatchObject({
      department: 'DiseÃ±o',
      skills: ['Excel'],
      joinedAt: null,
    });
    const invites = listInvitations(ORGANIZATION_ID);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      status: 'pending',
      sentAt: new Date(createdAt).toISOString(),
    });
    expect(Date.parse(invites[0].expiresAt) - createdAt).toBe(30 * 24 * 60 * 60_000);
    const muchLater = createdAt + 31 * 24 * 60 * 60_000;
    expect(
      redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID, muchLater).status,
    ).toBe('denied');
    const resent = await resendEmployeeInvitation(
      ORGANIZATION_ID,
      created.employee?.id ?? '',
      { mailer },
      muchLater,
    );
    expect(resent.status).toBe('email_sent');
    expect(messages).toHaveLength(2);
    expect(messages[1].accessCode).not.toBe(messages[0].accessCode);
    expect(messages[1].to).toBe('andrea@correo.com');
    expect(
      redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID, muchLater).status,
    ).toBe('denied');
    expect(
      redeemEmployeeAccessCode(messages[1].accessCode, ORGANIZATION_ID, muchLater).status,
    ).toBe('approved');
    expect(cancelEmployeeInvitation(ORGANIZATION_ID, created.employee?.id ?? '')).toBe(false);
  });

  it('cancels a pending invitation and frees the email', async () => {
    const { mailer } = capturingMailer();
    const { cancelEmployeeInvitation } = await import('./employee-invitation.js');
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    expect(cancelEmployeeInvitation(ORGANIZATION_ID, created.employee?.id ?? '')).toBe(true);
    expect(isEmployeeEmailRegistered('andrea@correo.com')).toBe(false);
    const recreated = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    expect(recreated.status).toBe('email_sent');
  });

  it('updates position, department, authority and skills on the profile', async () => {
    const { messages, mailer } = capturingMailer();
    const { updateEmployeeProfile } = await import('./employee-invitation.js');
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'LÃ³pez',
        email: 'andrea@correo.com',
        position: 'DiseÃ±adora',
      },
      { mailer },
    );
    redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    const updated = updateEmployeeProfile(ORGANIZATION_ID, created.employee?.id ?? '', {
      position: 'Lead de DiseÃ±o',
      department: 'DiseÃ±o',
      authorityLevel: 'administrative',
      skills: ['Excel', 'SQL', 'excel', ' Finanzas '],
    });
    expect(updated.status).toBe('updated');
    expect(updated.employee).toMatchObject({
      position: 'Lead de DiseÃ±o',
      department: 'DiseÃ±o',
      authorityLevel: 'administrative',
      skills: ['Excel', 'SQL', 'Finanzas'],
    });
  });

  it('ignores a client-supplied id and exposes sign-in with the assigned id', async () => {
    const { messages, mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });
    const suppliedId = '99999999-9999-4999-8999-999999999999';
    const created = await postJson(app, '/employees/invites', {
      organizationId: ORGANIZATION_ID,
      firstName: 'Andrea',
      lastName: 'LÃ³pez',
      email: 'andrea@correo.com',
      position: 'DiseÃ±adora',
      id: suppliedId,
    });
    expect(created.status).toBe(200);
    const employee = created.body.employee as { id: string };
    expect(employee.id).not.toBe(suppliedId);

    const signIn = await postJson(app, '/employees/sign-in', {
      organizationId: ORGANIZATION_ID,
      accessCode: messages[0].accessCode,
    });
    expect(signIn.status).toBe(200);
    expect(signIn.body).toMatchObject({ status: 'approved', employee: { id: employee.id } });

    const reused = await postJson(app, '/employees/sign-in', {
      organizationId: ORGANIZATION_ID,
      accessCode: messages[0].accessCode,
    });
    expect(reused.status).toBe(200);
    expect(reused.body).toMatchObject({ status: 'approved', employee: { id: employee.id } });
  });

  it('exposes the invitation endpoint with organizationId and the duplicate-email decision', async () => {
    const { mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });
    const created = await postJson(app, '/employees/invites', {
      organizationId: ORGANIZATION_ID,
      firstName: 'Andrea',
      lastName: 'LÃ³pez',
      email: 'andrea@correo.com',
      position: 'DiseÃ±adora',
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ status: 'email_sent', emailSent: true });

    const duplicate = await postJson(app, '/employees/invites', {
      organizationId: ORGANIZATION_ID,
      firstName: 'Andrea',
      lastName: 'LÃ³pez',
      email: 'andrea@correo.com',
      position: 'DiseÃ±adora',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      status: 'denied',
      emailAlreadyExists: true,
      emailSent: false,
    });

    const invalid = await postJson(app, '/employees/invites', {
      firstName: 'Andrea',
      lastName: 'LÃ³pez',
      email: 'nuevo@correo.com',
      position: 'DiseÃ±adora',
    });
    expect(invalid.status).toBe(400);
  });
});

describe('department leads', () => {
  beforeEach(() => {
    clearEmployeeInvitationsForTest();
  });

  afterEach(() => {
    clearEmployeeInvitationsForTest();
  });

  it('no permite asignar jefe de departamento si no es owner', () => {
    const employeeActor = {
      kind: 'employee',
      authorityLevel: 'administrative',
      employeeId: 'emp-1',
    } as const;
    const result = assignDepartmentLead(ORGANIZATION_ID, 'Ventas', 'emp-admin-1', employeeActor);
    expect(result.status).toBe('denied');
    expect(result.reason).toBe('not_owner');
  });

  it('no permite asignar jefe de departamento a un empleado no existente', () => {
    const ownerActor = { kind: 'organization' } as const;
    const result = assignDepartmentLead(ORGANIZATION_ID, 'Ventas', 'emp-inexistente', ownerActor);
    expect(result.status).toBe('denied');
    expect(result.reason).toBe('not_employee');
  });

  it('obtiene y lista jefes de departamento vacíos inicialmente', () => {
    expect(getDepartmentLead(ORGANIZATION_ID, 'Ventas')).toBeNull();
    expect(listDepartmentLeads(ORGANIZATION_ID)).toEqual([]);
    expect(isDepartmentLead(ORGANIZATION_ID, 'any-id')).toBe(false);
  });

  it('remueve un jefe de departamento solo como owner', () => {
    const ownerActor = { kind: 'organization' } as const;
    const result = removeDepartmentLead(ORGANIZATION_ID, 'Ventas', ownerActor);
    expect(result.status).toBe('denied');
    expect(result.reason).toBe('not_found');

    const employeeActor = {
      kind: 'employee',
      authorityLevel: 'administrative',
      employeeId: 'emp-1',
    } as const;
    const denied = removeDepartmentLead(ORGANIZATION_ID, 'Ventas', employeeActor);
    expect(denied.status).toBe('denied');
    expect(denied.reason).toBe('not_owner');
  });

  it('canAssignTaskToEmployee permite al owner asignar a cualquier empleado', () => {
    const ownerActor = { kind: 'organization' } as const;
    expect(canAssignTaskToEmployee(ownerActor, ORGANIZATION_ID, 'emp-1').allowed).toBe(true);
  });

  it('canAssignTaskToEmployee permite a administrativo sin lead asignar a cualquiera', async () => {
    const { mailer } = capturingMailer();
    const result = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Líder',
        lastName: 'Test',
        email: 'lider@test.com',
        position: 'Líder',
        department: 'Ventas',
        authorityLevel: 'administrative',
      },
      { mailer },
    );
    expect(result.status).toBe('email_sent');
    const adminLeader = {
      kind: 'employee',
      authorityLevel: 'administrative',
      employeeId: result.employee!.id,
    } as const;
    expect(canAssignTaskToEmployee(adminLeader, ORGANIZATION_ID, 'emp-operative-1').allowed).toBe(
      true,
    );
  });
});

describe('transactional email provider configuration', () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    TRANSACTIONAL_EMAIL_API_URL: process.env.TRANSACTIONAL_EMAIL_API_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('fails fast in production when no mail provider is configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.TRANSACTIONAL_EMAIL_API_URL;

    expect(() => assertTransactionalEmailProviderConfigured()).toThrow(
      'No transactional email provider is configured',
    );
  });

  it('accepts SMTP or HTTP provider configuration in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_USER = 'user@example.test';
    process.env.SMTP_PASS = 'not-a-real-password';
    delete process.env.TRANSACTIONAL_EMAIL_API_URL;
    expect(() => assertTransactionalEmailProviderConfigured()).not.toThrow();

    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.TRANSACTIONAL_EMAIL_API_URL = 'https://mail.example.test/send';
    expect(() => assertTransactionalEmailProviderConfigured()).not.toThrow();
  });

  it('logs SMTP failures without throwing or exposing credentials', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mailer = createSmtpTransactionalEmailMailer(async () => {
      throw new Error('Invalid login: 535');
    });

    try {
      await expect(
        mailer.sendEmail({ to: 'owner@example.test', subject: 'Prueba', text: 'Contenido' }),
      ).resolves.toEqual({ emailSent: false });
      expect(errorSpy).toHaveBeenCalledWith('[email] SMTP delivery failed:', 'Invalid login: 535');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs HTTP provider failures without exposing credentials', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.TRANSACTIONAL_EMAIL_API_URL = 'https://mail.example.test/send';

    const originalFetch = globalThis.fetch;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    try {
      await expect(
        createConfiguredTransactionalEmailMailer().sendEmail({
          to: 'owner@example.test',
          subject: 'Prueba',
          text: 'Contenido',
        }),
      ).resolves.toEqual({ emailSent: false });
      expect(errorSpy).toHaveBeenCalledWith('[email] HTTP email delivery failed:', 'network down');
    } finally {
      globalThis.fetch = originalFetch;
      errorSpy.mockRestore();
    }
  });
});
