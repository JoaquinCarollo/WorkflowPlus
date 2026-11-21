import type {
  AuthorityLevel,
  DepartmentLead,
  EmployeeProfile,
  OverviewRange,
  SessionActor,
  Task,
  TaskStatus,
} from './api.js';

const DAY_MS = 86400000;

export type Role = 'organization' | 'administrative' | 'operative';

export interface TaskAlert {
  id: string;
  title: string;
  detail: string;
  tone: string;
  actionLabel: string;
  target: string;
  taskIds: string[];
}

export interface WorkloadEntry {
  employee: EmployeeProfile;
  assignedHours: number;
  activeCount: number;
  percent: number;
}

export interface PeriodComparison {
  created: { current: number; previous: number };
  completed: { current: number; previous: number };
  overdue: { current: number; previous: number };
  avgCompletionHours: { current: number | null; previous: number | null };
}

export interface Forecast {
  dueCount: number;
  demandHours: number;
  capacityHours: number;
  utilizationPercent: number;
  level: string;
  tasks: Task[];
}

export interface OrgChartGroup {
  department: string;
  jefe: EmployeeProfile | null;
  members: EmployeeProfile[];
}

export interface EmployeeFilters {
  query: string;
  department: string;
  authority: 'all' | AuthorityLevel;
  sort: 'name' | 'pending';
}

export interface TaskFilters {
  status: TaskStatus | 'all';
  query: string;
  ownerId: string;
  priority: string;
  category: string;
  due: 'all' | 'overdue';
  state: string;
}

export function buildOverviewStats(tasks: Task[]): Array<[string, string, string]> {
  const assigned = tasks.length;
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const pending = tasks.filter((task) => task.status === 'pending').length;
  const cancelled = tasks.filter((task) => task.status === 'cancelled').length;
  const empty = '\u2014';
  if (tasks.length === 0) {
    return [
      [empty, 'Tareas asignadas', 'Sin datos'],
      [empty, 'Completadas', 'Sin datos'],
      [empty, 'Pendientes', 'Sin datos'],
      [empty, 'Canceladas', 'Sin datos'],
    ];
  }
  return [
    [String(assigned), 'Tareas asignadas', 'Todo el per\u00EDodo'],
    [String(completed), 'Completadas', 'Todo el per\u00EDodo'],
    [String(pending), 'Pendientes', 'Requieren atenci\u00F3n'],
    [String(cancelled), 'Canceladas', 'Todo el per\u00EDodo'],
  ];
}

