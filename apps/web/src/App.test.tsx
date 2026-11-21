import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  App,
  clearAccessUrl,
  buildCompletedPerDay,
  buildOverviewStats,
  buildAttentionAlerts,
  canCreateTasksForSession,
  canInviteEmployeesForSession,
  completionPercentage,
  DeleteEmployeeConfirmation,
  filterAndSortEmployees,
  filterTasks,
  filterTasksByRange,
  isTaskOverdue,
  pendingTaskCount,
  workloadLevel,
  buildPeriodComparison,
  buildTasksCsv,
  buildWorkloadDistribution,
  buildNextWeekForecast,
  buildOrgChart,
  roleFromSession,
  scopeTasksForSession,
  scopeEmployeesForSession,
} from './App.js';
import { EmployeesSection } from './components/EmployeesSection.js';
import { TasksSection } from './components/TasksSection.js';
import { MyProfileSection } from './components/MyProfileSection.js';
import { OverviewSection } from './components/OverviewSection.js';
import { HelpSection, HELP_CONTENT } from './components/HelpSection.js';
import {
  EmptyState,
  QuickViewDrawer,
  RemoveDepartmentLeadConfirmation,
  WorkspaceSkeleton,
} from './components/ui.js';
import {
  fromDateTimeLocalValue,
  missingNewTaskFields,
  NewTaskModal,
  readTaskAttachmentFiles,
  TaskDetailModal,
  toDateTimeLocalValue,
} from './components/TasksSection.js';
import {
  clearActiveSession,
  clearStoredSession,
  loadStoredSession,
  loadUiState,
  storeSession,
  storeUiState,
  uiScopeKey,
} from './session-storage.js';
import type { DepartmentLead, EmployeeProfile, Task } from './api.js';

const NOW = Date.parse('2026-11-09T12:00:00.000Z');

function taskFixture(overrides: Partial<Task> & { id: string }): Task {
  return {
    organizationId: 'org-1',
    title: `Tarea ${overrides.id}`,
    description: 'Descripción',
    category: 'Finanzas',
    estimatedMinutes: 60,
    ownerId: null,
    ownerName: null,
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-11-08T10:00:00.000Z',
    dueAt: null,
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-11-08T10:00:00.000Z',
    dependsOn: [],
    checklist: [],
    ...overrides,
  } as Task;
}

