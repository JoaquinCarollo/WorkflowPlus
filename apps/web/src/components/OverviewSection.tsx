import { useState, type ReactElement } from 'react';
import type {
  DepartmentLead,
  EmployeeProfile,
  OverviewRange,
  SessionActor,
  Task,
  TaskActivity,
} from '../api.js';
import {
  buildAttentionAlerts,
  buildCompletedPerDay,
  buildTasksCsv,
  buildNextWeekForecast,
  buildOrgChart,
  buildOverviewStats,
  buildPeriodComparison,
  buildWorkloadDistribution,
  completionPercentage,
  filterTasksByRange,
  roleFromSession,
  scopeEmployeesForSession,
  scopeTasksForSession,
} from '../domain.js';

export interface OverviewSectionProps {
  tasks: Task[];
  employees: EmployeeProfile[];
  activities: TaskActivity[];
  departmentLeads: DepartmentLead[];
  session: SessionActor | null;
  onNavigate: (section: 'tasks' | 'employees') => void;
  onOpenProfile: (employeeId: string) => void;
}

const RANGES: Array<{ value: OverviewRange; label: string }> = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo el período' },
];

function delta(current: number, previous: number): { className: string; text: string } {
  if (current > previous) {
    return { className: 'up', text: `+${current - previous}` };
  }
  if (current < previous) {
    return { className: 'down', text: `-${previous - current}` };
  }
  return { className: 'flat', text: '\u2014' };
}