export function completionPercentage(tasks: Task[]): string {
  if (tasks.length === 0) {
    return '0,0%';
  }
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const percent = (completed / tasks.length) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded.toFixed(1).replace('.', ',')}%`;
}

export function filterTasksByRange(tasks: Task[], range: OverviewRange, now: number): Task[] {
  if (range === 'all') {
    return [...tasks];
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 0;
  const start = now - days * DAY_MS;
  return tasks.filter((task) => Date.parse(task.createdAt) >= start);
}

export interface CompletedBucket {
  date: string;
  label: string;
  created: number;
  completed: number;
}

export function buildCompletedPerDay(
  tasks: Task[],
  range: OverviewRange,
  now: number,
): CompletedBucket[] {
  const days =
    range === 'all' ? 0 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 0;
  const start = range === 'all' ? 0 : now - days * DAY_MS;
  const buckets = new Map<string, CompletedBucket>();
  const ensure = (key: string): CompletedBucket => {
    const existing = buckets.get(key);
    if (existing) {
      return existing;
    }
    const parts = key.split('-').map((part) => Number(part));
    const bucket: CompletedBucket = {
      date: key,
      label: `${parts[2]}/${parts[1]}`,
      created: 0,
      completed: 0,
    };
    buckets.set(key, bucket);
    return bucket;
  };
  for (const task of tasks) {
    const createdAtMs = Date.parse(task.createdAt);
    if (createdAtMs < start || createdAtMs > now) {
      continue;
    }
    const createdBucket = ensure(task.createdAt.slice(0, 10));
    createdBucket.created += 1;
    if (task.completedAt) {
      const completedAtMs = Date.parse(task.completedAt);
      if (completedAtMs <= now) {
        const completedBucket = ensure(task.completedAt.slice(0, 10));
        completedBucket.completed += 1;
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildAttentionAlerts(tasks: Task[]): TaskAlert[] {
  const alerts: TaskAlert[] = [];
  const unassigned = tasks.filter((task) => task.ownerId === null);
  const urgent = tasks.filter((task) => task.priority === 'urgent');
  const cancelled = tasks.filter((task) => task.status === 'cancelled');
  if (unassigned.length > 0) {
    alerts.push({
      id: 'unassigned',
      title: 'Tareas sin asignar',
      detail: 'Hay tareas sin responsable asignado.',
      tone: 'warning',
      actionLabel: 'Revisar',
      target: 'tasks',
      taskIds: unassigned.map((task) => task.id),
    });
  }
  if (urgent.length > 0) {
    alerts.push({
      id: 'urgent',
      title: 'Tareas urgentes',
      detail: 'Hay tareas criticas con prioridad urgente.',
      tone: 'critical',
      actionLabel: 'Revisar',
      target: 'tasks',
      taskIds: urgent.map((task) => task.id),
    });
  }
  if (cancelled.length > 0) {
    alerts.push({
      id: 'cancelled',
      title: 'Tareas canceladas',
      detail: 'Hay tareas canceladas en el periodo.',
      tone: 'info',
      actionLabel: 'Revisar',
      target: 'tasks',
      taskIds: cancelled.map((task) => task.id),
    });
  }
  return alerts;
}

export function canInviteEmployeesForSession(actor: SessionActor | null): boolean {
  return actor?.kind === 'organization';
}

export function canCreateTasksForSession(actor: SessionActor | null): boolean {
  if (actor?.kind === 'organization') {
    return true;
  }
  if (actor?.kind === 'employee') {
    return actor.authorityLevel === 'administrative';
  }
  return false;
}

export function filterAndSortEmployees(
  employees: EmployeeProfile[],
  tasks: Task[],
  filters: EmployeeFilters,
): EmployeeProfile[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = employees.filter((employee) => {
    if (filters.department && employee.department !== filters.department) {
      return false;
    }
    if (filters.authority !== 'all' && employee.authorityLevel !== filters.authority) {
      return false;
    }
    if (query) {
      const haystack = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
  const sorted = [...filtered];
  if (filters.sort === 'pending') {
    sorted.sort((a, b) => pendingTaskCount(tasks, b.id) - pendingTaskCount(tasks, a.id));
  } else {
    sorted.sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    );
  }
  return sorted;
}

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const query = filters.query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.status !== 'all' && task.status !== filters.status) {
      return false;
    }
    if (query) {
      const haystack = `${task.title} ${task.description}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    const ownerKey = task.ownerId ?? '__unassigned__';
    if (filters.ownerId && filters.ownerId !== '__unassigned__' && ownerKey !== filters.ownerId) {
      return false;
    }
    if (filters.ownerId === '__unassigned__' && task.ownerId !== null) {
      return false;
    }
    if (filters.priority && task.priority !== filters.priority) {
      return false;
    }
    if (filters.category && task.category !== filters.category) {
      return false;
    }
    if (filters.due === 'overdue' && !isTaskOverdue(task, Date.now())) {
      return false;
    }
    return true;
  });
}

export function isTaskOverdue(task: Task, now: number): boolean {
  if (task.status !== 'pending' && task.status !== 'in_progress' && task.status !== 'in_review') {
    return false;
  }
  if (!task.dueAt) {
    return false;
  }
  return Date.parse(task.dueAt) < now;
}

export function pendingTaskCount(tasks: Task[], employeeId: string): number {
  return tasks.filter((task) => task.ownerId === employeeId && task.status === 'pending').length;
}

export function workloadLevel(pendingCount: number): {
  tone: 'low' | 'medium' | 'high';
  label: string;
} {
  if (pendingCount <= 0) {
    return { tone: 'low', label: 'Baja' };
  }
  if (pendingCount <= 3) {
    return { tone: 'medium', label: 'Media' };
  }
  return { tone: 'high', label: 'Alta' };
}

