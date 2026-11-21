export type OrganizationAuthStatus = 'approved' | 'denied' | 'email_sent' | 'incomplete';

export interface OrganizationAuthResult {
  status: OrganizationAuthStatus;
  decision: { allowed: boolean; reason: string } | null;
  missingFields: string[];
  userId: string | null;
  emailSent: boolean;
}

export interface RegistrationInput {
  companyName: string;
  email: string;
  password: string;
  organizationType: string;
  description?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function registerOrganization(
  input: RegistrationInput,
): Promise<OrganizationAuthResult> {
  return requestOrganizationAuth('/auth/organizations/register', input);
}

export async function signInOrganization(input: SignInInput): Promise<OrganizationAuthResult> {
  return requestOrganizationAuth('/auth/organizations/sign-in', input);
}

export interface PasswordRecoveryResult {
  status: 'email_sent' | 'denied';
  emailSent: boolean;
  accountExists: boolean;
}

export interface PasswordResetResult {
  status: 'approved' | 'denied';
  decision: { allowed: boolean; reason: string } | null;
  reason: 'approved' | 'password_reused' | 'email_mismatch' | 'invalid_token';
}

export async function requestPasswordRecovery(input: {
  email: string;
}): Promise<PasswordRecoveryResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/auth/organizations/password-recovery`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as PasswordRecoveryResult;
}

export type AuthorityLevel = 'administrative' | 'operative';

export type SessionActor =
  | { kind: 'organization' }
  | { kind: 'employee'; employeeId: string; authorityLevel: AuthorityLevel };

export function actorHeaders(actor?: SessionActor | null): Record<string, string> {
  if (!actor || actor.kind === 'organization') {
    return actor ? { 'x-actor-kind': 'organization' } : {};
  }
  return {
    'x-actor-kind': 'employee',
    'x-actor-authority': actor.authorityLevel,
    'x-actor-employee-id': actor.employeeId,
  };
}

export type EmployeeAvailabilityStatus =
  'available' | 'vacation' | 'leave' | 'absent' | 'temporarily_unavailable';

export interface EmployeeInvitationInput {
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  authorityLevel: AuthorityLevel;
  skills?: string[];
  weeklyCapacityHours?: number;
  availabilityStatus?: EmployeeAvailabilityStatus;
  onboardingCompleted?: boolean;
}

export interface EmployeeInvitationResult {
  status: 'email_sent' | 'denied' | 'incomplete';
  missingFields: string[];
  emailSent: boolean;
  emailAlreadyExists: boolean;
  employee: {
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
  } | null;
}

export async function createEmployeeInvitation(
  input: EmployeeInvitationInput,
  actor?: SessionActor | null,
): Promise<EmployeeInvitationResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/employees/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify(input),
  });
  return (await response.json()) as EmployeeInvitationResult;
}

export interface EmployeeSignInResult {
  status: 'approved' | 'denied';
  employee: EmployeeInvitationResult['employee'];
}

export async function signInEmployee(input: { accessCode: string }): Promise<EmployeeSignInResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/employees/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await response.json()) as EmployeeSignInResult;
}

export interface EmployeeProfile {
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

export async function fetchJoinedEmployees(organizationId: string): Promise<EmployeeProfile[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { employees: EmployeeProfile[] };
  return result.employees;
}

export async function deleteEmployeeAccount(
  organizationId: string,
  employeeId: string,
  actor?: SessionActor | null,
  options?: { mode?: 'reassign' | 'unassign' | 'cancel'; toEmployeeId?: string | null },
): Promise<{ status: 'deleted' | 'denied'; affectedTaskIds?: string[] }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const params = new URLSearchParams({ organizationId });
  if (options?.mode) {
    params.set('mode', options.mode);
  }
  if (options?.toEmployeeId) {
    params.set('toEmployeeId', options.toEmployeeId);
  }
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees/${encodeURIComponent(employeeId)}?${params.toString()}`,
    { method: 'DELETE', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as {
    status: 'deleted' | 'denied';
    affectedTaskIds?: string[];
  };
}

export async function fetchInvitations(organizationId: string): Promise<EmployeeInvitationView[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees/invites?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { invitations: EmployeeInvitationView[] };
  return result.invitations;
}

export async function resendEmployeeInvitation(
  organizationId: string,
  invitationId: string,
  actor?: SessionActor | null,
): Promise<{
  status: 'email_sent' | 'denied';
  emailSent: boolean;
  employee: EmployeeProfile | null;
}> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees/invites/${encodeURIComponent(invitationId)}/resend?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'POST', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as {
    status: 'email_sent' | 'denied';
    emailSent: boolean;
    employee: EmployeeProfile | null;
  };
}

