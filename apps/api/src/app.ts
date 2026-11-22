import cors from 'cors';
import express, { type Request } from 'express';
import { z } from 'zod';
import {
  assignDepartmentLead,
  canCreateTask,
  canDeleteEmployeeAccount,
  canInviteEmployees,
  cancelEmployeeInvitation,
  createEmployeeInvitation,
  deleteEmployeeAccount,
  devEmailOutbox,
  employeeCodeEmailOutbox,
  getDepartmentLead,
  getEmployeeProfile,
  listDepartmentLeads,
  listInvitations,
  listJoinedEmployees,
  redeemEmployeeAccessCode,
  removeDepartmentLead,
  resendEmployeeInvitation,
  unassignEmployeesFromDepartment,
  updateEmployeeProfile,
  type EmployeeInvitationDeps,
  type SessionActor,
} from './domain/auth/employee-invitation.js';
import {
  createDepartment,
  deleteDepartment,
  getDepartmentById,
  listDepartments,
} from './domain/departments.js';
import {
  addCategory,
  addTaskAttachment,
  addTaskComment,
  createTask,
  deleteTask,
  findTaskBottlenecks,
  getTaskById,
  handleEmployeeDeletionTasks,
  listActivities,
  listCategories,
  listTaskAttachments,
  listTaskComments,
  listTasks,
  materializeRecurringTasks,
  recordDepartmentActivity,
  recordEmployeeActivity,
  resolveActorName,
  removeTaskAttachment,
  updateTask,
} from './domain/tasks/tasks.js';
import {
  notifyTaskAssignments,
  type TaskAssignmentNotificationDeps,
} from './domain/tasks/task-assignment-notification.js';
import {
  applyTaskTemplate,
  createTaskTemplate,
  listTaskTemplates,
} from './domain/tasks/templates.js';
import {
  registerOrganization,
  registerRecoveryTokenForTest,
  requestPasswordRecovery,
  resetPasswordWithToken,
  signInOrganization,
  type SupabaseAuthClient,
} from './domain/auth/organization-access.js';
import {
  canUseAssistant,
  runAssistantQuery,
  type AssistantAnswer,
} from './domain/agents/assistant.js';

const registrationSchema = z.object({
  companyName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  organizationType: z.string().min(1),
  description: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const recoverySchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

const employeeInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  position: z.string().min(1),
  department: z.string().optional(),
  authorityLevel: z.enum(['administrative', 'operative']).default('operative'),
  skills: z.array(z.string().min(1)).optional(),
  weeklyCapacityHours: z.number().min(0).optional(),
  availabilityStatus: z
    .enum(['available', 'vacation', 'leave', 'absent', 'temporarily_unavailable'])
    .optional(),
});

const updateEmployeeProfileSchema = z.object({
  organizationId: z.string().uuid(),
  position: z.string().min(1).optional(),
  department: z.string().optional(),
  authorityLevel: z.enum(['administrative', 'operative']).optional(),
  skills: z.array(z.string().min(1)).optional(),
  weeklyCapacityHours: z.number().min(0).optional(),
  availabilityStatus: z
    .enum(['available', 'vacation', 'leave', 'absent', 'temporarily_unavailable'])
    .optional(),
  onboardingCompleted: z.boolean().optional(),
});

// The web client sends the session kind with every privileged request. Until the
// verified JWT middleware lands, the actor travels in trusted headers; a missing
// actor keeps the legacy behavior of the pre-session demo routes (and tests).
function parseSessionActor(request: Request): SessionActor | null | undefined {
  const kind = request.header('x-actor-kind');
  if (!kind) {
    return undefined;
  }
  const employeeId = request.header('x-actor-employee-id') || undefined;
  if (kind === 'organization') {
    return { kind: 'organization', employeeId };
  }
  if (kind === 'employee') {
    return {
      kind: 'employee',
      authorityLevel:
        request.header('x-actor-authority') === 'administrative' ? 'administrative' : 'operative',
      employeeId,
    };
  }
  return null;
}

function actorDenied(actor: SessionActor | null | undefined, allowed: boolean): boolean {
  if (actor === undefined) {
    return false;
  }
  if (actor === null) {
    return true;
  }
  return !allowed;
}

