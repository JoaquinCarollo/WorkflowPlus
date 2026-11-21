import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import {
  canCreateTask,
  canDeleteEmployeeAccount,
  canInviteEmployees,
  canViewOrganizationTasks,
  clearEmployeeInvitationsForTest,
  createEmployeeInvitation,
  redeemEmployeeAccessCode,
  type EmployeeCodeEmailMailer,
  type EmployeeCodeEmailMessage,
} from './employee-invitation.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

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

async function requestJson(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('employee authority level', () => {
  beforeEach(() => {
    clearEmployeeInvitationsForTest();
  });

  afterEach(() => {
    clearEmployeeInvitationsForTest();
  });

  it('defaults to operative when no level is chosen', async () => {
    const { mailer } = capturingMailer();
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
    expect(result.employee?.authorityLevel).toBe('operative');
  });

  it('stores the chosen administrative level and returns it on sign-in', async () => {
    const { messages, mailer } = capturingMailer();
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Bruno',
        lastName: 'Méndez',
        email: 'bruno@correo.com',
        position: 'Analista',
        authorityLevel: 'administrative',
      },
      { mailer },
    );
    expect(created.employee?.authorityLevel).toBe('administrative');
    const signIn = redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    expect(signIn.employee?.authorityLevel).toBe('administrative');
  });

  it('only allows the organization owner to invite, and owner or administrative to create tasks', () => {
    const owner = { kind: 'organization' } as const;
    const admin = { kind: 'employee', authorityLevel: 'administrative' } as const;
    const operative = { kind: 'employee', authorityLevel: 'operative' } as const;

    expect(canInviteEmployees(owner)).toBe(true);
    expect(canInviteEmployees(admin)).toBe(false);
    expect(canInviteEmployees(operative)).toBe(false);
    expect(canInviteEmployees(null)).toBe(false);

    expect(canCreateTask(owner)).toBe(true);
    expect(canCreateTask(admin)).toBe(true);
    expect(canCreateTask(operative)).toBe(false);

    expect(canViewOrganizationTasks(owner)).toBe(true);
    expect(canViewOrganizationTasks(admin)).toBe(true);
    expect(canViewOrganizationTasks(operative)).toBe(true);

    expect(canDeleteEmployeeAccount(owner, 'employee-1')).toBe(true);
    expect(canDeleteEmployeeAccount({ ...admin, employeeId: 'employee-1' }, 'employee-1')).toBe(
      true,
    );
    expect(canDeleteEmployeeAccount({ ...operative, employeeId: 'employee-1' }, 'employee-1')).toBe(
      true,
    );
    expect(canDeleteEmployeeAccount({ ...admin, employeeId: 'employee-1' }, 'employee-2')).toBe(
      false,
    );
    expect(canDeleteEmployeeAccount(admin, 'employee-1')).toBe(false);
    expect(canDeleteEmployeeAccount(null, 'employee-1')).toBe(false);
  });

  it('denies an employee from inviting and an operative from creating a task over HTTP', async () => {
    const { mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });

    const employeeInvite = await requestJson(
      app,
      'POST',
      '/employees/invites',
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'López',
        email: 'andrea@correo.com',
        position: 'Diseñadora',
        authorityLevel: 'operative',
      },
      { 'x-actor-kind': 'employee', 'x-actor-authority': 'administrative' },
    );
    expect(employeeInvite.status).toBe(403);

    const operativeTask = await requestJson(
      app,
      'POST',
      '/tasks',
      {
        organizationId: ORGANIZATION_ID,
        title: 'Tarea operaria',
        priority: 'medium',
      },
      { 'x-actor-kind': 'employee', 'x-actor-authority': 'operative' },
    );
    expect(operativeTask.status).toBe(403);

    const adminTask = await requestJson(
      app,
      'POST',
      '/tasks',
      {
        organizationId: ORGANIZATION_ID,
        title: 'Tarea administrativa',
        priority: 'medium',
      },
      { 'x-actor-kind': 'employee', 'x-actor-authority': 'administrative' },
    );
    expect(adminTask.status).toBe(200);
    expect(adminTask.body).toMatchObject({ status: 'created' });

    const ownerInvite = await requestJson(
      app,
      'POST',
      '/employees/invites',
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'López',
        email: 'andrea@correo.com',
        position: 'Diseñadora',
        authorityLevel: 'administrative',
      },
      { 'x-actor-kind': 'organization' },
    );
    expect(ownerInvite.status).toBe(200);
    expect(ownerInvite.body).toMatchObject({
      status: 'email_sent',
      employee: { authorityLevel: 'administrative' },
    });
  });

  it('only lets the owner change the authority level over HTTP', async () => {
    const { messages, mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });
    const created = await requestJson(
      app,
      'POST',
      '/employees/invites',
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Carla',
        lastName: 'Ruiz',
        email: 'carla@correo.com',
        position: 'Operaria',
        authorityLevel: 'operative',
      },
      { 'x-actor-kind': 'organization' },
    );
    const employeeId = (created.body.employee as { id: string }).id;
    const signIn = redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    expect(signIn.employee?.id).toBe(employeeId);

    const selfEscalation = await requestJson(
      app,
      'PATCH',
      `/employees/${employeeId}`,
      { organizationId: ORGANIZATION_ID, authorityLevel: 'administrative' },
      {
        'x-actor-kind': 'employee',
        'x-actor-authority': 'operative',
        'x-actor-employee-id': employeeId,
      },
    );
    expect(selfEscalation.status).toBe(403);

    const ownerChange = await requestJson(
      app,
      'PATCH',
      `/employees/${employeeId}`,
      { organizationId: ORGANIZATION_ID, authorityLevel: 'administrative' },
      { 'x-actor-kind': 'organization' },
    );
    expect(ownerChange.status).toBe(200);
    expect((ownerChange.body.employee as { authorityLevel: string }).authorityLevel).toBe(
      'administrative',
    );
  });

  it('lets an employee delete only their own account over HTTP', async () => {
    const { messages, mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });
    const created = await requestJson(
      app,
      'POST',
      '/employees/invites',
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Daniela',
        lastName: 'Soto',
        email: 'daniela@correo.com',
        position: 'Diseñadora',
      },
      { 'x-actor-kind': 'organization' },
    );
    const employeeId = (created.body.employee as { id: string }).id;
    const signIn = redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    expect(signIn.employee?.id).toBe(employeeId);

    const actorHeaders = {
      'x-actor-kind': 'employee',
      'x-actor-authority': 'operative',
      'x-actor-employee-id': employeeId,
    };
    const otherEmployeeId = '22222222-2222-4222-8222-222222222222';
    const otherDelete = await requestJson(
      app,
      'DELETE',
      `/employees/${otherEmployeeId}?organizationId=${ORGANIZATION_ID}`,
      {},
      actorHeaders,
    );
    expect(otherDelete.status).toBe(403);

    const selfDelete = await requestJson(
      app,
      'DELETE',
      `/employees/${employeeId}?organizationId=${ORGANIZATION_ID}`,
      {},
      actorHeaders,
    );
    expect(selfDelete.status).toBe(200);
    expect(selfDelete.body).toMatchObject({ status: 'deleted', employeeId });
  });
});