export interface DepartmentLead {
  organizationId: string;
  department: string;
  employeeId: string;
  assignedAt: string;
  assignedBy: string | null;
}

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface CreateDepartmentResult {
  status: 'created' | 'denied';
  reason: 'duplicate' | 'invalid_input' | null;
  department: Department | null;
}

export async function fetchDepartments(organizationId: string): Promise<Department[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/departments?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { departments: Department[] };
  return result.departments ?? [];
}

export async function createDepartment(
  organizationId: string,
  name: string,
  actor?: SessionActor | null,
): Promise<CreateDepartmentResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/departments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify({ organizationId, name }),
  });
  return (await response.json()) as CreateDepartmentResult;
}

export async function deleteDepartment(
  departmentId: string,
  organizationId: string,
  actor?: SessionActor | null,
): Promise<{ status: 'deleted' | 'denied'; reason: 'not_found' | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/departments/${encodeURIComponent(departmentId)}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as {
    status: 'deleted' | 'denied';
    reason: 'not_found' | null;
  };
}

export interface AssignDepartmentLeadResult {
  status: 'assigned' | 'denied';
  reason: 'not_owner' | 'not_administrative' | 'not_employee' | 'already_lead' | null;
  lead: DepartmentLead | null;
}

export async function fetchDepartmentLeads(organizationId: string): Promise<DepartmentLead[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/department-leads?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { leads: DepartmentLead[] };
  return result.leads ?? [];
}

export async function assignDepartmentLead(
  organizationId: string,
  department: string,
  employeeId: string,
  actor?: SessionActor | null,
): Promise<AssignDepartmentLeadResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/department-leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify({ organizationId, department, employeeId }),
  });
  return (await response.json()) as AssignDepartmentLeadResult;
}

export async function removeDepartmentLead(
  organizationId: string,
  department: string,
  actor?: SessionActor | null,
): Promise<{ status: 'removed' | 'denied'; reason: 'not_owner' | 'not_found' | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/department-leads/${encodeURIComponent(department)}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as {
    status: 'removed' | 'denied';
    reason: 'not_owner' | 'not_found' | null;
  };
}

export async function cancelEmployeeInvitation(
  organizationId: string,
  invitationId: string,
  actor?: SessionActor | null,
): Promise<{ status: 'cancelled' | 'denied' }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees/invites/${encodeURIComponent(invitationId)}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as { status: 'cancelled' | 'denied' };
}