function hoursText(value: number | null): string {
  return value === null ? 'Sin datos' : `${String(value).replace('.', ',')} h`;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OverviewSection({
  tasks,
  employees,
  activities,
  departmentLeads,
  session,
  onNavigate,
  onOpenProfile,
}: OverviewSectionProps): ReactElement {
  const [range, setRange] = useState<OverviewRange>('7d');
  const now = Date.now();
  const role = roleFromSession(session);

  const scopedTasks = scopeTasksForSession(tasks, session, employees, departmentLeads);
  const scopedEmployees = scopeEmployeesForSession(employees, session, departmentLeads);
  const filteredTasks = filterTasksByRange(scopedTasks, range, now);
  const stats = buildOverviewStats(filteredTasks);
  const percent = completionPercentage(filteredTasks);
  const comparison = buildPeriodComparison(scopedTasks, range, now);
  const buckets = buildCompletedPerDay(filteredTasks, range, now);
  const maxBucket = buckets.reduce(
    (max, bucket) => Math.max(max, bucket.created, bucket.completed),
    0,
  );
  const alerts = buildAttentionAlerts(scopedTasks);
  const workload = buildWorkloadDistribution(scopedEmployees, scopedTasks);
  const forecast = buildNextWeekForecast(scopedTasks, scopedEmployees, now);
  const chart = buildOrgChart(scopedEmployees, departmentLeads);
  const createdTotal = buckets.reduce((sum, bucket) => sum + bucket.created, 0);
  const completedTotal = buckets.reduce((sum, bucket) => sum + bucket.completed, 0);

  const exportCsv = (): void => {
    const blob = new Blob([`\uFEFF${buildTasksCsv(filteredTasks)}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflowplus-tareas-${range}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section>
      <div className="page-heading">
        <h1>{'Vista general'}</h1>
      </div>
      <div className="overview-range">
        <label htmlFor="overview-range-select">{'Período'}</label>
        <select
          id="overview-range-select"
          value={range}
          onChange={(event) => setRange(event.target.value as OverviewRange)}
        >
          {RANGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button-secondary"
          onClick={exportCsv}
          disabled={filteredTasks.length === 0}
        >
          {'Exportar CSV'}
        </button>
      </div>
      <div className="stats-grid">
        {stats.map((entry, index) => (
          <div key={entry[1]} className={`stat-card stat-${index + 1}`}>
            <strong>{entry[0]}</strong>
            <h2>{entry[1]}</h2>
            <p>{entry[2]}</p>
          </div>
        ))}
      </div>
      <div className="completion-summary">
        <p>
          <strong>{percent}</strong>
          {` de las tareas asignadas están completadas.`}
        </p>
        <progress max={100} value={Number.parseFloat(percent.replace(',', '.'))}>
          {percent}
        </progress>
      </div>

      <div className="overview-content">
        <div className="activity-card">
          <div className="card-header">
            <h2>{'Creadas vs completadas'}</h2>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-created" />
              {'Creadas'}
            </span>
            <span>
              <i className="legend-completed" />
              {'Completadas'}
            </span>
          </div>
          {buckets.length === 0 ? (
            <p>{'Sin actividad todavía'}</p>
          ) : (
            <div className="completed-chart">
              {buckets.map((bucket) => (
                <div key={bucket.date} className="chart-day">
                  <div className="chart-bars">
                    <span
                      className="bar-created"
                      style={{
                        height: `${maxBucket > 0 ? (bucket.created / maxBucket) * 100 : 0}%`,
                      }}
                      title={`${bucket.created} creadas`}
                    />
                    <span
                      className="bar-completed"
                      style={{
                        height: `${maxBucket > 0 ? (bucket.completed / maxBucket) * 100 : 0}%`,
                      }}
                      title={`${bucket.completed} completadas`}
                    />
                  </div>
                  <small>{bucket.label}</small>
                </div>
              ))}
            </div>
          )}
          <p className="chart-summary">
            {`${completedTotal} completadas frente a ${createdTotal} creadas.`}
          </p>
        </div>

        <div className="attention-card">
          <p className="eyebrow-label">{'Centro de atención'}</p>
          <h2>{'Novedades'}</h2>
          {alerts.length === 0 ? (
            <p>{'Sin Novedades'}</p>
          ) : (
            <ul className="attention-list">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <p>{alert.title}</p>
                  <p>{alert.detail}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onNavigate(alert.target === 'tasks' ? 'tasks' : 'employees')}
                  >
                    {alert.actionLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {comparison && (
        <div className="overview-comparison">
          <p className="section-kicker">{'Comparación'}</p>
          <h2>{'Período actual vs anterior'}</h2>
          <div className="comparison-grid">
            <div className="comparison-card">
              <span className="comparison-label">{'Creadas'}</span>
              <strong>{comparison.created.current}</strong>
              <span
                className={`comparison-delta ${delta(comparison.created.current, comparison.created.previous).className}`}
              >
                {delta(comparison.created.current, comparison.created.previous).text}
              </span>
            </div>
            <div className="comparison-card">
              <span className="comparison-label">{'Completadas'}</span>
              <strong>{comparison.completed.current}</strong>
              <span
                className={`comparison-delta ${delta(comparison.completed.current, comparison.completed.previous).className}`}
              >
                {delta(comparison.completed.current, comparison.completed.previous).text}
              </span>
            </div>
            <div className="comparison-card">
              <span className="comparison-label">{'Atrasadas'}</span>
              <strong>{comparison.overdue.current}</strong>
              <span
                className={`comparison-delta ${delta(comparison.overdue.current, comparison.overdue.previous).className}`}
              >
                {delta(comparison.overdue.current, comparison.overdue.previous).text}
              </span>
            </div>
            <div className="comparison-card">
              <span className="comparison-label">{'Tiempo medio'}</span>
              <strong>{hoursText(comparison.avgCompletionHours.current)}</strong>
              <span className="comparison-delta flat">
                {`antes ${hoursText(comparison.avgCompletionHours.previous)}`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="overview-workload">
        <p className="section-kicker">{'Carga'}</p>
        <h2>{'Distribución de carga laboral'}</h2>
        {workload.length === 0 ? (
          <p>{'Todavía no hay empleados.'}</p>
        ) : (
          <ul className="workload-distribution">
            {workload.map((entry) => (
              <li key={entry.employee.id}>
                <button
                  type="button"
                  className="workload-bar-button"
                  onClick={() => onNavigate('employees')}
                >
                  <span className="workload-bar-name">
                    {entry.employee.firstName} {entry.employee.lastName}
                  </span>
                  <span className="workload-bar-track">
                    <span className="workload-bar-fill" style={{ width: `${entry.percent}%` }} />
                  </span>
                  <span className="workload-bar-value">{`${String(entry.assignedHours).replace('.', ',')} h`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overview-forecast">
        <p className="section-kicker">{'Pronóstico'}</p>
        <h2>{'Próxima semana'}</h2>
        <div className="forecast-details">
          <span className={`forecast-level forecast-${forecast.level}`}>
            {forecast.level === 'low'
              ? 'Bajo'
              : forecast.level === 'medium'
                ? 'Manejable'
                : forecast.level === 'high'
                  ? 'Exigente'
                  : 'Muy exigente'}
          </span>
          <p className="employee-availability-note">
            {`${forecast.dueCount} tareas vencen en 7 días · ${String(forecast.demandHours).replace('.', ',')} h de demanda sobre ${String(forecast.capacityHours).replace('.', ',')} h de capacidad.`}
          </p>
          <progress max={100} value={forecast.utilizationPercent}>
            {`${forecast.utilizationPercent}%`}
          </progress>
        </div>
      </div>

      {(role === 'organization' || role === 'administrative') && chart.length > 0 && (
        <div className="overview-workload">
          <p className="section-kicker">{'Equipo'}</p>
          <h2>{'Organigrama'}</h2>
          <div className="orgchart">
            <div className="orgchart-root">
              <span className="orgchart-root-label">{'Organización'}</span>
              <small>{`${scopedEmployees.length} personas`}</small>
            </div>
            <span className="orgchart-connector" />
            <div className="orgchart-departments">
              {chart.map((group) => (
                <div key={group.department} className="orgchart-department">
                  <header>
                    <h2>{group.department}</h2>
                    <span>{`${group.members.length + (group.jefe ? 1 : 0)}`}</span>
                  </header>
                  {group.jefe && (
                    <ul className="orgchart-jefe">
                      <li>
                        <button
                          type="button"
                          className="orgchart-person orgchart-person-jefe"
                          aria-label={`Ver perfil de ${group.jefe?.firstName} ${group.jefe?.lastName}`}
                          onClick={() => {
                            if (group.jefe) {
                              onOpenProfile(group.jefe.id);
                            }
                          }}
                        >
                          <span className="avatar">{group.jefe.firstName.slice(0, 1)}</span>
                          <span className="orgchart-person-text">
                            <strong>{`${group.jefe.firstName} ${group.jefe.lastName}`}</strong>
                            <small>{group.jefe.position}</small>
                          </span>
                          <span className="orgchart-jefe-badge">{'Jefe'}</span>
                        </button>
                      </li>
                    </ul>
                  )}
                  <ul className="orgchart-members">
                    {group.members.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          className="orgchart-person"
                          aria-label={`Ver perfil de ${member.firstName} ${member.lastName}`}
                          onClick={() => onOpenProfile(member.id)}
                        >
                          <span className="avatar">{member.firstName.slice(0, 1)}</span>
                          <span>
                            <strong>{`${member.firstName} ${member.lastName}`}</strong>
                            <small>{member.position}</small>
                          </span>
                          {member.availabilityStatus !== 'available' && (
                            <span className="orgchart-availability">
                              {member.availabilityStatus === 'vacation'
                                ? 'Vacaciones'
                                : member.availabilityStatus === 'leave'
                                  ? 'Licencia'
                                  : member.availabilityStatus === 'absent'
                                    ? 'Ausente'
                                    : 'No disponible'}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="recent-activity">
        <h2>{'Actividad reciente'}</h2>
        {activities.length === 0 ? (
          <p>{'Sin actividad todavía'}</p>
        ) : (
          <ul>
            {activities.map((activity) => (
              <li key={activity.id}>{`${activity.message} (${formatDate(activity.createdAt)})`}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