export function buildPeriodComparison(
  tasks: Task[],
  range: OverviewRange,
  now: number,
): PeriodComparison | null {
  if (range === 'all') {
    return null;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 0;
  const currentStart = now - days * DAY_MS;
  const previousStart = now - days * 2 * DAY_MS;
  const createdCurrent = tasks.filter((task) => {
    const createdAtMs = Date.parse(task.createdAt);
    return createdAtMs >= currentStart && createdAtMs <= now;
  });
  const createdPrevious = tasks.filter((task) => {
    const createdAtMs = Date.parse(task.createdAt);
    return createdAtMs >= previousStart && createdAtMs < currentStart;
  });
  const completedCurrent = createdCurrent.filter((task) => task.status === 'completed');
  const completedPrevious = createdPrevious.filter((task) => task.status === 'completed');
  const avgCompletionHours = (completed: Task[]): number | null => {
    if (completed.length === 0) {
      return null;
    }
    const total = completed.reduce((sum, task) => {
      const completedAtMs = task.completedAt
        ? Date.parse(task.completedAt)
        : Date.parse(task.createdAt);
      return sum + (completedAtMs - Date.parse(task.createdAt)) / 3600000;
    }, 0);
    return Math.round((total / completed.length) * 10) / 10;
  };
  return {
    created: { current: createdCurrent.length, previous: createdPrevious.length },
    completed: { current: completedCurrent.length, previous: completedPrevious.length },
    overdue: {
      current: createdCurrent.filter((task) => isTaskOverdue(task, now)).length,
      previous: createdPrevious.filter((task) => isTaskOverdue(task, now)).length,
    },
    avgCompletionHours: {
      current: avgCompletionHours(completedCurrent),
      previous: avgCompletionHours(completedPrevious),
    },
  };
}

export function buildWorkloadDistribution(
  employees: EmployeeProfile[],
  tasks: Task[],
): WorkloadEntry[] {
  const entries: WorkloadEntry[] = employees.map((employee) => {
    const assignedTasks = tasks.filter(
      (task) =>
        task.ownerId === employee.id &&
        (task.status === 'pending' || task.status === 'in_progress'),
    );
    const assignedMinutes = assignedTasks.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0,
    );
    const assignedHours = Math.round((assignedMinutes / 60) * 10) / 10;
    return {
      employee,
      assignedHours,
      activeCount: assignedTasks.length,
      percent: 0,
    };
  });
  const maxHours = entries.reduce((max, entry) => Math.max(max, entry.assignedHours), 0);
  const distribution = entries.map((entry) => ({
    ...entry,
    percent: maxHours > 0 ? Math.round((entry.assignedHours / maxHours) * 100) : 0,
  }));
  return distribution.sort((a, b) => b.assignedHours - a.assignedHours);
}

export function buildNextWeekForecast(
  tasks: Task[],
  employees: EmployeeProfile[],
  now: number,
): Forecast {
  const upcoming = tasks.filter((task) => {
    if (task.status === 'completed' || task.status === 'cancelled') {
      return false;
    }
    if (!task.dueAt) {
      return false;
    }
    const dueAtMs = Date.parse(task.dueAt);
    return dueAtMs >= now && dueAtMs <= now + 7 * DAY_MS;
  });
  const demandMinutes = upcoming.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
  const demandHours = Math.round((demandMinutes / 60) * 10) / 10;
  const capacityHours = employees
    .filter((employee) => employee.availabilityStatus === 'available')
    .reduce((sum, employee) => sum + (employee.weeklyCapacityHours ?? 40), 0);
  const utilizationPercent =
    capacityHours > 0 ? Math.round((demandHours / capacityHours) * 1000) / 10 : 0;
  const level = utilizationPercent < 60 ? 'low' : utilizationPercent < 90 ? 'medium' : 'high';
  return {
    dueCount: upcoming.length,
    demandHours,
    capacityHours,
    utilizationPercent,
    level,
    tasks: upcoming,
  };
}

