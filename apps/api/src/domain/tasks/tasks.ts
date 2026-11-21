import { randomUUID } from 'node:crypto';
import {
  canAssignTaskToEmployee,
  getEmployeeInvitationById,
  type SessionActor,
} from '../auth/employee-invitation.js';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export const TASK_STATUSES: TaskStatus[] = [
  'pending',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
];

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'fortnight', 'monthly'] as const;
export type TaskRecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskRecurrence {
  frequency: TaskRecurrenceFrequency;
  nextDueAt: string | null;
}

function advanceDate(iso: string, frequency: TaskRecurrenceFrequency): string {
  const base = new Date(iso);
  switch (frequency) {
    case 'daily':
      base.setUTCDate(base.getUTCDate() + 1);
      break;
    case 'weekly':
      base.setUTCDate(base.getUTCDate() + 7);
      break;
    case 'fortnight':
      base.setUTCDate(base.getUTCDate() + 15);
      break;
    case 'monthly':
      base.setUTCMonth(base.getUTCMonth() + 1);
      break;
  }
  return base.toISOString();
}

export const DEFAULT_TASK_CATEGORIES: string[] = [
  'Administración',
  'Finanzas',
  'Marketing',
  'Recursos Humanos',
  'Ventas',
  'Tecnología',
  'Otros',
];

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'in_review', 'completed', 'cancelled'],
  in_progress: ['in_review', 'completed', 'cancelled', 'pending'],
  in_review: ['completed', 'in_progress', 'cancelled', 'pending'],
  completed: ['pending'],
  cancelled: ['pending'],
};

export type OverviewRange = '7d' | '30d' | '90d' | 'all';