describe('App', () => {
  it('renders only the public presentation and access option before authentication', () => {
    const page = renderToStaticMarkup(<App />);

    expect(page).toContain('Haz que el trabajo');
    expect(page).toContain('Acceder o registrarse');
    expect(page).toContain('Quiénes somos');
    expect(page).toContain('Nuestro objetivo');
    expect(page).toContain('A qué nos dedicamos');
    expect(page).not.toContain('Vista general');
    expect(page).not.toContain('Crear organización</h2>');
  });

  it('renders a three-bar menu toggle before the brand in the workspace topbar', () => {
    const page = renderToStaticMarkup(
      <App session={{ kind: 'organization' }} organizationId="org-1" />,
    );
    const toggleStart = page.indexOf('class="menu-toggle"');
    const brandStart = page.indexOf('class="brand"');
    const toggle = page.slice(toggleStart, brandStart);

    expect(toggleStart).toBeGreaterThan(-1);
    expect(brandStart).toBeGreaterThan(toggleStart);
    expect(toggle).toContain('class="menu-toggle-bars"');
    expect((toggle.match(/<span><\/span>/g) ?? []).length).toBe(3);
  });

  it('uses null overview values when there are no assigned tasks', () => {
    expect(buildOverviewStats([])).toEqual([
      ['—', 'Tareas asignadas', 'Sin datos'],
      ['—', 'Completadas', 'Sin datos'],
      ['—', 'Pendientes', 'Sin datos'],
      ['—', 'Canceladas', 'Sin datos'],
    ]);
  });

  it('counts real tasks in the overview when tasks exist', () => {
    const tasks: Task[] = [
      taskFixture({ id: 'task-1', title: 'Primera tarea', status: 'pending' }),
      taskFixture({ id: 'task-2', title: 'Segunda tarea', priority: 'high', status: 'pending' }),
    ];
    expect(buildOverviewStats(tasks)).toEqual([
      ['2', 'Tareas asignadas', 'Todo el período'],
      ['0', 'Completadas', 'Todo el período'],
      ['2', 'Pendientes', 'Requieren atención'],
      ['0', 'Canceladas', 'Todo el período'],
    ]);
  });

  it('computes a real lifecycle with completion percentage', () => {
    const tasks: Task[] = [
      taskFixture({ id: 't1', status: 'completed', completedAt: '2026-11-08T14:00:00.000Z' }),
      taskFixture({ id: 't2', status: 'completed', completedAt: '2026-11-08T15:00:00.000Z' }),
      taskFixture({ id: 't3', status: 'pending' }),
      taskFixture({ id: 't4', status: 'cancelled', cancelledAt: '2026-11-08T16:00:00.000Z' }),
      taskFixture({ id: 't5', status: 'in_progress' }),
    ];
    expect(buildOverviewStats(tasks)).toEqual([
      ['5', 'Tareas asignadas', 'Todo el período'],
      ['2', 'Completadas', 'Todo el período'],
      ['1', 'Pendientes', 'Requieren atención'],
      ['1', 'Canceladas', 'Todo el período'],
    ]);
    expect(completionPercentage(tasks)).toBe('40,0%');
    expect(completionPercentage([])).toBe('0,0%');
  });

  it('filters tasks by the selected range', () => {
    const tasks: Task[] = [
      taskFixture({ id: 'old', createdAt: '2026-08-01T10:00:00.000Z' }),
      taskFixture({ id: 'new', createdAt: '2026-11-08T10:00:00.000Z' }),
    ];
    expect(filterTasksByRange(tasks, '7d', NOW)).toHaveLength(1);
    expect(filterTasksByRange(tasks, '90d', NOW)).toHaveLength(1);
    expect(filterTasksByRange(tasks, 'all', NOW)).toHaveLength(2);
  });

  it('builds created vs completed per day for the chart', () => {
    const tasks: Task[] = [
      taskFixture({
        id: 'a',
        createdAt: '2026-11-08T10:00:00.000Z',
        status: 'completed',
        completedAt: '2026-11-09T09:00:00.000Z',
      }),
      taskFixture({ id: 'b', createdAt: '2026-11-08T11:00:00.000Z' }),
    ];
    const chart = buildCompletedPerDay(tasks, '7d', NOW);
    expect(chart.reduce((sum, bucket) => sum + bucket.created, 0)).toBe(2);
    expect(chart.reduce((sum, bucket) => sum + bucket.completed, 0)).toBe(1);
    expect(chart.find((bucket) => bucket.date === '2026-11-08')).toMatchObject({
      label: '8/11',
      created: 2,
      completed: 0,
    });
    expect(chart.find((bucket) => bucket.date === '2026-11-09')).toMatchObject({
      label: '9/11',
      created: 0,
      completed: 1,
    });
  });

  it('builds attention alerts with a button per alert', () => {
    const alerts = buildAttentionAlerts([
      taskFixture({ id: 'u', priority: 'urgent', status: 'pending' }),
      taskFixture({ id: 'c', status: 'cancelled' }),
    ]);
    expect(alerts.map((alert) => alert.id)).toContain('unassigned');
    expect(alerts.map((alert) => alert.id)).toContain('urgent');
    expect(alerts.map((alert) => alert.id)).toContain('cancelled');
    expect(alerts.every((alert) => alert.actionLabel.length > 0 && alert.target === 'tasks')).toBe(
      true,
    );
  });

  it('lets only the organization invite and only owner or administrative create tasks', () => {
    expect(canInviteEmployeesForSession({ kind: 'organization' })).toBe(true);
    expect(
      canInviteEmployeesForSession({
        kind: 'employee',
        employeeId: '1',
        authorityLevel: 'administrative',
      }),
    ).toBe(false);
    expect(
      canInviteEmployeesForSession({
        kind: 'employee',
        employeeId: '1',
        authorityLevel: 'operative',
      }),
    ).toBe(false);
    expect(canCreateTasksForSession({ kind: 'organization' })).toBe(true);
    expect(
      canCreateTasksForSession({
        kind: 'employee',
        employeeId: '1',
        authorityLevel: 'administrative',
      }),
    ).toBe(true);
    expect(
      canCreateTasksForSession({ kind: 'employee', employeeId: '1', authorityLevel: 'operative' }),
    ).toBe(false);
  });

  it('shows the delete confirmation with the employee data and Cancelar / Confirmar buttons', () => {
    const employee: EmployeeProfile = {
      id: 'employee-1',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'López',
      email: 'andrea@correo.com',
      position: 'Diseñadora de producto',
      department: 'Diseño',
      skills: ['Excel', 'SQL'],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: '2026-11-08T10:00:00.000Z',
    };
    const page = renderToStaticMarkup(
      <DeleteEmployeeConfirmation
        employee={employee}
        pendingTasks={[]}
        otherEmployees={[]}
        isDeleting={false}
        error=""
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(page).toContain('¿Está seguro de querer eliminar al siguiente empleado?');
    expect(page).toContain('Nombre');
    expect(page).toContain('Andrea');
    expect(page).toContain('Apellido');
    expect(page).toContain('López');
    expect(page).toContain('Puesto');
    expect(page).toContain('Diseñadora de producto');
    expect(page).toContain('Nivel de autoridad');
    expect(page).toContain('Nivel Administrativo');
    expect(page).toContain('Cancelar');
    expect(page).toContain('Confirmar');
    expect(page).toContain('button-danger');
  });

  it('offers task handling options when deleting an employee with active tasks', () => {
    const employee: EmployeeProfile = {
      id: 'employee-1',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'López',
      email: 'andrea@correo.com',
      position: 'Diseñadora',
      department: 'Diseño',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const other: EmployeeProfile = { ...employee, id: 'employee-2', firstName: 'Juan' };
    const page = renderToStaticMarkup(
      <DeleteEmployeeConfirmation
        employee={employee}
        pendingTasks={[taskFixture({ id: 't1', ownerId: 'employee-1', status: 'pending' })]}
        otherEmployees={[other]}
        isDeleting={false}
        error=""
        mode="reassign"
        toEmployeeId="employee-2"
        onModeChange={() => undefined}
        onToEmployeeIdChange={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(page).toContain('Reasignarlas');
    expect(page).toContain('Dejarlas sin asignar');
    expect(page).toContain('Cancelarlas');
    expect(page).toContain('Juan');
  });

  it('scopes the employee directory per role', () => {
    const andrea: EmployeeProfile = {
      id: 'a',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'López',
      email: 'andrea@correo.com',
      position: 'Jefa',
      department: 'Diseño',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const juan: EmployeeProfile = {
      ...andrea,
      id: 'b',
      firstName: 'Juan',
      authorityLevel: 'operative',
      email: 'juan@correo.com',
    };
    const sofia: EmployeeProfile = {
      ...andrea,
      id: 'c',
      firstName: 'Sofía',
      department: 'Finanzas',
      email: 'sofia@correo.com',
    };
    expect(
      scopeEmployeesForSession([andrea, juan, sofia], { kind: 'organization' })
        .map((employee) => employee.id)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
    expect(
      scopeEmployeesForSession([andrea, juan, sofia], {
        kind: 'employee',
        employeeId: 'b',
        authorityLevel: 'operative',
      }).map((employee) => employee.id),
    ).toEqual(['b']);
    expect(
      scopeEmployeesForSession([andrea, juan, sofia], {
        kind: 'employee',
        employeeId: 'a',
        authorityLevel: 'administrative',
      })
        .map((employee) => employee.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('searches by name, filters by department/authority and sorts', () => {
    const andrea: EmployeeProfile = {
      id: '1',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'López',
      email: 'andrea@correo.com',
      position: 'Diseñadora',
      department: 'Diseño',
      skills: ['Excel'],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const juan: EmployeeProfile = {
      id: '2',
      organizationId: 'org-1',
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@correo.com',
      position: 'Analista',
      department: 'Finanzas',
      skills: [],
      authorityLevel: 'operative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const tasks = [
      taskFixture({ id: 't1', ownerId: '2', status: 'pending' }),
      taskFixture({ id: 't2', ownerId: '2', status: 'pending' }),
      taskFixture({ id: 't3', ownerId: '2', status: 'completed' }),
    ];
    expect(
      filterAndSortEmployees([juan, andrea], tasks, {
        query: 'andrea',
        department: '',
        authority: 'all',
        sort: 'name',
      }).map((employee) => employee.id),
    ).toEqual(['1']);
    expect(
      filterAndSortEmployees([andrea, juan], tasks, {
        query: '',
        department: 'Finanzas',
        authority: 'all',
        sort: 'name',
      }).map((employee) => employee.id),
    ).toEqual(['2']);
    expect(
      filterAndSortEmployees([juan, andrea], tasks, {
        query: '',
        department: '',
        authority: 'administrative',
        sort: 'name',
      }).map((employee) => employee.id),
    ).toEqual(['1']);
    expect(
      filterAndSortEmployees([andrea, juan], tasks, {
        query: '',
        department: '',
        authority: 'all',
        sort: 'pending',
      }).map((employee) => employee.id),
    ).toEqual(['2', '1']);
  });

  it('measures pending tasks, overdue and workload', () => {
    const tasks = [
      taskFixture({ id: 't1', ownerId: '1', status: 'pending', dueAt: '2026-11-01T23:59:00.000Z' }),
      taskFixture({ id: 't2', ownerId: '1', status: 'pending' }),
      taskFixture({
        id: 't3',
        ownerId: '1',
        status: 'completed',
        dueAt: '2026-11-01T23:59:00.000Z',
      }),
    ];
    expect(pendingTaskCount(tasks, '1')).toBe(2);
    expect(pendingTaskCount(tasks, '2')).toBe(0);
    expect(isTaskOverdue(tasks[0], NOW)).toBe(true);
    expect(isTaskOverdue(tasks[2], NOW)).toBe(false);
    expect(workloadLevel(0).tone).toBe('low');
    expect(workloadLevel(3).tone).toBe('medium');
    expect(workloadLevel(6).tone).toBe('high');
  });

  it('filters tasks by status pills, search, owner, priority, category and date', () => {
    const tasks = [
      taskFixture({
        id: 'a',
        title: 'Informe Financiero',
        status: 'pending',
        ownerId: '1',
        priority: 'high',
        category: 'Finanzas',
      }),
      taskFixture({
        id: 'b',
        title: 'Campaña de Marketing',
        status: 'in_review',
        ownerId: '2',
        priority: 'low',
        category: 'Marketing',
      }),
      taskFixture({
        id: 'c',
        title: 'Contratación',
        status: 'completed',
        ownerId: null,
        priority: 'medium',
        category: 'Recursos Humanos',
      }),
    ];
    const base = {
      status: 'all' as const,
      query: '',
      ownerId: '',
      priority: '',
      category: '',
      due: 'all' as const,
      state: '',
    };
    expect(filterTasks(tasks, { ...base, status: 'in_review' })).toHaveLength(1);
    expect(filterTasks(tasks, { ...base, query: 'informe' })).toHaveLength(1);
    expect(filterTasks(tasks, { ...base, ownerId: '1' })).toHaveLength(1);
    expect(filterTasks(tasks, { ...base, priority: 'low' })).toHaveLength(1);
    expect(filterTasks(tasks, { ...base, category: 'Marketing' })).toHaveLength(1);
    expect(filterTasks(tasks, { ...base, ownerId: '__unassigned__' })).toHaveLength(1);
  });
  it('builds a distribution sorted by hours with clickable data', () => {
    const andrea: EmployeeProfile = {
      id: 'a',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'L?pez',
      email: 'andrea@correo.com',
      position: 'Dise?adora',
      department: 'Dise?o',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const juan = { ...andrea, id: 'b', firstName: 'Juan', email: 'juan@correo.com' };
    const tasks: Task[] = [
      taskFixture({ id: 't1', ownerId: 'b', estimatedMinutes: 120, status: 'pending' }),
      taskFixture({ id: 't2', ownerId: 'b', estimatedMinutes: 60, status: 'in_progress' }),
      taskFixture({ id: 't3', ownerId: 'a', estimatedMinutes: 30, status: 'pending' }),
    ];
    const distribution = buildWorkloadDistribution([andrea, juan], tasks);
    expect(distribution.map((entry) => entry.employee.id)).toEqual(['b', 'a']);
    expect(distribution[0]).toMatchObject({ assignedHours: 3, activeCount: 2, percent: 100 });
    expect(distribution[1]).toMatchObject({ assignedHours: 0.5, activeCount: 1 });
  });

  it('compares the current period against the previous one', () => {
    const tasks: Task[] = [
      taskFixture({
        id: 'new',
        createdAt: '2026-11-08T10:00:00.000Z',
        status: 'completed',
        completedAt: '2026-11-09T10:00:00.000Z',
      }),
      taskFixture({
        id: 'late',
        createdAt: '2026-11-08T10:00:00.000Z',
        dueAt: '2026-11-01T10:00:00.000Z',
      }),
      taskFixture({
        id: 'old',
        createdAt: '2026-10-01T10:00:00.000Z',
        status: 'completed',
        completedAt: '2026-10-02T10:00:00.000Z',
      }),
    ];
    const comparison = buildPeriodComparison(tasks, '30d', NOW);
    expect(comparison).not.toBeNull();
    expect(comparison?.created.current).toBe(2);
    expect(comparison?.created.previous).toBe(1);
    expect(comparison?.completed.current).toBe(1);
    expect(comparison?.completed.previous).toBe(1);
    expect(comparison?.overdue.current).toBe(1);
    expect(comparison?.avgCompletionHours.current).not.toBeNull();
    expect(buildPeriodComparison(tasks, 'all', NOW)).toBeNull();
  });

  it('builds a next week forecast from due dates, capacity and availability', () => {
    const available: EmployeeProfile = {
      id: 'a',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'L?pez',
      email: 'andrea@correo.com',
      position: 'Dise?adora',
      department: 'Dise?o',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const onVacation = { ...available, id: 'b', availabilityStatus: 'vacation' as const };
    const tasks: Task[] = [
      taskFixture({ id: 'due', estimatedMinutes: 1200, dueAt: '2026-11-11T10:00:00.000Z' }),
    ];
    const forecast = buildNextWeekForecast(tasks, [available, onVacation], NOW);
    expect(forecast).toMatchObject({ dueCount: 1, demandHours: 20, capacityHours: 40 });
    expect(forecast.utilizationPercent).toBe(50);
    expect(forecast.level).toBe('low');
  });
  it('scopes the vista general per role (owner, administrative, operative)', () => {
    const andrea: EmployeeProfile = {
      id: 'a',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'L?pez',
      email: 'andrea@correo.com',
      position: 'Dise?adora',
      department: 'Dise?o',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const juan: EmployeeProfile = {
      ...andrea,
      id: 'b',
      firstName: 'Juan',
      authorityLevel: 'operative',
      email: 'juan@correo.com',
    };
    const sofia: EmployeeProfile = {
      ...andrea,
      id: 'c',
      firstName: 'Sof?a',
      department: 'Finanzas',
      email: 'sofia@correo.com',
    };
    const tasks: Task[] = [
      taskFixture({ id: 't1', ownerId: 'b', status: 'pending' }),
      taskFixture({ id: 't2', ownerId: 'a', status: 'pending' }),
      taskFixture({ id: 't3', ownerId: 'c', status: 'pending' }),
    ];
    const owner = scopeTasksForSession(tasks, { kind: 'organization' }, [andrea, juan, sofia]);
    expect(owner).toHaveLength(3);
    const administrative = scopeTasksForSession(
      tasks,
      { kind: 'employee', employeeId: 'a', authorityLevel: 'administrative' },
      [andrea, juan, sofia],
    );
    expect(administrative.map((task) => task.id).sort()).toEqual(['t1', 't2']);
    const operative = scopeTasksForSession(
      tasks,
      { kind: 'employee', employeeId: 'b', authorityLevel: 'operative' },
      [andrea, juan, sofia],
    );
    expect(operative.map((task) => task.id)).toEqual(['t1']);
    expect(roleFromSession({ kind: 'organization' })).toBe('organization');
    expect(
      roleFromSession({ kind: 'employee', employeeId: 'a', authorityLevel: 'administrative' }),
    ).toBe('administrative');
    expect(roleFromSession(null)).toBe('organization');
  });

  it('builds an organigrama grouping by department with leads marked', () => {
    const lead: EmployeeProfile = {
      id: 'a',
      organizationId: 'org-1',
      firstName: 'Andrea',
      lastName: 'L?pez',
      email: 'andrea@correo.com',
      position: 'Jefa de Dise?o',
      department: 'Dise?o',
      skills: [],
      authorityLevel: 'administrative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const operative: EmployeeProfile = {
      ...lead,
      id: 'b',
      firstName: 'Juan',
      position: 'Dise?ador',
      authorityLevel: 'operative' as const,
      email: 'juan@correo.com',
    };
    const chart = buildOrgChart(
      [operative, lead],
      [
        {
          organizationId: 'org-1',
          department: 'Dise?o',
          employeeId: 'a',
          assignedAt: '2026-11-15T00:00:00.000Z',
          assignedBy: null,
        },
      ],
    );
    expect(chart).toHaveLength(1);
    expect(chart[0]).toMatchObject({ department: 'Dise?o' });
    expect(chart[0].jefe?.id).toBe('a');
    expect(chart[0].members.map((employee) => employee.id)).toEqual(['b']);
  });

  it('renders the help section with all three tabs and their default content', () => {
    const page = renderToStaticMarkup(<HelpSection onNavigate={() => undefined} />);
    expect(page).toContain('Ayuda de WorkFlowPlus');
    expect(page).toContain('Empleado');
    expect(page).toContain('Vista general');
    expect(page).toContain('Tareas');
    expect(page).toContain('Sección Empleados');
    expect(page).toContain('Ver el directorio');
    expect(page).toContain('Ir a Empleados');
  });

  it('defines help content for all three tabs', () => {
    expect(Object.keys(HELP_CONTENT)).toEqual(['empleado', 'vista-general', 'tareas']);
    expect(HELP_CONTENT.empleado.title).toBe('Sección Empleados');
    expect(HELP_CONTENT['vista-general'].title).toBe('Sección Vista general');
    expect(HELP_CONTENT.tareas.title).toBe('Sección Tareas');
  });

  it('includes employee help items about directorio, invitacion y niveles', () => {
    const headings = HELP_CONTENT.empleado.items.map((item) => item.heading);
    expect(headings).toContain('Ver el directorio');
    expect(headings).toContain('Invitar empleados');
    expect(headings).toContain('Niveles de autoridad');
    expect(headings).toContain('Departamentos y jefes');
    expect(headings).toContain('Carga de trabajo');
  });

  it('includes vista general help items about estadisticas y pronostico', () => {
    const headings = HELP_CONTENT['vista-general'].items.map((item) => item.heading);
    expect(headings).toContain('Estadísticas');
    expect(headings).toContain('Gráfico de actividad');
    expect(headings).toContain('Centro de atención');
    expect(headings).toContain('Carga laboral');
    expect(headings).toContain('Pronóstico de la semana');
    expect(headings).toContain('Organigrama y actividad');
  });

  it('includes tareas help items about crear, detalle y kanban', () => {
    const headings = HELP_CONTENT.tareas.items.map((item) => item.heading);
    expect(headings).toContain('Crear una tarea');
    expect(headings).toContain('Ver el detalle');
    expect(headings).toContain('Cambiar el estado');
    expect(headings).toContain('Vista Kanban');
    expect(headings).toContain('Filtros y búsqueda');
    expect(headings).toContain('Comentarios y archivos');
  });

  it('exports a scoped task report as escaped CSV', () => {
    const csv = buildTasksCsv([
      taskFixture({
        id: 'export-1',
        title: '=Fórmula peligrosa',
        ownerName: 'Ana "A"',
        checklist: [
          { id: 'a', text: 'Revisar', completed: true },
          { id: 'b', text: 'Enviar', completed: false },
        ],
      }),
      taskFixture({ id: 'export-2', title: '\t=SUM(A1:A2)' }),
    ]);
    expect(csv.split('\r\n')[0]).toContain('"Título";"Descripción"');
    expect(csv).toContain('"\'=Fórmula peligrosa"');
    expect(csv).toContain('"\' =SUM(A1:A2)"');
    expect(csv).toContain('"Ana ""A"""');
    expect(csv).toContain('"1/2"');
  });

  it('offers an accessible Modo Nocturno toggle in the authenticated workspace', () => {
    const page = renderToStaticMarkup(
      <App session={{ kind: 'organization' }} organizationId="org-1" />,
    );
    expect(page).toContain('Activar Modo Nocturno');
    expect(page).toContain('Modo Nocturno');
    expect(page).not.toContain('Modo oscuro');
    expect(page).toContain('Usar densidad compacta');
  });

  it('offers a dropdown with all available workspace sections', () => {
    const page = renderToStaticMarkup(
      <App session={{ kind: 'organization' }} organizationId="org-1" />,
    );
    expect(page).toContain('Secciones ▾');
    expect(page).toContain('aria-controls="workspace-sections-menu"');
    expect(page).toContain('Vista general');
    expect(page).toContain('Tareas');
    expect(page).toContain('Empleados');
    expect(page).toContain('Ayuda');
  });

  it('requires every field when creating a task', () => {
    expect(
      missingNewTaskFields({
        title: '',
        description: '',
        category: '',
        priority: '',
        ownerId: '',
        dueAt: '',
      }),
    ).toEqual([
      'Título',
      'Descripción',
      'Categoría',
      'Prioridad',
      'Responsable',
      'Fecha de entrega',
    ]);
    expect(
      missingNewTaskFields({
        title: 'Informe',
        description: 'Revisar métricas',
        category: 'Finanzas',
        priority: 'high',
        ownerId: 'employee-1',
        dueAt: '2026-11-20T10:00',
      }),
    ).toEqual([]);
  });
});

describe('workspace polish components', () => {
  it('renders an accessible loading skeleton', () => {
    const page = renderToStaticMarkup(<WorkspaceSkeleton />);
    expect(page).toContain('role="status"');
    expect(page).toContain('Cargando información...');
    expect(page).toContain('skeleton-card');
  });

  it('renders an empty state with an optional action', () => {
    const page = renderToStaticMarkup(
      <EmptyState
        title={'Todavía no hay tareas asignadas.'}
        description={'Las tareas aparecerán acá.'}
        actionLabel={'Nueva tarea'}
        onAction={() => undefined}
      />,
    );
    expect(page).toContain('Todavía no hay tareas asignadas.');
    expect(page).toContain('Nueva tarea');
  });

  it('renders a read-only quick view drawer', () => {
    const page = renderToStaticMarkup(
      <QuickViewDrawer
        eyebrow={'Vista rápida de tarea'}
        title={'Informe mensual'}
        description={'Preparar el informe'}
        fields={[
          { label: 'Responsable', value: 'Ana Pérez' },
          { label: 'Estado', value: 'Pendiente' },
        ]}
        tags={['Vencida']}
        onClose={() => undefined}
      />,
    );
    expect(page).toContain('role="dialog"');
    expect(page).toContain('Vista rápida de tarea');
    expect(page).toContain('Informe mensual');
    expect(page).toContain('Ana Pérez');
    expect(page).not.toContain('<input');
    expect(page).not.toContain('<select');
  });
});

describe('session storage', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves the Modo Nocturno preference and defaults invalid themes to light', () => {
    const scope = uiScopeKey({ kind: 'organization' }, 'org-1');
    storeUiState(scope, {
      section: 'employees',
      profileEmployeeId: null,
      theme: 'dark',
      density: 'compact',
      organizationId: 'org-1',
    });
    expect(loadUiState(scope, 'org-1')).toEqual({
      section: 'employees',
      profileEmployeeId: null,
      theme: 'dark',
      density: 'compact',
      organizationId: 'org-1',
    });
    expect(loadUiState(scope, 'org-2')).toBeNull();

    values.set(
      `workflowplus.ui.${scope}`,
      JSON.stringify({
        section: 'employees',
        profileEmployeeId: null,
        theme: 'night',
        density: 'wide',
        organizationId: 'org-1',
      }),
    );
    expect(loadUiState(scope, 'org-1')).toMatchObject({
      theme: 'light',
      density: 'comfortable',
      organizationId: 'org-1',
    });
  });

  it('keeps section and profile per actor inside the same organization', () => {
    const ownerScope = uiScopeKey({ kind: 'organization' }, 'org-1');
    const employeeScope = uiScopeKey(
      {
        kind: 'employee',
        employeeId: 'employee-1',
        authorityLevel: 'operative',
      } as const,
      'org-1',
    );
    storeUiState(ownerScope, {
      section: 'tasks',
      profileEmployeeId: null,
      theme: 'light',
      density: 'comfortable',
      organizationId: 'org-1',
    });
    storeUiState(employeeScope, {
      section: 'profile',
      profileEmployeeId: 'employee-9',
      theme: 'dark',
      density: 'compact',
      organizationId: 'org-1',
    });

    expect(loadUiState(ownerScope, 'org-1')).toMatchObject({
      section: 'tasks',
      profileEmployeeId: null,
    });
    expect(loadUiState(employeeScope, 'org-1')).toMatchObject({
      section: 'profile',
      profileEmployeeId: 'employee-9',
      theme: 'dark',
    });
    expect(
      loadUiState(
        uiScopeKey(
          {
            kind: 'employee',
            employeeId: 'employee-2',
            authorityLevel: 'operative',
          } as const,
          'org-1',
        ),
        'org-1',
      ),
    ).toBeNull();
  });
});

describe('active session isolation', () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();

  const storage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });

  beforeEach(() => {
    localValues.clear();
    sessionValues.clear();
    vi.stubGlobal('window', {
      localStorage: storage(localValues),
      sessionStorage: storage(sessionValues),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the active session per tab without writing to localStorage', () => {
    const stored = { session: { kind: 'organization' } as const, organizationId: 'org-owner' };

    storeSession(stored);

    expect(sessionValues.get('workflowplus.session')).toBe(JSON.stringify(stored));
    expect(localValues.has('workflowplus.session')).toBe(false);
    expect(loadStoredSession()).toEqual(stored);
  });

  it('ignores a session left in localStorage by another tab', () => {
    localValues.set(
      'workflowplus.session',
      JSON.stringify({
        session: { kind: 'employee', employeeId: 'emp-1', authorityLevel: 'operative' },
        organizationId: 'org-1',
      }),
    );

    expect(loadStoredSession()).toBeNull();
  });

  it('clears only the active session when access is requested by URL', () => {
    storeSession({ session: { kind: 'organization' } as const, organizationId: 'org-owner' });
    localValues.set('workflowplus.ui', '{"theme":"dark"}');

    clearActiveSession();

    expect(loadStoredSession()).toBeNull();
    expect(localValues.get('workflowplus.ui')).toBe('{"theme":"dark"}');
  });

  it('clears the active session and only that actor UI state on explicit sign out', () => {
    const scope = uiScopeKey({ kind: 'organization' }, 'org-owner');
    storeSession({ session: { kind: 'organization' } as const, organizationId: 'org-owner' });
    localValues.set(`workflowplus.ui.${scope}`, '{"theme":"dark"}');
    localValues.set('workflowplus.ui', '{"theme":"light"}');

    clearStoredSession(scope);

    expect(loadStoredSession()).toBeNull();
    expect(localValues.has(`workflowplus.ui.${scope}`)).toBe(false);
    expect(localValues.has('workflowplus.ui')).toBe(false);
  });
});

describe('employee directory', () => {
  it('shows the employee name above the position', () => {
    const employee: EmployeeProfile = {
      id: 'employee-1',
      organizationId: 'org-1',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      position: 'Diseñadora',
      department: 'Diseño',
      skills: [],
      authorityLevel: 'operative',
      weeklyCapacityHours: 40,
      availabilityStatus: 'available',
      onboardingCompleted: true,
      joinedAt: null,
    };
    const page = renderToStaticMarkup(
      <EmployeesSection
        employees={[employee]}
        tasks={[]}
        invitations={[]}
        departmentLeads={[]}
        session={{ kind: 'organization' }}
        organizationId="org-1"
        onRefresh={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    expect(page).toContain('class="employee-identity"');
    expect(page.indexOf('Ana Pérez')).toBeLessThan(page.indexOf('Diseñadora'));
    expect(page).not.toContain('Eliminar a Ana Pérez');
    expect(page).not.toContain('class="row-action"');
  });
});

describe('organization chart profile links', () => {
  const lead: EmployeeProfile = {
    id: 'employee-1',
    organizationId: 'org-1',
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    position: 'Diseñadora',
    department: 'Diseño',
    skills: [],
    authorityLevel: 'administrative',
    weeklyCapacityHours: 40,
    availabilityStatus: 'available',
    onboardingCompleted: true,
    joinedAt: null,
  };
  const member: EmployeeProfile = {
    ...lead,
    id: 'employee-2',
    firstName: 'Bruno',
    lastName: 'Soto',
    authorityLevel: 'operative',
  };
  const departmentLead: DepartmentLead = {
    organizationId: 'org-1',
    department: 'Diseño',
    employeeId: lead.id,
    assignedAt: '2026-11-01T00:00:00.000Z',
    assignedBy: null,
  };

  it('exposes every chart person as a link to their own profile', () => {
    const page = renderToStaticMarkup(
      <OverviewSection
        tasks={[]}
        employees={[lead, member]}
        activities={[]}
        departmentLeads={[departmentLead]}
        session={{ kind: 'organization' }}
        onNavigate={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    expect(page).toContain('aria-label="Ver perfil de Ana Pérez"');
    expect(page).toContain('aria-label="Ver perfil de Bruno Soto"');
  });
});

describe('employee profile account deletion', () => {
  const employee: EmployeeProfile = {
    id: 'employee-1',
    organizationId: 'org-1',
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    position: 'Diseñadora',
    department: 'Diseño',
    skills: [],
    authorityLevel: 'operative',
    weeklyCapacityHours: 40,
    availabilityStatus: 'available',
    onboardingCompleted: true,
    joinedAt: null,
  };

  it('shows a red delete-account action on the employee own profile', () => {
    const page = renderToStaticMarkup(
      <MyProfileSection
        employee={employee}
        tasks={[]}
        activities={[]}
        isSelf
        onDeleteAccount={async () => undefined}
        onBack={() => undefined}
      />,
    );

    expect(page).toContain('Eliminar mi cuenta');
    expect(page).toContain('class="button button-danger"');
    expect(page).toContain('profile-danger-card');
  });

  it('shows the delete action when the owner views an employee profile', () => {
    const page = renderToStaticMarkup(
      <MyProfileSection
        employee={employee}
        tasks={[]}
        activities={[]}
        isOwner
        onDeleteAccount={async () => undefined}
        onBack={() => undefined}
      />,
    );

    expect(page).toContain('Eliminar cuenta del empleado');
    expect(page).toContain('class="button button-danger"');
    expect(page).toContain('profile-danger-card');
  });

  it('does not show the delete action when an employee views another profile', () => {
    const page = renderToStaticMarkup(
      <MyProfileSection employee={employee} tasks={[]} activities={[]} onBack={() => undefined} />,
    );

    expect(page).not.toContain('Eliminar cuenta del empleado');
    expect(page).not.toContain('Eliminar mi cuenta');
  });
});

describe('task due date conversion', () => {
  it('round-trips a datetime-local value without shifting the local clock time', () => {
    const local = new Date(2026, 10, 20, 10, 30, 0);
    const iso = local.toISOString();

    expect(toDateTimeLocalValue(iso)).toBe('2026-11-20T10:30');
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(iso))).toBe(iso);
  });

  it('converts an ISO value with an explicit offset to local clock time', () => {
    const iso = '2026-11-20T10:00:00+05:30';
    const local = new Date(iso);
    const pad = (value: number): string => String(value).padStart(2, '0');
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;

    expect(toDateTimeLocalValue(iso)).toBe(expected);
    expect(fromDateTimeLocalValue(expected)).toBe(local.toISOString());
  });

  it('returns an empty value for missing or invalid dates', () => {
    expect(toDateTimeLocalValue(null)).toBe('');
    expect(toDateTimeLocalValue('')).toBe('');
    expect(toDateTimeLocalValue('not-a-date')).toBe('');
  });
});

describe('employee access URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces login query parameters with the main page path', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/workspace/' },
      history: { replaceState },
    });

    clearAccessUrl();

    expect(replaceState).toHaveBeenCalledWith(null, '', '/workspace/');
  });
});

describe('task form, detail and department lead confirmation', () => {
  const session = { kind: 'organization' as const };

  it('renders categories as a select with the same control style as priority', () => {
    const page = renderToStaticMarkup(
      <NewTaskModal
        employees={[]}
        categories={['Finanzas', 'Tecnología']}
        organizationId="org-1"
        session={session}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect(page).toContain('<select id="task-category"');
    expect(page).toContain('Seleccionar categoría');
    expect(page).toContain('<select id="task-priority"');
    expect(page).toContain('type="file"');
    expect(page).toContain('multiple');
    expect(page).toContain('Archivos para el empleado (opcional)');
  });

  it('removes the checklist from the task detail and exposes attachments', () => {
    const task = taskFixture({
      id: 'task-1',
      checklist: [{ id: 'item-1', text: 'Revisar alcance', completed: false }],
    });
    const page = renderToStaticMarkup(
      <TaskDetailModal
        task={task}
        employees={[]}
        organizationId="org-1"
        session={session}
        onClose={() => undefined}
        onChanged={() => undefined}
      />,
    );

    expect(page).not.toContain('Lista de verificación');
    expect(page).not.toContain('checklist-item');
    expect(page).toContain('Archivos');
    expect(page).not.toContain('Guardar lista');
  });

  it('replaces the task arrow with a Detalle button in the task list', () => {
    const page = renderToStaticMarkup(
      <TasksSection
        tasks={[taskFixture({ id: 'task-1' })]}
        employees={[]}
        categories={[]}
        departmentLeads={[]}
        session={session}
        organizationId="org-1"
        onRefresh={() => undefined}
      />,
    );

    expect(page).toContain('aria-label="Ver detalle de Tarea task-1"');
    expect(page).toContain('button-detail');
    expect(page).not.toContain('>→</button>');
  });

  it('warns before removing a department lead with cancel and red confirm actions', () => {
    const page = renderToStaticMarkup(
      <RemoveDepartmentLeadConfirmation
        lead={{
          organizationId: 'org-1',
          department: 'Ventas',
          employeeId: 'employee-1',
          assignedAt: '2026-11-01T00:00:00.000Z',
          assignedBy: null,
        }}
        employeeName="Ana Pérez"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(page).toContain('role="alertdialog"');
    expect(page).toContain('Va a quitar a Ana Pérez de su puesto como jefe');
    expect(page).toContain('Cancelar');
    expect(page).toContain('class="button button-danger"');
    expect(page).toContain('Confirmar');
  });

  it('rejects too many or too large attachment files before reading them', async () => {
    const file = (size: number): File =>
      ({ name: 'manual.pdf', size, type: 'application/pdf' }) as unknown as File;

    const tooMany = await readTaskAttachmentFiles(Array.from({ length: 6 }, () => file(100)));
    expect(tooMany.error).toContain('hasta 5 archivos');

    const tooLarge = await readTaskAttachmentFiles([file(6 * 1024 * 1024)]);
    expect(tooLarge.error).toContain('5 MB');

    const alreadySelected = Array.from({ length: 5 }, () => ({
      name: 'previo.pdf',
      sizeBytes: 3,
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YWJj',
    }));
    const cumulative = await readTaskAttachmentFiles([file(3)], alreadySelected);
    expect(cumulative.error).toContain('hasta 5 archivos');
  });
});
