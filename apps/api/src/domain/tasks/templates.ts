import { randomUUID } from 'node:crypto';
import { createTask, type TaskPriority, type TaskRecord } from './tasks.js';

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
  priority: TaskPriority;
  items: TaskTemplateItem[];
  createdAt: string;
}

export interface TaskTemplateInput {
  organizationId: string;
  name: string;
  category?: string;
  priority?: TaskPriority;
  items: TaskTemplateItem[];
}

const TEMPLATES = new Map<string, TaskTemplate>();

export function clearTaskTemplatesForTest(): void {
  TEMPLATES.clear();
}

export function listTaskTemplates(organizationId: string): TaskTemplate[] {
  return [...TEMPLATES.values()]
    .filter((template) => template.organizationId === organizationId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function createTaskTemplate(
  input: TaskTemplateInput,
  now: number = Date.now(),
): { status: 'created' | 'denied'; template: TaskTemplate | null } {
  const name = input.name.trim();
  const items = (input.items ?? [])
    .map((item) => ({
      title: item.title.trim(),
      description: item.description?.trim() ?? '',
      estimatedMinutes:
        item.estimatedMinutes === null || item.estimatedMinutes === undefined
          ? null
          : Math.max(0, Math.floor(item.estimatedMinutes)),
    }))
    .filter((item) => item.title.length > 0);
  if (!name || items.length === 0) {
    return { status: 'denied', template: null };
  }
  const template: TaskTemplate = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name,
    category: (input.category ?? '').trim() || 'Otros',
    priority: input.priority ?? 'medium',
    items,
    createdAt: new Date(now).toISOString(),
  };
  TEMPLATES.set(template.id, template);
  return { status: 'created', template };
}

export interface ApplyTaskTemplateResult {
  status: 'applied' | 'denied';
  reason: 'not_found' | 'invalid_input' | null;
  tasks: TaskRecord[];
}

export function applyTaskTemplate(
  templateId: string,
  organizationId: string,
  ownerId?: string | null,
  dueAt?: string | null,
  now: number = Date.now(),
  actor?: import('../auth/employee-invitation.js').SessionActor | null,
): ApplyTaskTemplateResult {
  const template = TEMPLATES.get(templateId);
  if (!template || template.organizationId !== organizationId) {
    return { status: 'denied', reason: 'not_found', tasks: [] };
  }
  const created: TaskRecord[] = [];
  for (const item of template.items) {
    const result = createTask(
      {
        organizationId,
        title: item.title,
        description: item.description,
        category: template.category,
        estimatedMinutes: item.estimatedMinutes ?? null,
        priority: template.priority,
        ownerId: ownerId ?? undefined,
        dueAt: dueAt ?? null,
      },
      now,
      actor,
    );
    if (result.status === 'created' && result.task) {
      created.push(result.task);
    }
  }
  return { status: 'applied', reason: null, tasks: created };
}
