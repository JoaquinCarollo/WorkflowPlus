import {
  listJoinedEmployees,
  type EmployeeInvitationEmployee,
  type SessionActor,
} from '../auth/employee-invitation.js';
import { isTaskOverdue, listTasks, type TaskRecord } from '../tasks/tasks.js';

export type AssistantAgentVersion = 'assistant-orchestrator-v1';
export type AssistantFindingSeverity = 'info' | 'warning' | 'critical';
export type AssistantIntent =
  'task_analysis' | 'employee_analysis' | 'department_analysis' | 'productivity_analysis';

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
  intent: AssistantIntent;
  findings: AssistantFinding[];
  metrics: Record<string, number>;
}

export interface AssistantAnswer {
  status: 'answered' | 'insufficient';
  answer: string;
  findings: AssistantFinding[];
  agentVersion: AssistantAgentVersion;
  sources: AssistantFindingSource[];
}

export interface AssistantQueryInput {
  organizationId: string;
  query: string;
  now?: number;
}

export function canUseAssistant(actor: SessionActor | null): boolean {
  return actor?.kind === 'organization';
}

const SEVERITY_LABELS: Record<AssistantFindingSeverity, string> = {
  info: 'Informaci\u00f3n',
  warning: 'Advertencia',
  critical: 'Cr\u00edtica',
};

function taskTitles(tasks: TaskRecord[]): string[] {
  return tasks.map((task) => task.title);
}

function activeAssignedTasks(tasks: TaskRecord[], employeeId: string): TaskRecord[] {
  return tasks.filter(
    (task) =>
      task.ownerId === employeeId &&
      (task.status === 'pending' || task.status === 'in_progress' || task.status === 'in_review'),
  );
}

function assignedTaskMinutes(tasks: TaskRecord[], employeeId: string): number {
  return activeAssignedTasks(tasks, employeeId).reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? 0),
    0,
  );
}

export function analyzeTaskWorkload(
  organizationId: string,
  now: number = Date.now(),
): AssistantFindingSource {
  const tasks = listTasks(organizationId);
  const pending = tasks.filter((task) => task.status === 'pending');
  const overdue = tasks.filter((task) => isTaskOverdue(task, now));
  const findings: AssistantFinding[] = [];
  if (overdue.length > 0) {
    findings.push({
      title: 'Tareas atrasadas',
      summary: `Se detectaron ${overdue.length} tarea(s) atrasada(s) sin completar: ${taskTitles(overdue).join(', ')}.`,
      severity: 'critical',
      taskIds: overdue.map((task) => task.id),
      employeeIds: [],
    });
  }
  findings.push({
    title: 'Backlog pendiente',
    summary: `La organizaci\u00f3n tiene ${pending.length} tarea(s) pendiente(s) activa(s) registrada(s).`,
    severity: 'info',
    taskIds: pending.map((task) => task.id),
    employeeIds: [],
  });
  return {
    agentVersion: 'task-analysis-v1',
    intent: 'task_analysis',
    findings,
    metrics: { activeTasks: pending.length, overdueTasks: overdue.length },
  };
}

function classifyEmployeeUtilization(percent: number): 'overloaded' | 'balanced' | 'available' {
  if (percent > 100) {
    return 'overloaded';
  }
  if (percent > 60) {
    return 'balanced';
  }
  return 'available';
}

export function analyzeEmployeeWorkload(organizationId: string): AssistantFindingSource {
  const employees = listJoinedEmployees(organizationId);
  const tasks = listTasks(organizationId);
  const findings: AssistantFinding[] = [];
  const metrics: Record<string, number> = {
    employees: employees.length,
    overloaded: 0,
    balanced: 0,
    available: 0,
  };
  for (const employee of employees) {
    const assignedTasks = activeAssignedTasks(tasks, employee.id);
    const assignedMinutes = assignedTaskMinutes(tasks, employee.id);
    const capacityMinutes = Math.max(0, employee.weeklyCapacityHours ?? 40) * 60;
    const percent = capacityMinutes > 0 ? (assignedMinutes / capacityMinutes) * 100 : 0;
    const classification = classifyEmployeeUtilization(percent);
    metrics[classification] = (metrics[classification] ?? 0) + 1;
    if (classification === 'overloaded') {
      findings.push({
        title: `Sobrecarga laboral: ${employee.firstName} ${employee.lastName}`,
        summary: `El empleado ${employee.firstName} ${employee.lastName} tiene una utilizaci\u00f3n del ${Math.round(percent)}% de su capacidad semanal con ${
          Math.round((assignedMinutes / 60) * 10) / 10
        } h asignadas (${taskTitles(assignedTasks).join(', ') || 'sin tareas activas'}).`,
        severity: 'critical',
        taskIds: assignedTasks.map((task) => task.id),
        employeeIds: [employee.id],
      });
    }
  }
  return {
    agentVersion: 'employee-analysis-v1',
    intent: 'employee_analysis',
    findings,
    metrics,
  };
}