export interface TaskRecord {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  estimatedMinutes: number | null;
  ownerId: string | null;
  ownerName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dependsOn: string[];
  requiresApproval: boolean;
  approverId: string | null;
  recurrence: TaskRecurrence | null;
  checklist: TaskChecklistItem[];
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export interface CreateTaskInput {
  organizationId: string;
  title: string;
  description?: string;
  category?: string;
  estimatedMinutes?: number | null;
  priority: TaskPriority;
  ownerId?: string;
  dependsOn?: string[];
  dueAt?: string | null;
  requiresApproval?: boolean;
  approverId?: string | null;
  recurrence?: { frequency: TaskRecurrenceFrequency } | null;
  checklist?: TaskChecklistItem[];
  attachments?: TaskAttachmentInput[];
}

export interface CreateTaskResult {
  status: 'created' | 'denied';
  reason: 'invalid_input' | 'invalid_owner' | 'invalid_dependency' | null;
  task: TaskRecord | null;
}

export interface UpdateTaskInput {
  organizationId: string;
  title?: string;
  description?: string;
  category?: string;
  estimatedMinutes?: number | null;
  status?: TaskStatus;
  ownerId?: string | null;
  priority?: TaskPriority;
  dependsOn?: string[];
  dueAt?: string | null;
  requiresApproval?: boolean;
  approverId?: string | null;
  recurrence?: { frequency: TaskRecurrenceFrequency } | null;
  checklist?: TaskChecklistItem[];
}

export interface UpdateTaskResult {
  status: 'updated' | 'denied';
  reason:
    | 'invalid_transition'
    | 'invalid_owner'
    | 'not_found'
    | 'invalid_input'
    | 'invalid_dependency'
    | 'blocked_by_dependency'
    | 'approval_required'
    | null;
  task: TaskRecord | null;
}

export type TaskActivityType =
  | 'created'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'reopened'
  | 'reassigned'
  | 'priority_changed'
  | 'status_changed'
  | 'edited'
  | 'commented'
  | 'attached'
  | 'dependency_added'
  | 'dependency_removed'
  | 'department_created'
  | 'department_deleted'
  | 'employee_invited'
  | 'invitation_accepted'
  | 'employee_deleted'
  | 'department_lead_assigned'
  | 'department_lead_removed';

export interface TaskCommentRecord {
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

export interface TaskAttachmentRecord {
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

export interface TaskActivityRecord {
  id: string;
  organizationId: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  actorEmployeeId: string | null;
  type: TaskActivityType;
  message: string;
  createdAt: string;
}

const TASKS = new Map<string, TaskRecord>();

const ACTIVITIES: TaskActivityRecord[] = [];

const COMMENTS: TaskCommentRecord[] = [];

const ATTACHMENTS: TaskAttachmentRecord[] = [];

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MAX_ATTACHMENTS_PER_TASK = 5;

const BASE64_DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/;

const CUSTOM_CATEGORIES = new Map<string, string[]>();

export function listCategories(organizationId: string): string[] {
  const custom = CUSTOM_CATEGORIES.get(organizationId) ?? [];
  const all = [...DEFAULT_TASK_CATEGORIES];
  for (const category of custom) {
    if (!all.includes(category)) {
      all.push(category);
    }
  }
  return all;
}

export function addCategory(
  organizationId: string,
  name: string,
): { status: 'added' | 'denied'; categories: string[] } {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) {
    return { status: 'denied', categories: listCategories(organizationId) };
  }
  const categories = listCategories(organizationId);
  if (categories.some((category) => category.toLowerCase() === trimmed.toLowerCase())) {
    return { status: 'added', categories };
  }
  const custom = CUSTOM_CATEGORIES.get(organizationId) ?? [];
  custom.push(trimmed);
  CUSTOM_CATEGORIES.set(organizationId, custom);
  return { status: 'added', categories: [...categories, trimmed] };
}

export function normalizeCategory(category?: string): string {
  const trimmed = (category ?? '').trim();
  return trimmed || 'Otros';
}

function normalizeChecklist(items: TaskChecklistItem[] | undefined): TaskChecklistItem[] {
  const ids = new Set<string>();
  return (items ?? []).reduce<TaskChecklistItem[]>((result, item) => {
    const id = item.id.trim();
    const text = item.text.trim();
    if (!id || !text || ids.has(id)) {
      return result;
    }
    ids.add(id);
    result.push({ id, text, completed: item.completed === true });
    return result;
  }, []);
}

export function listTaskComments(taskId: string, organizationId?: string): TaskCommentRecord[] {
  return COMMENTS.filter(
    (comment) =>
      comment.taskId === taskId &&
      (organizationId === undefined || comment.organizationId === organizationId),
  ).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function addTaskComment(
  taskId: string,
  organizationId: string,
  text: string,
  actor?: SessionActor | null,
  now: number = Date.now(),
): { status: 'added' | 'denied'; comment: TaskCommentRecord | null } {
  const task = TASKS.get(taskId);
  const trimmed = text.trim();
  if (!task || task.organizationId !== organizationId || !trimmed) {
    return { status: 'denied', comment: null };
  }
  const comment: TaskCommentRecord = {
    id: randomUUID(),
    organizationId,
    taskId,
    authorName: resolveActorName(actor),
    authorEmployeeId: actor?.employeeId ?? null,
    text: trimmed,
    createdAt: new Date(now).toISOString(),
  };
  COMMENTS.push(comment);
  recordActivity(
    task,
    actor,
    'commented',
    `${comment.authorName} comentó en ${task.title}: ${comment.text}`,
    now,
  );
  return { status: 'added', comment };
}

export function listTaskAttachments(
  taskId: string,
  organizationId: string,
): TaskAttachmentRecord[] {
  return ATTACHMENTS.filter(
    (attachment) => attachment.taskId === taskId && attachment.organizationId === organizationId,
  );
}

function decodeDataUrl(dataUrl: string): { mimeType: string; sizeBytes: number } | null {
  const match = BASE64_DATA_URL.exec(dataUrl);
  if (!match) {
    return null;
  }
  const encoded = match[2];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return {
    mimeType: match[1],
    sizeBytes: Math.floor((encoded.length * 3) / 4) - padding,
  };
}

function buildAttachmentRecords(
  organizationId: string,
  taskId: string,
  inputs: TaskAttachmentInput[],
  actor: SessionActor | undefined | null,
  now: number,
): TaskAttachmentRecord[] | null {
  if (inputs.length > MAX_ATTACHMENTS_PER_TASK) {
    return null;
  }
  let totalBytes = 0;
  const records: TaskAttachmentRecord[] = [];
  for (const input of inputs) {
    const name = input.name.trim();
    const decoded = decodeDataUrl(input.dataUrl);
    if (
      !name ||
      !decoded ||
      decoded.mimeType !== (input.mimeType || 'application/octet-stream') ||
      decoded.sizeBytes !== input.sizeBytes ||
      input.sizeBytes > MAX_ATTACHMENT_BYTES
    ) {
      return null;
    }
    totalBytes += input.sizeBytes;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return null;
    }
    records.push({
      id: randomUUID(),
      organizationId,
      taskId,
      name,
      mimeType: input.mimeType || 'application/octet-stream',
      sizeBytes: input.sizeBytes,
      dataUrl: input.dataUrl,
      uploadedBy: resolveActorName(actor),
      createdAt: new Date(now).toISOString(),
    });
  }
  return records;
}

export function addTaskAttachment(
  taskId: string,
  organizationId: string,
  input: TaskAttachmentInput,
  actor?: SessionActor | null,
  now: number = Date.now(),
): { status: 'added' | 'denied'; attachment: TaskAttachmentRecord | null } {
  const task = TASKS.get(taskId);
  if (!task || task.organizationId !== organizationId) {
    return { status: 'denied', attachment: null };
  }
  const records = buildAttachmentRecords(organizationId, taskId, [input], actor, now);
  if (!records || records.length !== 1) {
    return { status: 'denied', attachment: null };
  }
  const attachment = records[0];
  ATTACHMENTS.push(attachment);
  recordActivity(
    task,
    actor,
    'attached',
    `${attachment.uploadedBy} adjuntó ${attachment.name} a ${task.title}.`,
    now,
  );
  return { status: 'added', attachment };
}

export function removeTaskAttachment(attachmentId: string, organizationId: string): boolean {
  const index = ATTACHMENTS.findIndex(
    (attachment) => attachment.id === attachmentId && attachment.organizationId === organizationId,
  );
  if (index === -1) {
    return false;
  }
  ATTACHMENTS.splice(index, 1);
  return true;
}

export function getTaskById(taskId: string, organizationId: string): TaskRecord | null {
  const task = TASKS.get(taskId);
  return task && task.organizationId === organizationId ? task : null;
}

export function deleteTask(taskId: string, organizationId: string): boolean {
  const task = TASKS.get(taskId);
  if (!task || task.organizationId !== organizationId) {
    return false;
  }
  TASKS.delete(taskId);
  for (const other of TASKS.values()) {
    if (other.organizationId === organizationId && other.dependsOn.includes(taskId)) {
      other.dependsOn = other.dependsOn.filter((id) => id !== taskId);
      other.updatedAt = task.updatedAt;
    }
  }
  for (let index = COMMENTS.length - 1; index >= 0; index -= 1) {
    if (COMMENTS[index].taskId === taskId) {
      COMMENTS.splice(index, 1);
    }
  }
  for (let index = ATTACHMENTS.length - 1; index >= 0; index -= 1) {
    if (ATTACHMENTS[index].taskId === taskId) {
      ATTACHMENTS.splice(index, 1);
    }
  }
  return true;
}

export function getBlockingDependencies(
  task: TaskRecord,
  tasks: Iterable<TaskRecord> = TASKS.values(),
): TaskRecord[] {
  const byId = new Map<string, TaskRecord>();
  for (const candidate of tasks) {
    if (candidate.organizationId === task.organizationId) {
      byId.set(candidate.id, candidate);
    }
  }
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter(
      (dependency): dependency is TaskRecord =>
        dependency !== undefined && dependency.status !== 'completed',
    );
}

export function isTaskBlockedByDependencies(
  task: TaskRecord,
  tasks?: Iterable<TaskRecord>,
): boolean {
  return getBlockingDependencies(task, tasks).length > 0;
}

export function generateUniqueTaskId(): string {
  let id = randomUUID();
  while (TASKS.has(id)) {
    id = randomUUID();
  }
  return id;
}

export function listTasks(organizationId: string): TaskRecord[] {
  return [...TASKS.values()].filter((task) => task.organizationId === organizationId);
}

export function listActivities(
  organizationId: string,
  range: OverviewRange = 'all',
  now: number = Date.now(),
): TaskActivityRecord[] {
  const cutoff = rangeCutoff(range, now);
  return ACTIVITIES.filter(
    (activity) =>
      activity.organizationId === organizationId &&
      (cutoff === null || Date.parse(activity.createdAt) >= cutoff),
  ).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function clearTasksForTest(): void {
  TASKS.clear();
  ACTIVITIES.length = 0;
  COMMENTS.length = 0;
  ATTACHMENTS.length = 0;
  CUSTOM_CATEGORIES.clear();
}

function uniqueTaskIds(ids: string[] | undefined): string[] {
  if (!ids) {
    return [];
  }
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export function normalizeDependencies(
  organizationId: string,
  dependsOn: string[] | undefined,
  taskId?: string,
): { ok: true; dependsOn: string[] } | { ok: false } {
  const normalized = uniqueTaskIds(dependsOn);
  if (taskId && normalized.includes(taskId)) {
    return { ok: false };
  }
  for (const dependencyId of normalized) {
    const dependency = TASKS.get(dependencyId);
    if (!dependency || dependency.organizationId !== organizationId) {
      return { ok: false };
    }
  }
  if (taskId) {
    const visited = new Set<string>();
    const stack = [...normalized];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) {
        continue;
      }
      if (current === taskId) {
        return { ok: false };
      }
      visited.add(current);
      const dependency = TASKS.get(current);
      if (dependency) {
        stack.push(...dependency.dependsOn);
      }
    }
  }
  return { ok: true, dependsOn: normalized };
}

export function rangeCutoff(range: OverviewRange, now: number): number | null {
  if (range === 'all') {
    return null;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return now - days * 24 * 60 * 60_000;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export function resolveActorName(actor?: SessionActor | null): string {
  if (actor?.employeeId) {
    const employee = getEmployeeInvitationById(actor.employeeId);
    if (employee) {
      return `${employee.firstName} ${employee.lastName}`;
    }
  }
  if (actor?.kind === 'employee') {
    return 'Un empleado';
  }
  return 'La organización';
}

function recordActivity(
  task: TaskRecord,
  actor: SessionActor | undefined | null,
  type: TaskActivityType,
  message: string,
  now: number,
): void {
  ACTIVITIES.push({
    id: randomUUID(),
    organizationId: task.organizationId,
    taskId: task.id,
    taskTitle: task.title,
    actorName: resolveActorName(actor),
    actorEmployeeId: actor?.employeeId ?? null,
    type,
    message,
    createdAt: new Date(now).toISOString(),
  });
}

export function recordDepartmentActivity(
  organizationId: string,
  departmentId: string,
  departmentName: string,
  actor: SessionActor | undefined | null,
  type: 'department_created' | 'department_deleted',
  message: string,
  now: number = Date.now(),
): void {
  ACTIVITIES.push({
    id: randomUUID(),
    organizationId,
    taskId: departmentId,
    taskTitle: departmentName,
    actorName: resolveActorName(actor),
    actorEmployeeId: actor?.employeeId ?? null,
    type,
    message,
    createdAt: new Date(now).toISOString(),
  });
}

export function recordEmployeeActivity(
  organizationId: string,
  employeeId: string,
  employeeName: string,
  actor: SessionActor | undefined | null,
  type:
    | 'employee_invited'
    | 'invitation_accepted'
    | 'employee_deleted'
    | 'department_lead_assigned'
    | 'department_lead_removed',
  message: string,
  now: number = Date.now(),
): void {
  ACTIVITIES.push({
    id: randomUUID(),
    organizationId,
    taskId: employeeId,
    taskTitle: employeeName,
    actorName: resolveActorName(actor),
    actorEmployeeId: actor?.employeeId ?? null,
    type,
    message,
    createdAt: new Date(now).toISOString(),
  });
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function createTask(
  input: CreateTaskInput,
  now: number = Date.now(),
  actor?: SessionActor | null,
): CreateTaskResult {
  const title = input.title.trim();
  if (!title || !input.organizationId.trim()) {
    return { status: 'denied', reason: 'invalid_input', task: null };
  }
  let ownerId: string | null = null;
  let ownerName: string | null = null;
  if (input.ownerId && input.ownerId.trim()) {
    const owner = getEmployeeInvitationById(input.ownerId.trim());
    if (!owner || owner.organizationId !== input.organizationId || owner.status !== 'redeemed') {
      return { status: 'denied', reason: 'invalid_owner', task: null };
    }
    const assignmentCheck = canAssignTaskToEmployee(
      actor === undefined ? null : actor,
      input.organizationId,
      owner.id,
    );
    if (!assignmentCheck.allowed) {
      return { status: 'denied', reason: 'invalid_owner', task: null };
    }
    ownerId = owner.id;
    ownerName = `${owner.firstName} ${owner.lastName}`;
  }
  const dependencies = normalizeDependencies(input.organizationId, input.dependsOn);
  if (!dependencies.ok) {
    return { status: 'denied', reason: 'invalid_dependency', task: null };
  }
  const requiresApproval = input.requiresApproval === true;
  let approverId: string | null = null;
  if (input.approverId && input.approverId.trim()) {
    const approver = getEmployeeInvitationById(input.approverId.trim());
    if (
      !approver ||
      approver.organizationId !== input.organizationId ||
      approver.status !== 'redeemed'
    ) {
      return { status: 'denied', reason: 'invalid_owner', task: null };
    }
    approverId = approver.id;
  }
  if (
    input.recurrence &&
    !(RECURRENCE_FREQUENCIES as readonly string[]).includes(input.recurrence.frequency)
  ) {
    return { status: 'denied', reason: 'invalid_input', task: null };
  }
  const baseNext =
    input.dueAt && !Number.isNaN(Date.parse(input.dueAt))
      ? new Date(Date.parse(input.dueAt)).toISOString()
      : new Date(now).toISOString();
  const recurrence: TaskRecurrence | null = input.recurrence
    ? {
        frequency: input.recurrence.frequency,
        nextDueAt: advanceDate(baseNext, input.recurrence.frequency),
      }
    : null;
  const dueAt = input.dueAt
    ? Number.isNaN(Date.parse(input.dueAt))
      ? null
      : new Date(Date.parse(input.dueAt)).toISOString()
    : null;
  const createdAt = new Date(now).toISOString();
  const taskId = generateUniqueTaskId();
  const attachments = buildAttachmentRecords(
    input.organizationId,
    taskId,
    input.attachments ?? [],
    actor,
    now,
  );
  if (!attachments) {
    return { status: 'denied', reason: 'invalid_input', task: null };
  }
  const task: TaskRecord = {
    id: taskId,
    organizationId: input.organizationId,
    title,
    description: input.description?.trim() ?? '',
    category: normalizeCategory(input.category),
    estimatedMinutes:
      input.estimatedMinutes !== undefined && input.estimatedMinutes !== null
        ? Math.max(0, Math.floor(input.estimatedMinutes))
        : null,
    ownerId,
    ownerName,
    priority: input.priority,
    status: 'pending',
    dependsOn: dependencies.dependsOn,
    requiresApproval,
    approverId,
    recurrence,
    checklist: normalizeChecklist(input.checklist),
    createdAt,
    dueAt,
    completedAt: null,
    cancelledAt: null,
    updatedAt: createdAt,
  };
  TASKS.set(task.id, task);
  ATTACHMENTS.push(...attachments);
  const actorName = resolveActorName(actor);
  recordActivity(
    task,
    actor,
    'created',
    `${actorName} cre\u00f3 una nueva tarea: ${task.title}.`,
    now,
  );
  if (attachments.length > 0) {
    recordActivity(
      task,
      actor,
      'attached',
      `${actorName} adjuntó ${attachments.length} archivo(s) a ${task.title}.`,
      now,
    );
  }
  if (dependencies.dependsOn.length > 0) {
    recordActivity(
      task,
      actor,
      'dependency_added',
      `${actorName} definió ${dependencies.dependsOn.length} dependencia(s) para ${task.title}.`,
      now,
    );
  }
  return { status: 'created', reason: null, task };
}

export function updateTask(
  taskId: string,
  input: UpdateTaskInput,
  now: number = Date.now(),
  actor?: SessionActor | null,
): UpdateTaskResult {
  const task = TASKS.get(taskId);
  if (!task || task.organizationId !== input.organizationId) {
    return { status: 'denied', reason: 'not_found', task: null };
  }
  const hasStatus = input.status !== undefined;
  const hasOwner = input.ownerId !== undefined;
  const hasPriority = input.priority !== undefined;
  const hasDue = input.dueAt !== undefined;
  const hasTitle = input.title !== undefined;
  const hasDescription = input.description !== undefined;
  const hasCategory = input.category !== undefined;
  const hasEstimate = input.estimatedMinutes !== undefined;
  const hasDependencies = input.dependsOn !== undefined;
  const hasRequiresApproval = input.requiresApproval !== undefined;
  const hasApprover = input.approverId !== undefined;
  const hasRecurrence = input.recurrence !== undefined;
  const hasChecklist = input.checklist !== undefined;
  if (
    !hasStatus &&
    !hasOwner &&
    !hasPriority &&
    !hasDue &&
    !hasTitle &&
    !hasDescription &&
    !hasCategory &&
    !hasEstimate &&
    !hasDependencies &&
    !hasRequiresApproval &&
    !hasApprover &&
    !hasRecurrence &&
    !hasChecklist
  ) {
    return { status: 'denied', reason: 'invalid_input', task: null };
  }
  // Validate status transition first so we never half-apply changes.
  if (hasStatus && input.status !== task.status) {
    if (!canTransitionTask(task.status, input.status as TaskStatus)) {
      return { status: 'denied', reason: 'invalid_transition', task: null };
    }
    // Fase 4.4, aprobaci\u00f3n configurable: in_review -> completed requires the designated approver (or owner/admin when none designated).
    if (task.status === 'in_review' && input.status === 'completed' && task.requiresApproval) {
      const isOwner = actor?.kind === 'organization';
      const isAdmin = actor?.kind === 'employee' && actor.authorityLevel === 'administrative';
      const isDesignatedApprover =
        task.approverId !== null &&
        actor?.kind === 'employee' &&
        actor.employeeId === task.approverId;
      if (!isOwner && !isAdmin && !isDesignatedApprover) {
        return { status: 'denied', reason: 'approval_required', task: null };
      }
    }
    if (
      (input.status === 'in_progress' ||
        input.status === 'in_review' ||
        input.status === 'completed') &&
      isTaskBlockedByDependencies(task)
    ) {
      return { status: 'denied', reason: 'blocked_by_dependency', task: null };
    }
  }
  let nextDependencies = task.dependsOn;
  if (hasDependencies) {
    const normalized = normalizeDependencies(input.organizationId, input.dependsOn, task.id);
    if (!normalized.ok) {
      return { status: 'denied', reason: 'invalid_dependency', task: null };
    }
    nextDependencies = normalized.dependsOn;
  }
  let nextOwnerId = task.ownerId;
  let nextOwnerName = task.ownerName;
  if (hasOwner) {
    if (input.ownerId === null || input.ownerId === '') {
      nextOwnerId = null;
      nextOwnerName = null;
    } else {
      const owner = getEmployeeInvitationById(String(input.ownerId).trim());
      if (!owner || owner.organizationId !== input.organizationId || owner.status !== 'redeemed') {
        return { status: 'denied', reason: 'invalid_owner', task: null };
      }
      const assignmentCheck = canAssignTaskToEmployee(
        actor === undefined ? null : actor,
        input.organizationId,
        owner.id,
      );
      if (!assignmentCheck.allowed) {
        return { status: 'denied', reason: 'invalid_owner', task: null };
      }
      nextOwnerId = owner.id;
      nextOwnerName = `${owner.firstName} ${owner.lastName}`;
    }
  }
  const actorName = resolveActorName(actor);
  const previousStatus = task.status;
  const previousOwnerName = task.ownerName;
  const previousPriority = task.priority;
  const updatedAt = new Date(now).toISOString();
  let changed = false;

  if (hasTitle && input.title?.trim() && input.title.trim() !== task.title) {
    task.title = input.title.trim();
    recordActivity(task, actor, 'edited', `${actorName} editó la tarea: ${task.title}.`, now);
    changed = true;
  }
  if (hasDescription && (input.description?.trim() ?? '') !== task.description) {
    task.description = input.description?.trim() ?? '';
    recordActivity(
      task,
      actor,
      'edited',
      `${actorName} actualizó la descripción de ${task.title}.`,
      now,
    );
    changed = true;
  }
  if (hasCategory && normalizeCategory(input.category) !== task.category) {
    task.category = normalizeCategory(input.category);
    recordActivity(
      task,
      actor,
      'edited',
      `${actorName} cambió la categoría de ${task.title} a ${task.category}.`,
      now,
    );
    changed = true;
  }
  if (hasEstimate && input.estimatedMinutes !== task.estimatedMinutes) {
    task.estimatedMinutes =
      input.estimatedMinutes === null || input.estimatedMinutes === undefined
        ? null
        : Math.max(0, Math.floor(input.estimatedMinutes));
    changed = true;
  }

  if (hasRequiresApproval && input.requiresApproval !== task.requiresApproval) {
    task.requiresApproval = input.requiresApproval as boolean;
    changed = true;
  }
  if (hasApprover && input.approverId !== task.approverId) {
    if (input.approverId === null || input.approverId === '') {
      task.approverId = null;
    } else {
      const approver = getEmployeeInvitationById(String(input.approverId).trim());
      if (
        !approver ||
        approver.organizationId !== input.organizationId ||
        approver.status !== 'redeemed'
      ) {
        return { status: 'denied', reason: 'invalid_owner', task: null };
      }
      task.approverId = approver.id;
    }
    changed = true;
  }
  if (hasRecurrence && input.recurrence !== undefined) {
    const recurrenceInput = input.recurrence;
    if (recurrenceInput === null) {
      task.recurrence = null;
      changed = true;
    } else if ((RECURRENCE_FREQUENCIES as readonly string[]).includes(recurrenceInput.frequency)) {
      const baseNext = task.recurrence?.nextDueAt ?? task.dueAt ?? new Date(now).toISOString();
      task.recurrence = {
        frequency: recurrenceInput.frequency,
        nextDueAt: advanceDate(baseNext, recurrenceInput.frequency),
      };
      changed = true;
    } else {
      return { status: 'denied', reason: 'invalid_input', task: null };
    }
  }
  if (hasChecklist && input.checklist !== undefined) {
    task.checklist = normalizeChecklist(input.checklist);
    recordActivity(
      task,
      actor,
      'edited',
      `${actorName} actualizó la lista de verificación de ${task.title}.`,
      now,
    );
    changed = true;
  }
  if (hasDependencies) {
    const previous = [...task.dependsOn].sort().join(',');
    const next = [...nextDependencies].sort().join(',');
    if (previous !== next) {
      const added = nextDependencies.filter((id) => !task.dependsOn.includes(id));
      const removed = task.dependsOn.filter((id) => !nextDependencies.includes(id));
      task.dependsOn = nextDependencies;
      if (added.length > 0) {
        recordActivity(
          task,
          actor,
          'dependency_added',
          `${actorName} agregó ${added.length} dependencia(s) a ${task.title}.`,
          now,
        );
      }
      if (removed.length > 0) {
        recordActivity(
          task,
          actor,
          'dependency_removed',
          `${actorName} quitó ${removed.length} dependencia(s) de ${task.title}.`,
          now,
        );
      }
      changed = true;
    }
  }

  if (hasOwner && (nextOwnerId !== task.ownerId || nextOwnerName !== task.ownerName)) {
    task.ownerId = nextOwnerId;
    task.ownerName = nextOwnerName;
    recordActivity(
      task,
      actor,
      'reassigned',
      `${actorName} reasignó la tarea ${task.title} a ${nextOwnerName ?? 'Sin asignar'}.`,
      now,
    );
    changed = true;
  }
  if (hasPriority && input.priority !== task.priority) {
    task.priority = input.priority as TaskPriority;
    recordActivity(
      task,
      actor,
      'priority_changed',
      `${actorName} modificó la prioridad de ${task.title} a ${PRIORITY_LABELS[task.priority]}.`,
      now,
    );
    changed = true;
  }
  if (hasDue && input.dueAt !== task.dueAt) {
    task.dueAt = input.dueAt
      ? Number.isNaN(Date.parse(input.dueAt))
        ? null
        : new Date(Date.parse(input.dueAt)).toISOString()
      : null;
    changed = true;
  }
  if (hasStatus && input.status !== task.status) {
    const next = input.status as TaskStatus;
    task.status = next;
    if (next === 'completed') {
      task.completedAt = updatedAt;
      task.cancelledAt = null;
      recordActivity(
        task,
        actor,
        'completed',
        `${actorName} completó la tarea ${task.title}.`,
        now,
      );
    } else if (next === 'cancelled') {
      task.cancelledAt = updatedAt;
      task.completedAt = null;
      recordActivity(task, actor, 'cancelled', `${actorName} canceló la tarea ${task.title}.`, now);
    } else if (next === 'in_progress') {
      task.completedAt = null;
      task.cancelledAt = null;
      recordActivity(
        task,
        actor,
        previousStatus === 'in_review' ? 'reopened' : 'started',
        previousStatus === 'in_review'
          ? `${actorName} devolvió la tarea ${task.title} para su corrección.`
          : `${actorName} inició la tarea ${task.title}.`,
        now,
      );
    } else if (next === 'in_review') {
      task.completedAt = null;
      task.cancelledAt = null;
      recordActivity(
        task,
        actor,
        'status_changed',
        `${actorName} envió la tarea ${task.title} a revisión.`,
        now,
      );
    } else {
      task.completedAt = null;
      task.cancelledAt = null;
      recordActivity(
        task,
        actor,
        previousStatus === 'completed' || previousStatus === 'cancelled'
          ? 'reopened'
          : 'status_changed',
        `${actorName} devolvió la tarea ${task.title} a ${STATUS_LABELS[next]}.`,
        now,
      );
    }
    changed = true;
  }
  if (!changed) {
    return { status: 'denied', reason: 'invalid_input', task: null };
  }
  task.updatedAt = updatedAt;
  void previousStatus;
  void previousOwnerName;
  void previousPriority;
  return { status: 'updated', reason: null, task };
}

export interface OverviewSummary {
  assigned: number;
  completed: number;
  pending: number;
  cancelled: number;
  completionPercentage: string;
}

export function isTaskOverdue(task: TaskRecord, now: number = Date.now()): boolean {
  return (
    (task.status === 'pending' || task.status === 'in_progress' || task.status === 'in_review') &&
    task.dueAt !== null &&
    Date.parse(task.dueAt) < now
  );
}

export type EmployeeDeletionTaskMode = 'reassign' | 'unassign' | 'cancel';

export function handleEmployeeDeletionTasks(
  organizationId: string,
  employeeId: string,
  mode: EmployeeDeletionTaskMode,
  toEmployeeId: string | null,
  now: number = Date.now(),
  actor?: SessionActor | null,
): { status: 'updated' | 'denied'; affected: TaskRecord[] } {
  const active = [...TASKS.values()].filter(
    (task) =>
      task.organizationId === organizationId &&
      task.ownerId === employeeId &&
      (task.status === 'pending' || task.status === 'in_progress' || task.status === 'in_review'),
  );
  if (active.length === 0) {
    return { status: 'updated', affected: [] };
  }
  let toName: string | null = null;
  if (mode === 'reassign') {
    if (!toEmployeeId) {
      return { status: 'denied', affected: [] };
    }
    const replacement = getEmployeeInvitationById(toEmployeeId);
    if (
      !replacement ||
      replacement.organizationId !== organizationId ||
      replacement.status !== 'redeemed' ||
      replacement.id === employeeId
    ) {
      return { status: 'denied', affected: [] };
    }
    toName = `${replacement.firstName} ${replacement.lastName}`;
  }
  const actorName = resolveActorName(actor);
  const updatedAt = new Date(now).toISOString();
  for (const task of active) {
    if (mode === 'reassign') {
      task.ownerId = toEmployeeId;
      task.ownerName = toName;
      recordActivity(
        task,
        actor,
        'reassigned',
        `${actorName} reasignó la tarea ${task.title} a ${toName} al eliminar un empleado.`,
        now,
      );
    } else if (mode === 'unassign') {
      task.ownerId = null;
      task.ownerName = null;
      recordActivity(
        task,
        actor,
        'reassigned',
        `${actorName} dejó sin asignar la tarea ${task.title} al eliminar un empleado.`,
        now,
      );
    } else {
      task.status = 'cancelled';
      task.cancelledAt = updatedAt;
      task.completedAt = null;
      recordActivity(
        task,
        actor,
        'cancelled',
        `${actorName} canceló la tarea ${task.title} al eliminar un empleado.`,
        now,
      );
    }
    task.updatedAt = updatedAt;
  }
  return { status: 'updated', affected: active };
}

export function buildOverviewSummary(
  tasks: TaskRecord[],
  range: OverviewRange = 'all',
  now: number = Date.now(),
): OverviewSummary {
  const cutoff = rangeCutoff(range, now);
  const filtered =
    cutoff === null ? tasks : tasks.filter((task) => Date.parse(task.createdAt) >= cutoff);
  const completed = filtered.filter((task) => task.status === 'completed').length;
  const pending = filtered.filter((task) => task.status === 'pending').length;
  const cancelled = filtered.filter((task) => task.status === 'cancelled').length;
  const total = filtered.length;
  const pct = total === 0 ? 0 : (completed / total) * 100;
  return {
    assigned: total,
    completed,
    pending,
    cancelled,
    completionPercentage: `${pct.toFixed(1).replace('.', ',')}%`,
  };
}

export interface CompletedPerDayBucket {
  date: string;
  label: string;
  created: number;
  completed: number;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatDayLabel(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(day)}/${Number(month)}`;
}

export interface TaskBottleneck {
  dependencyTaskId: string;
  dependencyTitle: string;
  ownerName: string | null;
  blockedTaskIds: string[];
  blockedCount: number;
}

export function findTaskBottlenecks(organizationId: string): TaskBottleneck[] {
  const tasks = listTasks(organizationId);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const blockedBy = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') {
      continue;
    }
    for (const dependencyId of task.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency || dependency.status === 'completed') {
        continue;
      }
      const list = blockedBy.get(dependencyId) ?? [];
      list.push(task.id);
      blockedBy.set(dependencyId, list);
    }
  }
  return [...blockedBy.entries()]
    .map(([dependencyTaskId, blockedTaskIds]) => {
      const dependency = byId.get(dependencyTaskId);
      return {
        dependencyTaskId,
        dependencyTitle: dependency?.title ?? dependencyTaskId,
        ownerName: dependency?.ownerName ?? null,
        blockedTaskIds,
        blockedCount: blockedTaskIds.length,
      };
    })
    .filter((item) => item.blockedCount > 0)
    .sort(
      (a, b) =>
        b.blockedCount - a.blockedCount || a.dependencyTitle.localeCompare(b.dependencyTitle),
    );
}

export function buildCompletedPerDay(
  tasks: TaskRecord[],
  range: OverviewRange = 'all',
  now: number = Date.now(),
): CompletedPerDayBucket[] {
  const cutoff = rangeCutoff(range, now);
  const scoped =
    cutoff === null
      ? tasks
      : tasks.filter(
          (task) =>
            Date.parse(task.createdAt) >= cutoff ||
            (task.completedAt !== null && Date.parse(task.completedAt) >= cutoff),
        );
  if (scoped.length === 0) {
    return [];
  }
  const allDates = scoped
    .flatMap((task) => [
      dayKey(task.createdAt),
      ...(task.completedAt ? [dayKey(task.completedAt)] : []),
    ])
    .sort();
  const start = cutoff === null ? allDates[0] : dayKey(new Date(cutoff).toISOString());
  const end = dayKey(new Date(now).toISOString());
  const buckets = new Map<string, CompletedPerDayBucket>();
  const createdByDay = new Map<string, number>();
  const completedByDay = new Map<string, number>();
  for (const task of scoped) {
    createdByDay.set(dayKey(task.createdAt), (createdByDay.get(dayKey(task.createdAt)) ?? 0) + 1);
    if (task.completedAt) {
      completedByDay.set(
        dayKey(task.completedAt),
        (completedByDay.get(dayKey(task.completedAt)) ?? 0) + 1,
      );
    }
  }
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: formatDayLabel(key),
      created: createdByDay.get(key) ?? 0,
      completed: completedByDay.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return [...buckets.values()];
}

function shiftDueToFrequency(iso: string, frequency: TaskRecurrenceFrequency): string {
  return advanceDate(iso, frequency);
}

export function materializeRecurringTasks(
  organizationId: string,
  now: number = Date.now(),
  actor?: SessionActor | null,
): { status: 'ok'; generated: TaskRecord[] } {
  const templates = listTasks(organizationId).filter(
    (task) =>
      task.recurrence !== null &&
      task.recurrence.nextDueAt !== null &&
      Date.parse(task.recurrence.nextDueAt) <= now &&
      task.status !== 'cancelled',
  );
  const generated: TaskRecord[] = [];
  for (const template of templates) {
    let cursor = template.recurrence!.nextDueAt as string;
    let safety = 0;
    while (Date.parse(cursor) <= now && safety < 52) {
      const created = createTask(
        {
          organizationId,
          title: template.title,
          description: template.description,
          category: template.category,
          estimatedMinutes: template.estimatedMinutes ?? undefined,
          priority: template.priority,
          ownerId: template.ownerId ?? undefined,
          dependsOn: template.dependsOn.length > 0 ? [...template.dependsOn] : undefined,
          dueAt: cursor,
          requiresApproval: template.requiresApproval,
          approverId: template.approverId,
        },
        now,
        actor,
      );
      if (created.status === 'created' && created.task) {
        generated.push(created.task);
      }
      cursor = shiftDueToFrequency(cursor, template.recurrence!.frequency);
      safety += 1;
    }
    template.recurrence = { frequency: template.recurrence!.frequency, nextDueAt: cursor };
    template.updatedAt = new Date(now).toISOString();
  }
  return { status: 'ok', generated };
}