export async function updateEmployeeProfile(
  employeeId: string,
  input: {
    organizationId: string;
    position?: string;
    department?: string;
    authorityLevel?: AuthorityLevel;
    skills?: string[];
    weeklyCapacityHours?: number;
    availabilityStatus?: EmployeeAvailabilityStatus;
    onboardingCompleted?: boolean;
  },
  actor?: SessionActor | null,
): Promise<{ status: 'updated' | 'denied'; employee: EmployeeProfile | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/employees/${encodeURIComponent(employeeId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as {
    status: 'updated' | 'denied';
    employee: EmployeeProfile | null;
  };
}

export type TaskStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export const DEFAULT_TASK_CATEGORIES = [
  'Administración',
  'Finanzas',
  'Marketing',
  'Recursos Humanos',
  'Ventas',
  'Tecnología',
  'Otros',
];

export type OverviewRange = '7d' | '30d' | '90d' | 'all';

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  estimatedMinutes: number | null;
  ownerId: string | null;
  ownerName: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: TaskStatus;
  dependsOn?: string[];
  requiresApproval?: boolean;
  approverId?: string | null;
  recurrence?: { frequency: 'daily' | 'weekly' | 'fortnight' | 'monthly' } | null;
  checklist: ChecklistItem[];
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export type AssistantFindingSeverity = 'info' | 'warning' | 'critical';

export interface AssistantFinding {
  title: string;
  summary: string;
  severity: AssistantFindingSeverity;
  taskIds: string[];
  employeeIds: string[];
  department?: string;
}

export interface AssistantFindingSource {
  agentVersion: string;
  intent: string;
  findings: AssistantFinding[];
  metrics: Record<string, number>;
}

export interface AssistantAnswer {
  status: 'answered' | 'insufficient';
  answer: string;
  findings: AssistantFinding[];
  agentVersion: string;
  sources: AssistantFindingSource[];
}

export async function fetchAssistantAnswer(
  organizationId: string,
  query: string,
  actor?: SessionActor | null,
): Promise<AssistantAnswer> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/agents/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify({ organizationId, query }),
  });
  return (await response.json()) as AssistantAnswer;
}

export interface TaskComment {
  id: string;
  organizationId: string;
  taskId: string;
  authorName: string;
  authorEmployeeId: string | null;
  text: string;
  createdAt: string;
}

export interface TaskAttachmentInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export interface TaskAttachment {
  id: string;
  organizationId: string;
  taskId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedBy: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  organizationId: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  actorEmployeeId: string | null;
  type: string;
  message: string;
  createdAt: string;
}

export interface TaskTemplateItem {
  title: string;
  description?: string;
  estimatedMinutes?: number | null;
}

export interface TaskTemplate {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  priority: Task['priority'];
  items: TaskTemplateItem[];
  createdAt: string;
}

export async function fetchTaskTemplates(organizationId: string): Promise<TaskTemplate[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/task-templates?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { templates: TaskTemplate[] };
  return result.templates ?? [];
}

export async function createTaskTemplate(
  input: {
    organizationId: string;
    name: string;
    category?: string;
    priority?: Task['priority'];
    items: TaskTemplateItem[];
  },
  actor?: SessionActor | null,
): Promise<{ status: 'created' | 'denied'; template: TaskTemplate | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/task-templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify(input),
  });
  return (await response.json()) as {
    status: 'created' | 'denied';
    template: TaskTemplate | null;
  };
}

export async function applyTaskTemplate(
  templateId: string,
  input: { organizationId: string; ownerId?: string | null; dueAt?: string | null },
  actor?: SessionActor | null,
): Promise<{ status: 'applied' | 'denied'; tasks: Task[] }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/task-templates/${encodeURIComponent(templateId)}/apply`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
      body: JSON.stringify(input),
    },
  );
  const result = (await response.json()) as { status: 'applied' | 'denied'; tasks: Task[] };
  return { status: result.status, tasks: result.tasks ?? [] };
}

export async function generateRecurringTasks(
  organizationId: string,
  actor?: SessionActor | null,
): Promise<{ status: 'ok' | 'denied'; generatedCount: number }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/tasks/generate-recurring`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify({ organizationId }),
  });
  return (await response.json()) as { status: 'ok' | 'denied'; generatedCount: number };
}

export async function fetchTasks(organizationId: string): Promise<Task[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { tasks: Task[] };
  return result.tasks;
}

export async function createTask(
  input: {
    organizationId: string;
    title: string;
    description?: string;
    category?: string;
    estimatedMinutes?: number | null;
    priority: Task['priority'];
    ownerId?: string;
    dependsOn?: string[];
    requiresApproval?: boolean;
    approverId?: string | null;
    recurrence?: { frequency: 'daily' | 'weekly' | 'fortnight' | 'monthly' } | null;
    dueAt?: string | null;
    attachments?: TaskAttachmentInput[];
  },
  actor?: SessionActor | null,
): Promise<{ status: 'created' | 'denied'; reason?: string | null; task: Task | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify(input),
  });
  return (await response.json()) as {
    status: 'created' | 'denied';
    reason?: string | null;
    task: Task | null;
  };
}