export function analyzeDepartmentWorkload(organizationId: string): AssistantFindingSource {
  const employees = listJoinedEmployees(organizationId);
  const tasks = listTasks(organizationId);
  const departments = new Map<string, EmployeeInvitationEmployee[]>();
  for (const employee of employees) {
    const department = employee.department?.trim() || 'General';
    const current = departments.get(department) ?? [];
    current.push(employee);
    departments.set(department, current);
  }
  const findings: AssistantFinding[] = [];
  for (const [department, members] of departments) {
    const assignedTasks = tasks.filter(
      (task) => task.ownerId !== null && members.some((member) => member.id === task.ownerId),
    );
    const assignedMinutes = assignedTasks.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0,
    );
    const capacityMinutes = members.reduce(
      (sum, member) => sum + Math.max(0, member.weeklyCapacityHours ?? 40) * 60,
      0,
    );
    const percent = capacityMinutes > 0 ? (assignedMinutes / capacityMinutes) * 100 : 0;
    if (percent > 100) {
      findings.push({
        title: `Sobrecarga departamental: ${department}`,
        summary: `El departamento ${department} alcanza un ${Math.round(percent)}% de utilizaci\u00f3n de su capacidad combinada con ${
          Math.round((assignedMinutes / 60) * 10) / 10
        } h asignadas.`,
        severity: 'critical',
        taskIds: assignedTasks.map((task) => task.id),
        employeeIds: members.map((member) => member.id),
        department,
      });
    }
  }
  return {
    agentVersion: 'department-analysis-v1',
    intent: 'department_analysis',
    findings,
    metrics: { departments: departments.size, overloadedDepartments: findings.length },
  };
}

export function analyzeProductivity(organizationId: string): AssistantFindingSource {
  const tasks = listTasks(organizationId);
  const created = tasks.length;
  const completed = tasks.filter((task) => task.status === 'completed');
  const overdue = tasks.filter((task) => isTaskOverdue(task, Date.now()));
  const completionRate = created === 0 ? 0 : (completed.length / created) * 100;
  const findings: AssistantFinding[] = [];
  if (completionRate < 60) {
    findings.push({
      title: 'Baja productividad',
      summary: `La organizaci\u00f3n complet\u00f3 el ${Math.round(completionRate)}% de sus tareas registradas (${completed.length} de ${created}).`,
      severity: 'warning',
      taskIds: [],
      employeeIds: [],
    });
  }
  if (overdue.length > 0) {
    findings.push({
      title: 'Rendimiento con retrasos',
      summary: `El ${Math.round(completionRate)}% de finalizaci\u00f3n se ve afectado por ${overdue.length} tarea(s) atrasada(s): ${taskTitles(overdue).join(', ')}.`,
      severity: 'critical',
      taskIds: overdue.map((task) => task.id),
      employeeIds: [],
    });
  }
  return {
    agentVersion: 'productivity-analysis-v1',
    intent: 'productivity_analysis',
    findings,
    metrics: {
      createdTasks: created,
      completedTasks: completed.length,
      completionRate: Math.round(completionRate * 10) / 10,
      overdueTasks: overdue.length,
    },
  };
}

const TASK_PATTERN = /(tarea|task|pendiente|backlog|avanz|prioridad|urgencia)/i;
const EMPLOYEE_PATTERN = /(empleado|employee|persona|asignad|capacidad|quien|qui\u00e9n|who)/i;
const DEPARTMENT_PATTERN = /(departamento|department|area|equipo|division)/i;
const PRODUCTIVITY_PATTERN =
  /(productividad|productivity|eficiencia|eficacia|rendimiento|promedio|completion|eficenc)/i;
const OVERLOAD_PATTERN =
  /(sobrecarga|overload|overloaded|carga|workload|agotad|exhaustad|demasiad)/i;

export function detectAssistantIntents(query: string): AssistantIntent[] {
  const normalized = query.toLowerCase();
  const intents = new Set<AssistantIntent>();
  if (OVERLOAD_PATTERN.test(normalized)) {
    intents.add('employee_analysis');
    intents.add('task_analysis');
    intents.add('department_analysis');
  }
  if (TASK_PATTERN.test(normalized)) {
    intents.add('task_analysis');
  }
  if (EMPLOYEE_PATTERN.test(normalized)) {
    intents.add('employee_analysis');
  }
  if (DEPARTMENT_PATTERN.test(normalized)) {
    intents.add('department_analysis');
  }
  if (PRODUCTIVITY_PATTERN.test(normalized)) {
    intents.add('productivity_analysis');
  }
  if (intents.size === 0) {
    intents.add('task_analysis');
    intents.add('employee_analysis');
    intents.add('department_analysis');
    intents.add('productivity_analysis');
  }
  return [...intents];
}

export function runAssistantQuery(input: AssistantQueryInput): AssistantAnswer {
  const now = input.now ?? Date.now();
  const intents = detectAssistantIntents(input.query);
  const sources = intents.map((intent) => {
    if (intent === 'task_analysis') {
      return analyzeTaskWorkload(input.organizationId, now);
    }
    if (intent === 'employee_analysis') {
      return analyzeEmployeeWorkload(input.organizationId);
    }
    if (intent === 'department_analysis') {
      return analyzeDepartmentWorkload(input.organizationId);
    }
    return analyzeProductivity(input.organizationId);
  });
  const tasks = listTasks(input.organizationId);
  const employees = listJoinedEmployees(input.organizationId);
  const hasData = tasks.length > 0 || employees.length > 0;
  const findings = sources.flatMap((source) => source.findings);
  const status = hasData ? 'answered' : 'insufficient';
  const answer = hasData
    ? findings
        .map(
          (finding) => `${SEVERITY_LABELS[finding.severity]}: ${finding.title}. ${finding.summary}`,
        )
        .join(' ')
    : `No tengo informaci\u00f3n suficiente sobre esa consulta porque todav\u00eda no hay tareas ni empleados registrados para la organizaci\u00f3n.`;
  return {
    status,
    answer,
    findings,
    agentVersion: 'assistant-orchestrator-v1',
    sources,
  };
}
