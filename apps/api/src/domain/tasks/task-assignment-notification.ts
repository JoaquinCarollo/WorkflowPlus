import {
  buildEmployeeLoginUrl,
  createConfiguredTransactionalEmailMailer,
  getEmployeeInvitationById,
  type TransactionalEmailMailer,
} from '../auth/employee-invitation.js';
import type { TaskRecord } from './tasks.js';

export interface TaskAssignmentNotificationDeps {
  mailer?: TransactionalEmailMailer;
}

export interface TaskAssignmentEmailMessage {
  to: string;
  firstName: string;
  taskTitle: string;
  taskDescription: string;
  dueAt: string | null;
}

function formatDueDate(iso: string | null): string {
  if (!iso) {
    return 'sin fecha definida';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'sin fecha definida';
  }
  return parsed.toLocaleString('es-ES');
}

export function buildTaskAssignmentEmailText(message: TaskAssignmentEmailMessage): string {
  const description = message.taskDescription.trim() || 'Sin descripción';
  return `Hola ${message.firstName}, se te asignó la tarea "${message.taskTitle}" en WorkFlowPlus. Descripción: ${description}. Fecha de entrega: ${formatDueDate(message.dueAt)}. Ingresá con tu código de empleado desde ${buildEmployeeLoginUrl()} para verla y actualizar su estado.`;
}

export async function notifyTaskAssignment(
  task: TaskRecord,
  deps: TaskAssignmentNotificationDeps = {},
): Promise<boolean> {
  if (!task.ownerId) {
    return false;
  }
  const employee = getEmployeeInvitationById(task.ownerId);
  if (
    !employee ||
    employee.organizationId !== task.organizationId ||
    employee.status !== 'redeemed'
  ) {
    return false;
  }
  const mailer = deps.mailer ?? createConfiguredTransactionalEmailMailer();
  const delivery = await mailer.sendEmail({
    to: employee.email,
    subject: 'Se te asignó una tarea en WorkFlowPlus',
    text: buildTaskAssignmentEmailText({
      to: employee.email,
      firstName: employee.firstName,
      taskTitle: task.title,
      taskDescription: task.description,
      dueAt: task.dueAt,
    }),
  });
  return delivery.emailSent;
}

export async function notifyTaskAssignments(
  tasks: TaskRecord[],
  deps: TaskAssignmentNotificationDeps = {},
): Promise<boolean | null> {
  const assignedTasks = tasks.filter((task) => task.ownerId);
  if (assignedTasks.length === 0) {
    return null;
  }
  const results = await Promise.all(
    assignedTasks.map((task) => notifyTaskAssignment(task, deps).catch(() => false)),
  );
  return results.every((sent) => sent);
}
