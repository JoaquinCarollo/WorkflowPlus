import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import {
  clearDepartmentsForTest,
  createDepartment,
  deleteDepartment,
  listDepartments,
} from './departments.js';
import { clearEmployeeInvitationsForTest } from './auth/employee-invitation.js';
import type {
  EmployeeCodeEmailMailer,
  EmployeeCodeEmailMessage,
} from './auth/employee-invitation.js';
import { clearTasksForTest, listActivities } from './tasks/tasks.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

describe('departments', () => {
  beforeEach(() => {
    clearDepartmentsForTest();
    clearTasksForTest();
    clearEmployeeInvitationsForTest();
  });

  afterEach(() => {
    clearDepartmentsForTest();
    clearTasksForTest();
    clearEmployeeInvitationsForTest();
  });

  it('creates a department and lists it for the organization', () => {
    const result = createDepartment({ organizationId: ORGANIZATION_ID, name: 'Ventas' });
    expect(result.status).toBe('created');
    expect(result.department).toMatchObject({ organizationId: ORGANIZATION_ID, name: 'Ventas' });

    const list = listDepartments(ORGANIZATION_ID);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Ventas');
  });

  it('rejects duplicate department names case-insensitively within the same organization', () => {
    createDepartment({ organizationId: ORGANIZATION_ID, name: 'Ventas' });
    const duplicate = createDepartment({ organizationId: ORGANIZATION_ID, name: 'ventas' });
    expect(duplicate.status).toBe('denied');
    expect(duplicate.reason).toBe('duplicate');
  });

  it('allows the same department name in different organizations', () => {
    createDepartment({ organizationId: ORGANIZATION_ID, name: 'Ventas' });
    const other = createDepartment({ organizationId: OTHER_ORGANIZATION_ID, name: 'Ventas' });
    expect(other.status).toBe('created');
  });

  it('keeps departments tenant-scoped in listing', () => {
    createDepartment({ organizationId: ORGANIZATION_ID, name: 'Ventas' });
    createDepartment({ organizationId: OTHER_ORGANIZATION_ID, name: 'Marketing' });
    expect(listDepartments(ORGANIZATION_ID).map((dept) => dept.name)).toEqual(['Ventas']);
    expect(listDepartments(OTHER_ORGANIZATION_ID).map((dept) => dept.name)).toEqual(['Marketing']);
  });

  it('rejects invalid department names', () => {
    expect(createDepartment({ organizationId: ORGANIZATION_ID, name: '   ' }).status).toBe(
      'denied',
    );
    expect(createDepartment({ organizationId: ORGANIZATION_ID, name: '   ' }).reason).toBe(
      'invalid_input',
    );
  });

  it('deletes a department only within its organization', () => {
    const created = createDepartment({ organizationId: ORGANIZATION_ID, name: 'Ventas' });
    const id = created.department!.id;

    const denied = deleteDepartment(id, OTHER_ORGANIZATION_ID);
    expect(denied.status).toBe('denied');
    expect(denied.reason).toBe('not_found');

    const deleted = deleteDepartment(id, ORGANIZATION_ID);
    expect(deleted.status).toBe('deleted');
    expect(listDepartments(ORGANIZATION_ID)).toEqual([]);
  });

  it('records department creation and deletion in the recent activity feed (HTTP flow)', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const ownerHeaders = {
      'content-type': 'application/json',
      'x-actor-kind': 'organization',
    };
    try {
      const createdResponse = await fetch(`${baseUrl}/departments`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ organizationId: ORGANIZATION_ID, name: 'Ventas' }),
      });
      const created = (await createdResponse.json()) as {
        status: string;
        department: { id: string; name: string } | null;
      };
      expect(createdResponse.status).toBe(200);
      expect(created.status).toBe('created');

      const afterCreate = await fetch(
        `${baseUrl}/activities?organizationId=${encodeURIComponent(ORGANIZATION_ID)}&range=all`,
      );
      const afterCreateBody = (await afterCreate.json()) as {
        activities: Array<{ type: string; message: string }>;
      };
      expect(
        afterCreateBody.activities.some(
          (activity) =>
            activity.type === 'department_created' && activity.message.includes('Ventas'),
        ),
      ).toBe(true);

      const deleteResponse = await fetch(
        `${baseUrl}/departments/${encodeURIComponent(created.department!.id)}?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
        { method: 'DELETE', headers: { 'x-actor-kind': 'organization' } },
      );
      expect(deleteResponse.status).toBe(200);

      const afterDelete = await fetch(
        `${baseUrl}/activities?organizationId=${encodeURIComponent(ORGANIZATION_ID)}&range=all`,
      );
      const afterDeleteBody = (await afterDelete.json()) as {
        activities: Array<{ type: string; message: string }>;
      };
      expect(
        afterDeleteBody.activities.some(
          (activity) =>
            activity.type === 'department_deleted' && activity.message.includes('Ventas'),
        ),
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('unassigns employees and the department lead when the department is deleted (HTTP flow)', async () => {
    const messages: EmployeeCodeEmailMessage[] = [];
    const mailer: EmployeeCodeEmailMailer = {
      sendEmployeeCodeEmail: async (message: EmployeeCodeEmailMessage) => {
        messages.push(message);
        return { emailSent: true };
      },
    };
    const app = createApp(undefined, { mailer });
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const ownerHeaders = {
      'content-type': 'application/json',
      'x-actor-kind': 'organization',
    };
    const invite = async (
      firstName: string,
      lastName: string,
      email: string,
      authorityLevel: string,
    ) => {
      const response = await fetch(`${baseUrl}/employees/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          firstName,
          lastName,
          email,
          position: 'Puesto',
          department: 'Ventas',
          authorityLevel,
        }),
      });
      const body = (await response.json()) as {
        status: string;
        employee: { id: string } | null;
      };
      expect(response.status).toBe(200);
      return body.employee!.id;
    };
    try {
      const createdResponse = await fetch(`${baseUrl}/departments`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ organizationId: ORGANIZATION_ID, name: 'Ventas' }),
      });
      const created = (await createdResponse.json()) as {
        status: string;
        department: { id: string; name: string };
      };
      expect(created.status).toBe('created');
      const departmentId = created.department.id;

      const adminId = await invite('Alicia', 'Admin', 'alicia@correo.com', 'administrative');
      const operativeId = await invite('Oscar', 'Operativo', 'oscar@correo.com', 'operative');

      for (const employeeId of [adminId, operativeId]) {
        const message = messages.find((candidate) => candidate.employeeId === employeeId);
        expect(message).toBeDefined();
        const signIn = await fetch(`${baseUrl}/employees/sign-in`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accessCode: message!.accessCode,
            organizationId: ORGANIZATION_ID,
          }),
        });
        expect(signIn.status).toBe(200);
      }

      const assignResponse = await fetch(`${baseUrl}/department-leads`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          department: 'Ventas',
          employeeId: adminId,
        }),
      });
      expect(assignResponse.status).toBe(200);

      const before = await fetch(
        `${baseUrl}/employees?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
      );
      const beforeBody = (await before.json()) as {
        employees: Array<{ id: string; department: string }>;
      };
      expect(beforeBody.employees.find((employee) => employee.id === adminId)?.department).toBe(
        'Ventas',
      );
      expect(beforeBody.employees.find((employee) => employee.id === operativeId)?.department).toBe(
        'Ventas',
      );

      const deleteResponse = await fetch(
        `${baseUrl}/departments/${encodeURIComponent(departmentId)}?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
        { method: 'DELETE', headers: { 'x-actor-kind': 'organization' } },
      );
      expect(deleteResponse.status).toBe(200);

      const after = await fetch(
        `${baseUrl}/employees?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
      );
      const afterBody = (await after.json()) as {
        employees: Array<{ id: string; department: string }>;
      };
      expect(afterBody.employees.find((employee) => employee.id === adminId)?.department).toBe('');
      expect(afterBody.employees.find((employee) => employee.id === operativeId)?.department).toBe(
        '',
      );

      const leadsResponse = await fetch(
        `${baseUrl}/department-leads?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
      );
      const leadsBody = (await leadsResponse.json()) as { leads: unknown[] };
      expect(leadsBody.leads).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('records recent activity when a department lead is assigned and removed', async () => {
    const messages: EmployeeCodeEmailMessage[] = [];
    const mailer: EmployeeCodeEmailMailer = {
      sendEmployeeCodeEmail: async (message: EmployeeCodeEmailMessage) => {
        messages.push(message);
        return { emailSent: true };
      },
    };
    const app = createApp(undefined, { mailer });
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const ownerHeaders = {
      'content-type': 'application/json',
      'x-actor-kind': 'organization',
    };
    try {
      const inviteResponse = await fetch(`${baseUrl}/employees/invites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          firstName: 'Alicia',
          lastName: 'Admin',
          email: 'alicia@correo.com',
          position: 'Puesto',
          department: 'Ventas',
          authorityLevel: 'administrative',
        }),
      });
      const inviteBody = (await inviteResponse.json()) as { employee: { id: string } };
      const employeeId = inviteBody.employee.id;
      const signIn = await fetch(`${baseUrl}/employees/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessCode: messages[0].accessCode }),
      });
      expect(signIn.status).toBe(200);

      const assignResponse = await fetch(`${baseUrl}/department-leads`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          department: 'Ventas',
          employeeId,
        }),
      });
      expect(assignResponse.status).toBe(200);

      const assignedActivity = listActivities(ORGANIZATION_ID).find(
        (activity) => activity.type === 'department_lead_assigned',
      );
      expect(assignedActivity?.message).toContain('Alicia Admin');
      expect(assignedActivity?.message).toContain('jefe del departamento Ventas');

      const removeResponse = await fetch(
        `${baseUrl}/department-leads/Ventas?organizationId=${encodeURIComponent(ORGANIZATION_ID)}`,
        { method: 'DELETE', headers: { 'x-actor-kind': 'organization' } },
      );
      expect(removeResponse.status).toBe(200);

      const removedActivity = listActivities(ORGANIZATION_ID).find(
        (activity) => activity.type === 'department_lead_removed',
      );
      expect(removedActivity?.message).toContain('Alicia Admin');
      expect(removedActivity?.message).toContain('jefe del departamento Ventas');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
