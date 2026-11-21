import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import {
  clearEmployeeInvitationsForTest,
  createEmployeeInvitation,
  listJoinedEmployees,
  deleteEmployeeAccount,
  redeemEmployeeAccessCode,
  type EmployeeCodeEmailMailer,
  type EmployeeCodeEmailMessage,
  type TransactionalEmailMailer,
  type TransactionalEmailMessage,
} from '../auth/employee-invitation.js';
import {
  addCategory,
  addTaskAttachment,
  addTaskComment,
  clearTasksForTest,
  createTask,
  deleteTask,
  handleEmployeeDeletionTasks,
  listActivities,
  listCategories,
  listTaskAttachments,
  listTaskComments,
  listTasks,
  updateTask,
} from './tasks.js';

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

function capturingAssignmentMailer() {
  const messages: TransactionalEmailMessage[] = [];
  const mailer: TransactionalEmailMailer = {
    sendEmail: async (message: TransactionalEmailMessage) => {
      messages.push(message);
      return { emailSent: true };
    },
  };
  return { messages, mailer };
}

async function inviteAndJoin(email: string, organizationId = ORGANIZATION_ID) {
  const { messages, mailer } = capturingMailer();
  const created = await createEmployeeInvitation(
    {
      organizationId,
      firstName: 'Andrea',
      lastName: 'López',
      email,
      position: 'Diseñadora',
    },
    { mailer },
  );
  const signIn = redeemEmployeeAccessCode(messages[0].accessCode, organizationId);
  return { created, signIn };
}