export async function updateTask(
  taskId: string,
  input: {
    organizationId: string;
    title?: string;
    description?: string;
    category?: string;
    estimatedMinutes?: number | null;
    status?: TaskStatus;
    ownerId?: string | null;
    priority?: Task['priority'];
    dependsOn?: string[];
    requiresApproval?: boolean;
    approverId?: string | null;
    recurrence?: { frequency: 'daily' | 'weekly' | 'fortnight' | 'monthly' } | null;
    dueAt?: string | null;
    checklist?: ChecklistItem[];
  },
  actor?: SessionActor | null,
): Promise<{ status: 'updated' | 'denied'; reason: string | null; task: Task | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as {
    status: 'updated' | 'denied';
    reason: string | null;
    task: Task | null;
  };
}

export async function fetchActivities(
  organizationId: string,
  range: OverviewRange = 'all',
): Promise<TaskActivity[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/activities?organizationId=${encodeURIComponent(organizationId)}&range=${encodeURIComponent(range)}`,
  );
  const result = (await response.json()) as { activities: TaskActivity[] };
  return result.activities;
}

export interface TaskBottleneck {
  dependencyTaskId: string;
  dependencyTitle: string;
  ownerName: string | null;
  blockedTaskIds: string[];
  blockedCount: number;
}

export async function fetchBottlenecks(organizationId: string): Promise<TaskBottleneck[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/bottlenecks?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { bottlenecks: TaskBottleneck[] };
  return result.bottlenecks ?? [];
}

export async function fetchCategories(organizationId: string): Promise<string[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/categories?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { categories: string[] };
  return result.categories;
}

export async function addCategory(
  organizationId: string,
  name: string,
  actor?: SessionActor | null,
): Promise<{ categories: string[] }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}/categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
    body: JSON.stringify({ organizationId, name }),
  });
  return (await response.json()) as { categories: string[] };
}

export async function deleteTask(
  taskId: string,
  organizationId: string,
  actor?: SessionActor | null,
): Promise<{ status: 'deleted' | 'denied' }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE', headers: { ...actorHeaders(actor) } },
  );
  return (await response.json()) as { status: 'deleted' | 'denied' };
}

export async function fetchTaskComments(
  taskId: string,
  organizationId: string,
): Promise<TaskComment[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}/comments?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { comments: TaskComment[] };
  return result.comments;
}

export async function addTaskComment(
  taskId: string,
  input: { organizationId: string; text: string },
  actor?: SessionActor | null,
): Promise<{ status: 'added' | 'denied'; comment: TaskComment | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}/comments`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as { status: 'added' | 'denied'; comment: TaskComment | null };
}

export async function fetchTaskAttachments(
  taskId: string,
  organizationId: string,
): Promise<TaskAttachment[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}/attachments?organizationId=${encodeURIComponent(organizationId)}`,
  );
  const result = (await response.json()) as { attachments: TaskAttachment[] };
  return result.attachments;
}

export async function addTaskAttachment(
  taskId: string,
  input: {
    organizationId: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  },
  actor?: SessionActor | null,
): Promise<{ status: 'added' | 'denied'; attachment: TaskAttachment | null }> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/tasks/${encodeURIComponent(taskId)}/attachments`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...actorHeaders(actor) },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as {
    status: 'added' | 'denied';
    attachment: TaskAttachment | null;
  };
}

export async function resetPassword(input: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<PasswordResetResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(
    `${baseUrl ?? 'http://localhost:3001'}/auth/organizations/reset-password`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return (await response.json()) as PasswordResetResult;
}

async function requestOrganizationAuth(
  path: string,
  body: RegistrationInput | SignInInput,
): Promise<OrganizationAuthResult> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const response = await fetch(`${baseUrl ?? 'http://localhost:3001'}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as OrganizationAuthResult;
  if (!response.ok && result.status !== 'denied') {
    throw new Error('No se pudo completar la autenticación');
  }
  return result;
}