function logAssignmentEmailFailure(sent: boolean | null): void {
  if (sent === false) {
    console.error('No se pudo enviar el correo de asignación de tarea.');
  }
}

const employeeSignInSchema = z.object({
  accessCode: z.string().min(1),
});

const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'fortnight', 'monthly']),
});

const checklistItemSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().min(1).max(500),
  completed: z.boolean(),
});

const checklistSchema = z.array(checklistItemSchema).max(100).optional();

const taskAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(5 * 1024 * 1024),
  dataUrl: z
    .string()
    .min(1)
    .max(7 * 1024 * 1024),
});

const taskAttachmentsSchema = z.array(taskAttachmentSchema).max(5).optional();

const createTaskSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  estimatedMinutes: z.number().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  ownerId: z.string().uuid().optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  approverId: z.string().uuid().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  checklist: checklistSchema,
  attachments: taskAttachmentsSchema,
});

const updateTaskSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  estimatedMinutes: z.number().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'in_review', 'completed', 'cancelled']).optional(),
  ownerId: z
    .union([z.string().uuid(), z.literal('')])
    .nullable()
    .optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
  dueAt: z.string().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  approverId: z
    .union([z.string().uuid(), z.literal('')])
    .nullable()
    .optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  checklist: checklistSchema,
});

const activitiesQuerySchema = z.object({
  organizationId: z.string().uuid(),
  range: z.enum(['7d', '30d', '90d', 'all']).default('all'),
});

const organizationQuerySchema = z.object({
  organizationId: z.string().uuid(),
});

const assignDepartmentLeadSchema = z.object({
  organizationId: z.string().uuid(),
  department: z.string().min(1).max(120),
  employeeId: z.string().uuid(),
});

const assistantQuerySchema = z.object({
  organizationId: z.string().uuid(),
  query: z.string().min(1),
});

function allowedWebOrigin(): string {
  const configured = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  try {
    return new URL(configured).origin;
  } catch {
    throw new Error('WEB_ORIGIN must be an absolute URL');
  }
}