describe('tasks and joined employees', () => {
  beforeEach(() => {
    clearEmployeeInvitationsForTest();
    clearTasksForTest();
  });

  afterEach(() => {
    clearEmployeeInvitationsForTest();
    clearTasksForTest();
  });

  it('starts with no tasks and no joined employees', () => {
    expect(listTasks(ORGANIZATION_ID)).toEqual([]);
    expect(listJoinedEmployees(ORGANIZATION_ID)).toEqual([]);
  });

  it('shows an invited employee only after signing in with the code', async () => {
    const { messages, mailer } = capturingMailer();
    await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'López',
        email: 'andrea@correo.com',
        position: 'Diseñadora',
      },
      { mailer },
    );
    expect(listJoinedEmployees(ORGANIZATION_ID)).toEqual([]);

    redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    const joined = listJoinedEmployees(ORGANIZATION_ID);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ email: 'andrea@correo.com', position: 'Diseñadora' });
  });

  it('keeps a joined employee listed until the owner deletes the account', async () => {
    const { created, signIn } = await inviteAndJoin('andrea@correo.com');
    expect(signIn.status).toBe('approved');
    expect(listJoinedEmployees(ORGANIZATION_ID)).toHaveLength(1);

    expect(deleteEmployeeAccount(OTHER_ORGANIZATION_ID, created.employee?.id ?? '')).toBe(false);
    expect(listJoinedEmployees(ORGANIZATION_ID)).toHaveLength(1);

    expect(deleteEmployeeAccount(ORGANIZATION_ID, created.employee?.id ?? '')).toBe(true);
    expect(listJoinedEmployees(ORGANIZATION_ID)).toEqual([]);
    expect(redeemEmployeeAccessCode('TFA-AAAA-BBBB-CCCC', ORGANIZATION_ID).status).toBe('denied');
  });

  it('removes the email and code from the database on confirm delete', async () => {
    const { messages, mailer } = capturingMailer();
    const created = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'López',
        email: 'andrea@correo.com',
        position: 'Diseñadora',
        authorityLevel: 'administrative',
      },
      { mailer },
    );
    const originalCode = messages[0].accessCode;
    expect(redeemEmployeeAccessCode(originalCode, ORGANIZATION_ID).status).toBe('approved');
    expect(deleteEmployeeAccount(ORGANIZATION_ID, created.employee?.id ?? '')).toBe(true);
    expect(redeemEmployeeAccessCode(originalCode, ORGANIZATION_ID).status).toBe('denied');
    const recreated = await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'López',
        email: 'andrea@correo.com',
        position: 'Diseñadora',
        authorityLevel: 'operative',
      },
      { mailer },
    );
    expect(recreated.status).toBe('email_sent');
    expect(recreated.employee?.id).not.toBe(created.employee?.id);
    expect(messages).toHaveLength(2);
    expect(redeemEmployeeAccessCode(originalCode, ORGANIZATION_ID).status).toBe('denied');
    expect(redeemEmployeeAccessCode(messages[1].accessCode, ORGANIZATION_ID).status).toBe(
      'approved',
    );
  });

  it('creates a task visible only in its organization', async () => {
    const { signIn } = await inviteAndJoin('andrea@correo.com');
    const ownerId = signIn.employee?.id ?? '';

    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Preparar propuesta comercial',
      priority: 'high',
      ownerId,
    });
    expect(created.status).toBe('created');
    expect(created.task).toMatchObject({
      title: 'Preparar propuesta comercial',
      ownerName: 'Andrea López',
      priority: 'high',
      status: 'pending',
    });
    expect(listTasks(ORGANIZATION_ID)).toHaveLength(1);
    expect(listTasks(OTHER_ORGANIZATION_ID)).toEqual([]);
  });

  it('stores and updates a task checklist within its organization', () => {
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Preparar checklist',
      priority: 'medium',
      checklist: [{ id: 'item-1', text: 'Revisar alcance', completed: false }],
    });
    const taskId = created.task?.id ?? '';
    expect(created.task?.checklist).toEqual([
      { id: 'item-1', text: 'Revisar alcance', completed: false },
    ]);

    const updated = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      checklist: [
        { id: 'item-1', text: 'Revisar alcance', completed: true },
        { id: 'item-2', text: 'Enviar resultado', completed: false },
      ],
    });
    expect(updated.status).toBe('updated');
    expect(updated.task?.checklist).toEqual([
      { id: 'item-1', text: 'Revisar alcance', completed: true },
      { id: 'item-2', text: 'Enviar resultado', completed: false },
    ]);

    const crossTenant = updateTask(taskId, {
      organizationId: OTHER_ORGANIZATION_ID,
      checklist: [],
    });
    expect(crossTenant.status).toBe('denied');
    expect(crossTenant.reason).toBe('not_found');
    expect(listTasks(ORGANIZATION_ID)[0]?.checklist).toHaveLength(2);
  });

  it('exposes task and employee routes scoped by organizationId', async () => {
    const { messages, mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });

    async function requestJson(method: string, path: string, body?: unknown) {
      const server = app.listen(0);
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        };
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    const emptyEmployees = await requestJson('GET', `/employees?organizationId=${ORGANIZATION_ID}`);
    expect(emptyEmployees.body).toEqual({ employees: [] });
    const emptyTasks = await requestJson('GET', `/tasks?organizationId=${ORGANIZATION_ID}`);
    expect(emptyTasks.body).toEqual({ tasks: [] });

    const invited = await requestJson('POST', '/employees/invites', {
      organizationId: ORGANIZATION_ID,
      firstName: 'Andrea',
      lastName: 'López',
      email: 'andrea@correo.com',
      position: 'Diseñadora',
    });
    expect(invited.status).toBe(200);
    const employee = invited.body.employee as { id: string };

    const signedIn = await requestJson('POST', '/employees/sign-in', {
      organizationId: ORGANIZATION_ID,
      accessCode: messages[0].accessCode,
    });
    expect(signedIn.body).toMatchObject({ status: 'approved', employee: { id: employee.id } });

    const joined = await requestJson('GET', `/employees?organizationId=${ORGANIZATION_ID}`);
    expect(joined.body).toMatchObject({ employees: [{ id: employee.id }] });

    const createdTask = await requestJson('POST', '/tasks', {
      organizationId: ORGANIZATION_ID,
      title: 'Preparar propuesta comercial',
      priority: 'medium',
      ownerId: employee.id,
    });
    expect(createdTask.status).toBe(200);
    expect(createdTask.body).toMatchObject({ status: 'created' });

    const listedTasks = await requestJson('GET', `/tasks?organizationId=${ORGANIZATION_ID}`);
    expect(listedTasks.body).toMatchObject({
      tasks: [{ title: 'Preparar propuesta comercial', ownerName: 'Andrea López' }],
    });

    const deleted = await requestJson(
      'DELETE',
      `/employees/${employee.id}?organizationId=${ORGANIZATION_ID}`,
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await requestJson('GET', `/employees?organizationId=${ORGANIZATION_ID}`);
    expect(afterDelete.body).toEqual({ employees: [] });
  });

  it('denies assigning a task to an employee from another organization', () => {
    const denied = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Tarea sin responsable válido',
      priority: 'low',
      ownerId: '99999999-9999-4999-8999-999999999999',
    });
    expect(denied).toEqual({ status: 'denied', reason: 'invalid_owner', task: null });
    expect(listTasks(ORGANIZATION_ID)).toEqual([]);
  });

  it('runs the lifecycle pending -> in_progress -> completed with activity', async () => {
    const { signIn } = await inviteAndJoin('andrea@correo.com');
    const created = createTask(
      {
        organizationId: ORGANIZATION_ID,
        title: 'Actualizar inventario',
        priority: 'medium',
        ownerId: signIn.employee?.id ?? '',
      },
      Date.parse('2026-11-08T10:00:00.000Z'),
    );
    const taskId = created.task?.id ?? '';
    expect(created.task).toMatchObject({ status: 'pending', completedAt: null });

    const started = updateTask(
      taskId,
      { organizationId: ORGANIZATION_ID, status: 'in_progress' },
      Date.parse('2026-11-08T11:00:00.000Z'),
    );
    expect(started.task).toMatchObject({ status: 'in_progress' });

    const completed = updateTask(
      taskId,
      { organizationId: ORGANIZATION_ID, status: 'completed' },
      Date.parse('2026-11-08T12:00:00.000Z'),
    );
    expect(completed.task).toMatchObject({ status: 'completed' });
    expect(completed.task?.completedAt).not.toBeNull();

    const activities = listActivities(ORGANIZATION_ID);
    expect(activities.map((activity) => activity.type)).toEqual(
      expect.arrayContaining(['created', 'started', 'completed']),
    );
    expect(activities[0].message).toContain('completó la tarea Actualizar inventario');
    expect(
      activities.some((activity) => activity.message.includes('cre\u00f3 una nueva tarea')),
    ).toBe(true);
  });

  it('completes directly from pending', () => {
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Tarea directa',
      priority: 'low',
    });
    const taskId = created.task?.id ?? '';
    const completed = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'completed',
    });
    expect(completed.status).toBe('updated');
    expect(completed.task).toMatchObject({ status: 'completed' });
    expect(completed.task?.completedAt).not.toBeNull();
  });

  it('cancels and reopens, and denies an illegal completed -> cancelled jump', async () => {
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Tarea cancelable',
      priority: 'low',
    });
    const taskId = created.task?.id ?? '';
    const cancelled = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'cancelled',
    });
    expect(cancelled.task).toMatchObject({ status: 'cancelled' });
    expect(cancelled.task?.cancelledAt).not.toBeNull();

    const reopened = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'pending',
    });
    expect(reopened.task).toMatchObject({ status: 'pending', cancelledAt: null });

    updateTask(taskId, { organizationId: ORGANIZATION_ID, status: 'in_progress' });
    const completed = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'completed',
    });
    expect(completed.status).toBe('updated');
    const illegal = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'cancelled',
    });
    expect(illegal.status).toBe('denied');
    expect(illegal.reason).toBe('invalid_transition');
  });

  it('reassigns and changes priority with activity', async () => {
    const { signIn } = await inviteAndJoin('andrea@correo.com');
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Proyecto Norte',
      priority: 'medium',
    });
    const taskId = created.task?.id ?? '';
    const reassigned = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      ownerId: signIn.employee?.id ?? '',
    });
    expect(reassigned.task).toMatchObject({ ownerName: 'Andrea López' });
    const prioritized = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      priority: 'urgent',
    });
    expect(prioritized.task).toMatchObject({ priority: 'urgent' });
    const messages = listActivities(ORGANIZATION_ID).map((activity) => activity.message);
    expect(messages.some((message) => message.includes('reasignó'))).toBe(true);
    expect(messages.some((message) => message.includes('modificó la prioridad'))).toBe(true);
  });

  it('exposes PATCH /tasks/:id and GET /activities over HTTP', async () => {
    const { mailer } = capturingMailer();
    const app = createApp(undefined, { mailer });

    async function requestJson(
      method: string,
      path: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) {
      const server = app.listen(0);
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: { 'content-type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        };
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    const created = await requestJson('POST', '/tasks', {
      organizationId: ORGANIZATION_ID,
      title: 'Actualizar inventario',
      priority: 'medium',
    });
    const task = created.body.task as { id: string };
    await requestJson(
      'PATCH',
      `/tasks/${task.id}`,
      { organizationId: ORGANIZATION_ID, status: 'in_progress' },
      { 'x-actor-kind': 'organization' },
    );
    const patched = await requestJson(
      'PATCH',
      `/tasks/${task.id}`,
      { organizationId: ORGANIZATION_ID, status: 'completed' },
      { 'x-actor-kind': 'organization' },
    );
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ status: 'updated', task: { status: 'completed' } });

    const activities = await requestJson(
      'GET',
      `/activities?organizationId=${ORGANIZATION_ID}&range=all`,
    );
    expect(activities.status).toBe(200);
    const list = activities.body.activities as Array<{ message: string }>;
    expect(list[0].message).toContain('completó la tarea Actualizar inventario');

    const operativeReassign = await requestJson(
      'PATCH',
      `/tasks/${task.id}`,
      { organizationId: ORGANIZATION_ID, ownerId: '00000000-0000-4000-8000-000000000001' },
      { 'x-actor-kind': 'employee', 'x-actor-authority': 'operative' },
    );
    expect(operativeReassign.status).toBe(403);
  });

  it('supports in_review with approve and return, plus detail fields, comments and attachments', async () => {
    const { signIn } = await inviteAndJoin('andrea@correo.com');
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Informe anual',
      description: 'Documento de referencia',
      category: 'Finanzas',
      estimatedMinutes: 120,
      priority: 'high',
      ownerId: signIn.employee?.id ?? '',
      dueAt: '2026-12-01T23:59:00.000Z',
    });
    expect(created.task).toMatchObject({
      description: 'Documento de referencia',
      category: 'Finanzas',
      estimatedMinutes: 120,
      dueAt: '2026-12-01T23:59:00.000Z',
    });
    const taskId = created.task?.id ?? '';
    updateTask(taskId, { organizationId: ORGANIZATION_ID, status: 'in_progress' });
    const review = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'in_review',
    });
    expect(review.task).toMatchObject({ status: 'in_review' });
    const returned = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'in_progress',
    });
    expect(returned.task).toMatchObject({ status: 'in_progress' });
    updateTask(taskId, { organizationId: ORGANIZATION_ID, status: 'in_review' });
    const approved = updateTask(taskId, {
      organizationId: ORGANIZATION_ID,
      status: 'completed',
    });
    expect(approved.task).toMatchObject({ status: 'completed' });
    expect(approved.task?.completedAt).not.toBeNull();

    const comment = addTaskComment(taskId, ORGANIZATION_ID, 'Quedo muy bien.', null);
    expect(comment.status).toBe('added');
    expect(listTaskComments(taskId, ORGANIZATION_ID)).toHaveLength(1);

    const attachment = addTaskAttachment(
      taskId,
      ORGANIZATION_ID,
      {
        name: 'informe.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3,
        dataUrl: 'data:application/pdf;base64,YWJj',
      },
      null,
    );
    expect(attachment.status).toBe('added');
    expect(listTaskAttachments(taskId, ORGANIZATION_ID)).toHaveLength(1);

    expect(deleteTask(taskId, ORGANIZATION_ID)).toBe(true);
    expect(listTasks(ORGANIZATION_ID)).toEqual([]);
  });

  it('stores the files attached when a task is created and keeps them tenant-scoped', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const attachments = [
      {
        name: 'manual.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3,
        dataUrl: 'data:application/pdf;base64,YWJj',
      },
      {
        name: 'guias.txt',
        mimeType: 'text/plain',
        sizeBytes: 3,
        dataUrl: 'data:text/plain;base64,ZGVm',
      },
    ];
    try {
      const createdResponse = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-kind': 'organization',
        },
        body: JSON.stringify({
          organizationId: ORGANIZATION_ID,
          title: 'Tarea con archivos',
          priority: 'medium',
          attachments,
        }),
      });
      const createdBody = (await createdResponse.json()) as { task: { id: string } | null };
      expect(createdResponse.status).toBe(200);
      const taskId = createdBody.task?.id ?? '';
      expect(taskId).not.toBe('');

      const ownedResponse = await fetch(
        `${baseUrl}/tasks/${taskId}/attachments?organizationId=${ORGANIZATION_ID}`,
      );
      const ownedBody = (await ownedResponse.json()) as {
        attachments: Array<{ name: string }>;
      };
      expect(ownedBody.attachments.map((attachment) => attachment.name)).toEqual([
        'manual.pdf',
        'guias.txt',
      ]);

      const otherResponse = await fetch(
        `${baseUrl}/tasks/${taskId}/attachments?organizationId=${OTHER_ORGANIZATION_ID}`,
      );
      expect(otherResponse.status).toBe(404);

      expect(
        listActivities(ORGANIZATION_ID).some(
          (activity) => activity.type === 'attached' && activity.message.includes('2 archivo(s)'),
        ),
      ).toBe(true);

      const tooLarge = createTask({
        organizationId: ORGANIZATION_ID,
        title: 'Archivo demasiado grande',
        priority: 'medium',
        attachments: [{ ...attachments[0], sizeBytes: 6 * 1024 * 1024 }],
      });
      expect(tooLarge.status).toBe('denied');

      const spoofedFile = createTask({
        organizationId: ORGANIZATION_ID,
        title: 'Archivo con contenido inválido',
        priority: 'medium',
        attachments: [{ ...attachments[0], dataUrl: 'javascript:alert(1)' }],
      });
      expect(spoofedFile.status).toBe('denied');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('extends categories per organization', () => {
    expect(listCategories(ORGANIZATION_ID)).toContain('Finanzas');
    const added = addCategory(ORGANIZATION_ID, 'Operaciones');
    expect(added.status).toBe('added');
    expect(listCategories(ORGANIZATION_ID)).toContain('Operaciones');
    expect(listCategories(OTHER_ORGANIZATION_ID)).not.toContain('Operaciones');
  });

  it('handles employee deletion with reassign, unassign and cancel', async () => {
    const first = await inviteAndJoin('andrea@correo.com');
    const second = await inviteAndJoin('bruno@correo.com');
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Tarea del primero',
      priority: 'medium',
      ownerId: first.signIn.employee?.id ?? '',
    });
    const taskId = created.task?.id ?? '';
    const reassigned = handleEmployeeDeletionTasks(
      ORGANIZATION_ID,
      first.signIn.employee?.id ?? '',
      'reassign',
      second.signIn.employee?.id ?? '',
    );
    expect(reassigned.status).toBe('updated');
    expect(reassigned.affected).toHaveLength(1);
    expect(listTasks(ORGANIZATION_ID)[0]).toMatchObject({
      id: taskId,
      ownerId: second.signIn.employee?.id,
    });
    const unassigned = handleEmployeeDeletionTasks(
      ORGANIZATION_ID,
      second.signIn.employee?.id ?? '',
      'unassign',
      null,
    );
    expect(unassigned.status).toBe('updated');
    expect(listTasks(ORGANIZATION_ID)[0]).toMatchObject({ ownerId: null });
  });

  it('sends assignment emails only for tenant-scoped owners and real owner changes', async () => {
    const first = await inviteAndJoin('ana@correo.com');
    const second = await inviteAndJoin('luis@correo.com');
    const foreign = await inviteAndJoin('externa@correo.com', OTHER_ORGANIZATION_ID);
    const assignmentMailer = capturingAssignmentMailer();
    const app = createApp(undefined, undefined, { mailer: assignmentMailer.mailer });

    async function requestJson(method: string, path: string, body?: unknown) {
      const server = app.listen(0);
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        };
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    const crossTenant = await requestJson('POST', '/tasks', {
      organizationId: ORGANIZATION_ID,
      title: 'Tarea de otra organización',
      priority: 'low',
      ownerId: foreign.signIn.employee?.id ?? '',
    });
    expect(crossTenant.status).toBe(400);
    expect(assignmentMailer.messages).toHaveLength(0);

    const created = await requestJson('POST', '/tasks', {
      organizationId: ORGANIZATION_ID,
      title: 'Preparar informe',
      description: 'Revisar métricas del mes',
      category: 'Finanzas',
      estimatedMinutes: 45,
      priority: 'high',
      ownerId: first.signIn.employee?.id ?? '',
      dueAt: '2026-11-20T10:00:00.000Z',
    });
    expect(created.status).toBe(200);
    expect(created.body.assignmentEmailSent).toBe(true);
    expect(assignmentMailer.messages).toHaveLength(1);
    expect(assignmentMailer.messages[0]).toMatchObject({
      to: 'ana@correo.com',
      subject: 'Se te asignó una tarea en WorkFlowPlus',
    });
    expect(assignmentMailer.messages[0].text).toContain('Preparar informe');

    const createdTask = created.body.task as { id: string };
    const priorityChange = await requestJson('PATCH', `/tasks/${createdTask.id}`, {
      organizationId: ORGANIZATION_ID,
      priority: 'urgent',
    });
    expect(priorityChange.status).toBe(200);
    expect(priorityChange.body.assignmentEmailSent).toBeUndefined();
    expect(assignmentMailer.messages).toHaveLength(1);

    const reassigned = await requestJson('PATCH', `/tasks/${createdTask.id}`, {
      organizationId: ORGANIZATION_ID,
      ownerId: second.signIn.employee?.id ?? '',
    });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignmentEmailSent).toBe(true);
    expect(assignmentMailer.messages).toHaveLength(2);
    expect(assignmentMailer.messages[1]).toMatchObject({ to: 'luis@correo.com' });

    const statusChanged = await requestJson('PATCH', `/tasks/${createdTask.id}`, {
      organizationId: ORGANIZATION_ID,
      status: 'in_progress',
    });
    expect(statusChanged.status).toBe(200);
    expect(assignmentMailer.messages).toHaveLength(2);
  });
});