export function buildOrgChart(
  employees: EmployeeProfile[],
  departmentLeads: DepartmentLead[] = [],
): OrgChartGroup[] {
  const unique = new Map<string, EmployeeProfile>();
  for (const employee of employees) {
    unique.set(employee.id, employee);
  }
  const groups = new Map<string, EmployeeProfile[]>();
  for (const employee of unique.values()) {
    const department = employee.department || 'General';
    const members = groups.get(department) ?? [];
    members.push(employee);
    groups.set(department, members);
  }
  return Array.from(groups.entries()).map(([department, members]) => {
    const sorted = [...members].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    );
    const lead = departmentLeads.find((l) => l.department === department);
    const jefe = lead ? (sorted.find((employee) => employee.id === lead.employeeId) ?? null) : null;
    return {
      department,
      jefe,
      members: sorted.filter((employee) => employee.id !== jefe?.id),
    };
  });
}

export function scopeEmployeesForSession(
  employees: EmployeeProfile[],
  session: SessionActor | null,
  departmentLeads: DepartmentLead[] = [],
): EmployeeProfile[] {
  if (session?.kind !== 'employee') {
    return [...employees];
  }
  const employee = employees.find((candidate) => candidate.id === session.employeeId);
  if (!employee) {
    return [];
  }
  if (employee.authorityLevel === 'operative') {
    return [employee];
  }
  const lead = departmentLeads.find((l) => l.employeeId === employee.id);
  if (lead) {
    return employees.filter(
      (candidate) =>
        candidate.department === lead.department && candidate.authorityLevel === 'operative',
    );
  }
  return employees.filter((candidate) => candidate.department === employee.department);
}

export function roleFromSession(session: SessionActor | null): Role {
  if (session?.kind === 'employee') {
    return session.authorityLevel;
  }
  return 'organization';
}

const CSV_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const CSV_PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = Array.from(raw)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : char;
    })
    .join('');
  const safe = /^[=+\-@]/.test(cleaned.trimStart()) ? `'${cleaned}` : cleaned;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildTasksCsv(tasks: Task[]): string {
  const header = [
    'Título',
    'Descripción',
    'Categoría',
    'Estado',
    'Prioridad',
    'Responsable',
    'Estimación (min)',
    'Creada',
    'Vencimiento',
    'Completada',
    'Lista de verificación',
  ];
  const rows = tasks.map((task) => {
    const checklist = task.checklist ?? [];
    const completedItems = checklist.filter((item) => item.completed).length;
    return [
      task.title,
      task.description,
      task.category,
      CSV_STATUS_LABELS[task.status],
      CSV_PRIORITY_LABELS[task.priority],
      task.ownerName,
      task.estimatedMinutes,
      task.createdAt,
      task.dueAt,
      task.completedAt,
      `${completedItems}/${checklist.length}`,
    ]
      .map(csvCell)
      .join(';');
  });
  return [header.map(csvCell).join(';'), ...rows].join('\r\n');
}

export function scopeTasksForSession(
  tasks: Task[],
  session: SessionActor | null,
  employees: EmployeeProfile[],
  departmentLeads: DepartmentLead[] = [],
): Task[] {
  if (session?.kind === 'organization') {
    return [...tasks];
  }
  if (session?.kind !== 'employee') {
    return [...tasks];
  }
  const employee = employees.find((candidate) => candidate.id === session.employeeId) ?? null;
  if (!employee) {
    return [];
  }
  if (employee.authorityLevel === 'operative') {
    return tasks.filter((task) => task.ownerId === employee.id);
  }
  const lead = departmentLeads.find((l) => l.employeeId === employee.id);
  const teamDepartment = lead?.department ?? employee.department;
  return tasks.filter((task) => {
    if (task.ownerId === employee.id) {
      return true;
    }
    if (!task.ownerId) {
      return false;
    }
    const owner = employees.find((candidate) => candidate.id === task.ownerId);
    if (!owner) {
      return false;
    }
    if (lead) {
      return owner.department === teamDepartment && owner.authorityLevel === 'operative';
    }
    return owner.department === teamDepartment;
  });
}