export function createApp(
  authClient?: SupabaseAuthClient,
  employeeInvitationDeps: EmployeeInvitationDeps = {},
  taskAssignmentDeps: TaskAssignmentNotificationDeps = {},
) {
  const app = express();
  app.use(cors({ origin: allowedWebOrigin() }));
  app.use(express.json({ limit: '16mb' }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  app.post('/auth/organizations/register', async (request, response) => {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'incomplete', missingFields: [] });
      return;
    }
    const result = await registerOrganization(parsed.data, ...(authClient ? [authClient] : []));
    response.status(result.status === 'denied' ? 409 : 200).json(result);
  });

  app.post('/auth/organizations/sign-in', async (request, response) => {
    const parsed = signInSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', decision: null });
      return;
    }
    const result = await signInOrganization(parsed.data, ...(authClient ? [authClient] : []));
    response.status(result.status === 'denied' ? 401 : 200).json(result);
  });

  app.post('/auth/organizations/password-recovery', async (request, response) => {
    const parsed = recoverySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(200).json({ status: 'denied', emailSent: false });
      return;
    }
    const result = await requestPasswordRecovery(parsed.data, ...(authClient ? [authClient] : []));
    response.status(200).json({
      status: result.status,
      emailSent: result.emailSent,
    });
  });

  app.post('/employees/invites', async (request, response) => {
    const parsed = employeeInvitationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'incomplete',
        decision: null,
        missingFields: [],
        employee: null,
        emailSent: false,
        emailAlreadyExists: false,
      });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canInviteEmployees(actor ?? null))) {
      response.status(403).json({
        status: 'denied',
        decision: null,
        missingFields: [],
        employee: null,
        emailSent: false,
        emailAlreadyExists: false,
      });
      return;
    }
    const resolvedActor = actor === undefined ? null : actor;
    const result = await createEmployeeInvitation(parsed.data, employeeInvitationDeps);
    if (result.status === 'email_sent' && result.employee && result.employee.organizationId) {
      const employeeName = `${result.employee.firstName} ${result.employee.lastName}`;
      recordEmployeeActivity(
        result.employee.organizationId,
        result.employee.id,
        employeeName,
        resolvedActor,
        'employee_invited',
        `${resolveActorName(resolvedActor)} invitó a ${employeeName}.`,
      );
    }
    const statusCode =
      result.status === 'incomplete' ? 400 : result.status === 'denied' ? 409 : 200;
    response.status(statusCode).json(result);
  });

  app.get('/employees', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ employees: [] });
      return;
    }
    response.json({ employees: listJoinedEmployees(parsed.data.organizationId) });
  });

  app.get('/employees/invites', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ invitations: [] });
      return;
    }
    response.json({ invitations: listInvitations(parsed.data.organizationId) });
  });

  app.post('/employees/invites/:invitationId/resend', async (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ invitationId: z.string().uuid() }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied', emailSent: false, employee: null });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canInviteEmployees(actor ?? null))) {
      response.status(403).json({ status: 'denied', emailSent: false, employee: null });
      return;
    }
    const result = await resendEmployeeInvitation(
      query.data.organizationId,
      params.data.invitationId,
      employeeInvitationDeps,
    );
    response.status(result.status === 'email_sent' ? 200 : 404).json(result);
  });

  app.delete('/employees/invites/:invitationId', (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ invitationId: z.string().uuid() }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canInviteEmployees(actor ?? null))) {
      response.status(403).json({ status: 'denied' });
      return;
    }
    const cancelled = cancelEmployeeInvitation(query.data.organizationId, params.data.invitationId);
    response.status(cancelled ? 200 : 404).json({
      status: cancelled ? 'cancelled' : 'denied',
      invitationId: params.data.invitationId,
    });
  });

  app.patch('/employees/:employeeId', (request, response) => {
    const params = z.object({ employeeId: z.string().uuid() }).safeParse(request.params);
    const parsed = updateEmployeeProfileSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ status: 'denied', employee: null });
      return;
    }
    const actor = parseSessionActor(request);
    const isOwner = canInviteEmployees(actor ?? null);
    const isOwnProfile = actor?.kind === 'employee' && actor.employeeId === params.data.employeeId;
    if (actor !== undefined && !isOwner && !isOwnProfile) {
      response.status(403).json({ status: 'denied', employee: null });
      return;
    }
    // Only the organization owner can change the authority level; an employee
    // editing their own profile must not be able to escalate their role.
    if (!isOwner && parsed.data.authorityLevel !== undefined) {
      response.status(403).json({ status: 'denied', employee: null });
      return;
    }
    const result = updateEmployeeProfile(parsed.data.organizationId, params.data.employeeId, {
      position: parsed.data.position,
      department: parsed.data.department,
      authorityLevel: parsed.data.authorityLevel,
      skills: parsed.data.skills,
      weeklyCapacityHours: parsed.data.weeklyCapacityHours,
      availabilityStatus: parsed.data.availabilityStatus,
      onboardingCompleted: parsed.data.onboardingCompleted,
    });
    response.status(result.status === 'updated' ? 200 : 404).json(result);
  });

  app.get('/employees/:employeeId', (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ employeeId: z.string().uuid() }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied', employee: null });
      return;
    }
    const employee = getEmployeeProfile(query.data.organizationId, params.data.employeeId);
    response.status(employee ? 200 : 404).json({ employee });
  });

  app.delete('/employees/:employeeId', (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ employeeId: z.string().uuid() }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canDeleteEmployeeAccount(actor ?? null, params.data.employeeId))) {
      response.status(403).json({ status: 'denied' });
      return;
    }
    const modeRaw = request.query.mode;
    const toRaw = request.query.toEmployeeId;
    const mode =
      modeRaw === 'reassign' || modeRaw === 'unassign' || modeRaw === 'cancel' ? modeRaw : null;
    const toEmployeeId = typeof toRaw === 'string' && toRaw.trim() ? toRaw.trim() : null;
    const handling = handleEmployeeDeletionTasks(
      query.data.organizationId,
      params.data.employeeId,
      mode ?? 'unassign',
      toEmployeeId,
      Date.now(),
      actor === undefined ? null : actor,
    );
    if (handling.status === 'denied') {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const deletedEmployee = getEmployeeProfile(query.data.organizationId, params.data.employeeId);
    const deleted = deleteEmployeeAccount(query.data.organizationId, params.data.employeeId);
    if (!deleted) {
      response.status(404).json({ status: 'denied' });
      return;
    }
    if (deletedEmployee) {
      const resolvedActor = actor === undefined ? null : actor;
      const employeeName = `${deletedEmployee.firstName} ${deletedEmployee.lastName}`;
      recordEmployeeActivity(
        query.data.organizationId,
        deletedEmployee.id,
        employeeName,
        resolvedActor,
        'employee_deleted',
        `${resolveActorName(resolvedActor)} eliminó al empleado ${employeeName}.`,
      );
    }
    response.json({
      status: 'deleted',
      employeeId: params.data.employeeId,
      affectedTaskIds: handling.affected.map((task) => task.id),
    });
  });

  app.post('/department-leads', (request, response) => {
    const parsed = assignDepartmentLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', reason: 'invalid_input', lead: null });
      return;
    }
    const actor = parseSessionActor(request);
    const resolvedActor = actor === undefined ? null : actor;
    const result = assignDepartmentLead(
      parsed.data.organizationId,
      parsed.data.department,
      parsed.data.employeeId,
      resolvedActor,
    );
    if (result.status === 'assigned' && result.lead) {
      const employee = getEmployeeProfile(parsed.data.organizationId, parsed.data.employeeId);
      const employeeName = employee
        ? `${employee.firstName} ${employee.lastName}`
        : parsed.data.employeeId;
      recordEmployeeActivity(
        parsed.data.organizationId,
        parsed.data.employeeId,
        employeeName,
        resolvedActor,
        'department_lead_assigned',
        `${resolveActorName(resolvedActor)} asignó a ${employeeName} como jefe del departamento ${result.lead.department}.`,
      );
    }
    response.status(result.status === 'assigned' ? 200 : 400).json(result);
  });

  app.get('/department-leads', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ leads: [] });
      return;
    }
    const leads = listDepartmentLeads(parsed.data.organizationId);
    response.json({ leads });
  });

  app.delete('/department-leads/:department', (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ department: z.string().min(1) }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const actor = parseSessionActor(request);
    const resolvedActor = actor === undefined ? null : actor;
    const previousLead = getDepartmentLead(query.data.organizationId, params.data.department);
    const result = removeDepartmentLead(
      query.data.organizationId,
      params.data.department,
      resolvedActor,
    );
    if (result.status === 'removed' && previousLead) {
      const employee = getEmployeeProfile(query.data.organizationId, previousLead.employeeId);
      const employeeName = employee
        ? `${employee.firstName} ${employee.lastName}`
        : previousLead.employeeId;
      recordEmployeeActivity(
        query.data.organizationId,
        previousLead.employeeId,
        employeeName,
        resolvedActor,
        'department_lead_removed',
        `${resolveActorName(resolvedActor)} quitó a ${employeeName} como jefe del departamento ${previousLead.department}.`,
      );
    }
    response.status(result.status === 'removed' ? 200 : 400).json(result);
  });

  const createDepartmentSchema = z.object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(120),
  });

  app.post('/departments', (request, response) => {
    const parsed = createDepartmentSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', reason: 'invalid_input', department: null });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canInviteEmployees(actor ?? null))) {
      response.status(403).json({ status: 'denied', reason: 'invalid_input', department: null });
      return;
    }
    const resolvedActor = actor === undefined ? null : actor;
    const result = createDepartment(parsed.data);
    if (result.status === 'created' && result.department) {
      const actorName = resolveActorName(resolvedActor);
      recordDepartmentActivity(
        parsed.data.organizationId,
        result.department.id,
        result.department.name,
        resolvedActor,
        'department_created',
        `${actorName} creó el departamento: ${result.department.name}.`,
      );
    }
    response.status(result.status === 'created' ? 200 : 400).json(result);
  });

  app.get('/departments', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ departments: [] });
      return;
    }
    const departments = listDepartments(parsed.data.organizationId);
    response.json({ departments });
  });

  app.delete('/departments/:departmentId', (request, response) => {
    const query = organizationQuerySchema.safeParse(request.query);
    const params = z.object({ departmentId: z.string().uuid() }).safeParse(request.params);
    if (!query.success || !params.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canInviteEmployees(actor ?? null))) {
      response.status(403).json({ status: 'denied' });
      return;
    }
    const resolvedActor = actor === undefined ? null : actor;
    const department = getDepartmentById(params.data.departmentId);
    const result = deleteDepartment(params.data.departmentId, query.data.organizationId);
    if (result.status === 'deleted' && department) {
      const actorName = resolveActorName(resolvedActor);
      unassignEmployeesFromDepartment(query.data.organizationId, department.name);
      recordDepartmentActivity(
        query.data.organizationId,
        department.id,
        department.name,
        resolvedActor,
        'department_deleted',
        `${actorName} eliminó el departamento: ${department.name}.`,
      );
    }
    response.status(result.status === 'deleted' ? 200 : 404).json(result);
  });

  app.get('/tasks', async (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ tasks: [] });
      return;
    }
    const materialized = materializeRecurringTasks(parsed.data.organizationId, Date.now(), null);
    const assignmentEmailSent = await notifyTaskAssignments(
      materialized.generated,
      taskAssignmentDeps,
    );
    logAssignmentEmailFailure(assignmentEmailSent);
    const tasks = listTasks(parsed.data.organizationId);
    if (assignmentEmailSent === null) {
      response.json({ tasks });
      return;
    }
    response.json({ tasks, assignmentEmailSent });
  });

  app.post('/tasks/generate-recurring', async (request, response) => {
    const parsed = z.object({ organizationId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', generatedCount: 0 });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ status: 'denied', generatedCount: 0 });
      return;
    }
    const result = materializeRecurringTasks(parsed.data.organizationId, Date.now(), actor);
    const assignmentEmailSent = await notifyTaskAssignments(result.generated, taskAssignmentDeps);
    logAssignmentEmailFailure(assignmentEmailSent);
    response.json({
      status: 'ok',
      generatedCount: result.generated.length,
      ...(assignmentEmailSent === null ? {} : { assignmentEmailSent }),
    });
  });

  app.get('/task-templates', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ templates: [] });
      return;
    }
    response.json({ templates: listTaskTemplates(parsed.data.organizationId) });
  });

  app.post('/task-templates', (request, response) => {
    const parsed = z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1),
        category: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        items: z
          .array(
            z.object({
              title: z.string().min(1),
              description: z.string().optional(),
              estimatedMinutes: z.number().nullable().optional(),
            }),
          )
          .min(1),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', template: null });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ status: 'denied', template: null });
      return;
    }
    const result = createTaskTemplate(parsed.data);
    response.status(result.status === 'denied' ? 400 : 200).json(result);
  });

  app.post('/task-templates/:templateId/apply', async (request, response) => {
    const params = z.object({ templateId: z.string().uuid() }).safeParse(request.params);
    const parsed = z
      .object({
        organizationId: z.string().uuid(),
        ownerId: z.string().uuid().nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ status: 'denied', tasks: [] });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ status: 'denied', tasks: [] });
      return;
    }
    const result = applyTaskTemplate(
      params.data.templateId,
      parsed.data.organizationId,
      parsed.data.ownerId,
      parsed.data.dueAt,
      Date.now(),
      actor,
    );
    const assignmentEmailSent =
      result.status === 'applied'
        ? await notifyTaskAssignments(result.tasks, taskAssignmentDeps)
        : null;
    logAssignmentEmailFailure(assignmentEmailSent);
    response.status(result.status === 'denied' ? 404 : 200).json({
      ...result,
      ...(assignmentEmailSent === null ? {} : { assignmentEmailSent }),
    });
  });

  app.get('/tasks/bottlenecks', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ bottlenecks: [] });
      return;
    }
    response.json({ bottlenecks: findTaskBottlenecks(parsed.data.organizationId) });
  });

  app.post('/tasks', async (request, response) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', reason: 'invalid_input', task: null });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ status: 'denied', reason: 'invalid_input', task: null });
      return;
    }
    const result = createTask(parsed.data, Date.now(), actor === undefined ? null : actor);
    const assignmentEmailSent =
      result.status === 'created' && result.task
        ? await notifyTaskAssignments([result.task], taskAssignmentDeps)
        : null;
    logAssignmentEmailFailure(assignmentEmailSent);
    response.status(result.status === 'denied' ? 400 : 200).json({
      ...result,
      ...(assignmentEmailSent === null ? {} : { assignmentEmailSent }),
    });
  });

  app.patch('/tasks/:taskId', async (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const parsed = updateTaskSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ status: 'denied', reason: 'invalid_input', task: null });
      return;
    }
    const actor = parseSessionActor(request);
    const hasAssignmentChange =
      parsed.data.ownerId !== undefined ||
      parsed.data.priority !== undefined ||
      parsed.data.title !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.category !== undefined ||
      parsed.data.estimatedMinutes !== undefined ||
      parsed.data.dueAt !== undefined ||
      parsed.data.dependsOn !== undefined ||
      parsed.data.requiresApproval !== undefined ||
      parsed.data.approverId !== undefined ||
      parsed.data.recurrence !== undefined;
    // Operatives may only change the status; owner/priority changes require
    // organization or Nivel Administrativo.
    const allowed = hasAssignmentChange ? canCreateTask(actor ?? null) : true;
    if (actor !== undefined && actorDenied(actor, allowed)) {
      response.status(403).json({ status: 'denied', reason: 'invalid_input', task: null });
      return;
    }
    const previousOwnerId =
      getTaskById(params.data.taskId, parsed.data.organizationId)?.ownerId ?? null;
    const result = updateTask(
      params.data.taskId,
      parsed.data,
      Date.now(),
      actor === undefined ? null : actor,
    );
    if (result.status === 'denied') {
      const code =
        result.reason === 'not_found' ? 404 : result.reason === 'approval_required' ? 403 : 400;
      response.status(code).json(result);
      return;
    }
    const assignmentEmailSent =
      result.task?.ownerId && result.task.ownerId !== previousOwnerId
        ? await notifyTaskAssignments([result.task], taskAssignmentDeps)
        : null;
    logAssignmentEmailFailure(assignmentEmailSent);
    response.json({
      ...result,
      ...(assignmentEmailSent === null ? {} : { assignmentEmailSent }),
    });
  });

  app.get('/activities', (request, response) => {
    const parsed = activitiesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ activities: [] });
      return;
    }
    response.json({
      activities: listActivities(parsed.data.organizationId, parsed.data.range),
    });
  });

  app.get('/categories', (request, response) => {
    const parsed = organizationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ categories: [] });
      return;
    }
    response.json({ categories: listCategories(parsed.data.organizationId) });
  });

  app.post('/categories', (request, response) => {
    const parsed = z
      .object({ organizationId: z.string().uuid(), name: z.string().min(1) })
      .safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ categories: listCategories('') });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ categories: listCategories(parsed.data.organizationId) });
      return;
    }
    const result = addCategory(parsed.data.organizationId, parsed.data.name);
    response.json(result);
  });

  app.get('/tasks/:taskId', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const query = organizationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      response.status(400).json({ status: 'denied', task: null });
      return;
    }
    const task = getTaskById(params.data.taskId, query.data.organizationId);
    response.status(task ? 200 : 404).json({ task });
  });

  app.delete('/tasks/:taskId', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const query = organizationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canCreateTask(actor ?? null))) {
      response.status(403).json({ status: 'denied' });
      return;
    }
    const deleted = deleteTask(params.data.taskId, query.data.organizationId);
    response.status(deleted ? 200 : 404).json({ status: deleted ? 'deleted' : 'denied' });
  });

  app.get('/tasks/:taskId/comments', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const query = organizationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      response.status(400).json({ comments: [] });
      return;
    }
    response.json({
      comments: listTaskComments(params.data.taskId, query.data.organizationId),
    });
  });

  app.post('/tasks/:taskId/comments', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const parsed = z
      .object({ organizationId: z.string().uuid(), text: z.string().min(1) })
      .safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ status: 'denied', comment: null });
      return;
    }
    const actor = parseSessionActor(request);
    const result = addTaskComment(
      params.data.taskId,
      parsed.data.organizationId,
      parsed.data.text,
      actor === undefined ? null : actor,
    );
    response
      .status(result.status === 'added' ? 200 : 404)
      .json({ status: result.status, comment: result.comment });
  });

  app.get('/tasks/:taskId/attachments', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const query = organizationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      response.status(400).json({ attachments: [] });
      return;
    }
    const task = getTaskById(params.data.taskId, query.data.organizationId);
    if (!task) {
      response.status(404).json({ attachments: [] });
      return;
    }
    response.json({
      attachments: listTaskAttachments(params.data.taskId, query.data.organizationId),
    });
  });

  app.post('/tasks/:taskId/attachments', (request, response) => {
    const params = z.object({ taskId: z.string().uuid() }).safeParse(request.params);
    const parsed = z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().min(0),
        dataUrl: z.string().min(1),
      })
      .safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ status: 'denied', attachment: null });
      return;
    }
    const actor = parseSessionActor(request);
    const result = addTaskAttachment(
      params.data.taskId,
      parsed.data.organizationId,
      parsed.data,
      actor === undefined ? null : actor,
    );
    response
      .status(result.status === 'added' ? 200 : 404)
      .json({ status: result.status, attachment: result.attachment });
  });

  app.delete('/tasks/:taskId/attachments/:attachmentId', (request, response) => {
    const params = z
      .object({ taskId: z.string().uuid(), attachmentId: z.string().uuid() })
      .safeParse(request.params);
    const query = organizationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      response.status(400).json({ status: 'denied' });
      return;
    }
    const removed = removeTaskAttachment(params.data.attachmentId, query.data.organizationId);
    response.status(removed ? 200 : 404).json({ status: removed ? 'removed' : 'denied' });
  });

  app.post('/employees/sign-in', (request, response) => {
    const parsed = employeeSignInSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', employee: null });
      return;
    }
    const result = redeemEmployeeAccessCode(parsed.data.accessCode);
    if (result.status === 'approved' && result.acceptedNow && result.employee) {
      const employee = result.employee;
      const employeeName = `${employee.firstName} ${employee.lastName}`;
      recordEmployeeActivity(
        employee.organizationId,
        employee.id,
        employeeName,
        { kind: 'employee', employeeId: employee.id, authorityLevel: employee.authorityLevel },
        'invitation_accepted',
        `${employeeName} aceptó la invitación.`,
      );
    }
    response.status(result.status === 'denied' ? 401 : 200).json(result);
  });

  app.post('/auth/organizations/reset-password', async (request, response) => {
    const parsed = resetSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ status: 'denied', decision: null, userId: null, reason: 'invalid_token' });
      return;
    }
    const result = await resetPasswordWithToken(parsed.data, ...(authClient ? [authClient] : []));
    response.status(result.status === 'denied' ? 400 : 200).json(result);
  });

  app.post('/agents/assistant', async (request, response) => {
    const parsed = assistantQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ status: 'denied', answer: null });
      return;
    }
    const actor = parseSessionActor(request);
    if (actorDenied(actor, canUseAssistant(actor ?? null))) {
      response.status(403).json({ status: 'denied', answer: null });
      return;
    }
    const answer: AssistantAnswer = runAssistantQuery({
      organizationId: parsed.data.organizationId,
      query: parsed.data.query,
    });
    response.status(200).json(answer);
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/__dev__/employee-code-emails', (_request, response) => {
      response.json({
        emails: employeeCodeEmailOutbox.map((message) => ({
          to: message.to,
          employeeId: message.employeeId,
          accessCode: message.accessCode,
        })),
      });
    });
    app.get('/__dev__/recovery-emails', (_request, response) => {
      response.json({ emails: devEmailOutbox });
    });
  }

  if (process.env.NODE_ENV === 'test') {
    app.post('/__test__/recovery-token', (request, response) => {
      const parsed = z
        .object({ email: z.string().email(), token: z.string().min(1) })
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false });
        return;
      }
      registerRecoveryTokenForTest(parsed.data.email, parsed.data.token);
      response.json({ ok: true });
    });
  }

  return app;
}
