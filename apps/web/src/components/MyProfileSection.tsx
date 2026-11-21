import { useEffect, useState, type ReactElement } from 'react';
import type { Department, EmployeeProfile, Task, TaskActivity } from '../api.js';
import { AUTHORITY_LABELS, AVAILABILITY_LABELS, Modal } from './ui.js';
import { isTaskOverdue } from '../domain.js';

export interface MyProfileSectionProps {
  employee: EmployeeProfile;
  tasks: Task[];
  activities: TaskActivity[];
  isSelf?: boolean;
  isOwner?: boolean;
  departments?: Department[];
  onAssignDepartment?: (employeeId: string, department: string) => Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  onBack: () => void;
}

export function MyProfileSection({
  employee,
  tasks,
  activities,
  isSelf = false,
  isOwner = false,
  departments = [],
  onAssignDepartment,
  onDeleteAccount,
  onBack,
}: MyProfileSectionProps): ReactElement {
  const [departmentSelection, setDepartmentSelection] = useState(employee.department);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [departmentMessage, setDepartmentMessage] = useState('');
  const [departmentError, setDepartmentError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setDepartmentSelection(employee.department);
    setDepartmentMessage('');
    setDepartmentError('');
  }, [employee.id, employee.department]);
  const employeeTasks = tasks.filter((task) => task.ownerId === employee.id);
  const pending = employeeTasks.filter((task) => task.status === 'pending');
  const inProgress = employeeTasks.filter((task) => task.status === 'in_progress');
  const completed = employeeTasks.filter((task) => task.status === 'completed');
  const overdue = employeeTasks.filter((task) => isTaskOverdue(task, Date.now()));
  const employeeActivity = activities
    .filter((activity) => activity.actorEmployeeId === employee.id)
    .slice(0, 8);

  const saveDepartment = async (): Promise<void> => {
    if (!onAssignDepartment) {
      return;
    }
    setSavingDepartment(true);
    setDepartmentError('');
    setDepartmentMessage('');
    try {
      await onAssignDepartment(employee.id, departmentSelection);
      setDepartmentMessage('Departamento actualizado correctamente.');
    } catch {
      setDepartmentError('No se pudo actualizar el departamento. Inténtelo nuevamente.');
    } finally {
      setSavingDepartment(false);
    }
  };

  const confirmDeleteAccount = async (): Promise<void> => {
    if (!onDeleteAccount) {
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteAccount();
    } catch {
      setDeleteError('No se pudo eliminar la cuenta. Inténtelo nuevamente.');
      setDeleting(false);
    }
  };

  const deleteLabel = isSelf ? 'Eliminar mi cuenta' : 'Eliminar cuenta del empleado';
  const deleteHelp = isSelf
    ? 'Al eliminar tu cuenta se cerrará tu sesión y tus tareas activas quedarán sin asignar.'
    : 'Al eliminar la cuenta de este empleado, sus tareas activas quedarán sin asignar.';
  const deleteQuestion = isSelf
    ? '¿Está seguro de querer eliminar su cuenta? Esta acción no se puede deshacer.'
    : `¿Está seguro de querer eliminar la cuenta de ${employee.firstName} ${employee.lastName}? Esta acción no se puede deshacer.`;

  return (
    <section className="profile-page">
      <button type="button" className="button profile-back" onClick={onBack}>
        {'← Volver'}
      </button>

      <div className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {employee.firstName.slice(0, 1).toUpperCase()}
        </span>
        <div className="profile-hero-text">
          <p className="profile-kicker">{isSelf ? 'Mi perfil' : 'Perfil'}</p>
          <h1>{`${employee.firstName} ${employee.lastName}`}</h1>
          <p className="profile-position">{employee.position}</p>
          <div className="profile-badges">
            <span className="profile-badge">{AUTHORITY_LABELS[employee.authorityLevel]}</span>
            <span className="profile-badge">
              {employee.department.trim() || 'Sin departamento'}
            </span>
            <span className="profile-badge">
              {AVAILABILITY_LABELS[employee.availabilityStatus]}
            </span>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <article className="profile-card">
          <h2>{'Información'}</h2>
          <ul className="profile-detail-list">
            <li>
              <span>{'Correo'}</span>
              <strong>{employee.email}</strong>
            </li>
            <li>
              <span>{'Puesto'}</span>
              <strong>{employee.position}</strong>
            </li>
            <li>
              <span>{'Departamento'}</span>
              <strong>{employee.department.trim() || 'Sin departamento'}</strong>
            </li>
            <li>
              <span>{'Nivel'}</span>
              <strong>{AUTHORITY_LABELS[employee.authorityLevel]}</strong>
            </li>
            <li>
              <span>{'Disponibilidad'}</span>
              <strong>{AVAILABILITY_LABELS[employee.availabilityStatus]}</strong>
            </li>
            <li>
              <span>{'Capacidad semanal'}</span>
              <strong>{`${employee.weeklyCapacityHours} h`}</strong>
            </li>
            <li>
              <span>{'Incorporación'}</span>
              <strong>
                {employee.joinedAt
                  ? new Date(employee.joinedAt).toLocaleDateString('es-ES')
                  : 'Pendiente'}
              </strong>
            </li>
          </ul>
        </article>

        <article className="profile-card">
          <h2>{'Resumen de tareas'}</h2>
          <div className="profile-stats">
            <div>
              <strong>{pending.length}</strong>
              <span>{'Pendientes'}</span>
            </div>
            <div>
              <strong>{inProgress.length}</strong>
              <span>{'En progreso'}</span>
            </div>
            <div>
              <strong>{completed.length}</strong>
              <span>{'Completadas'}</span>
            </div>
            <div>
              <strong>{overdue.length}</strong>
              <span>{'Vencidas'}</span>
            </div>
          </div>
        </article>

        <article className="profile-card">
          <h2>{'Habilidades'}</h2>
          {employee.skills.length === 0 ? (
            <p>{'Sin habilidades registradas'}</p>
          ) : (
            <ul className="skills-list">
              {employee.skills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="profile-card">
          <h2>{'Actividad reciente'}</h2>
          {employeeActivity.length === 0 ? (
            <p>{'Sin actividad todavía'}</p>
          ) : (
            <ul className="profile-activity">
              {employeeActivity.map((activity) => (
                <li key={activity.id}>{activity.message}</li>
              ))}
            </ul>
          )}
        </article>

        {isOwner && onAssignDepartment && (
          <article className="profile-card profile-assign-card">
            <h2>{'Asignar a departamento'}</h2>
            <p className="profile-assign-help">
              {
                'Elegí el departamento al que pertenecerá este empleado. El cambio se reflejará en su perfil y en el organigrama.'
              }
            </p>
            <label htmlFor="profile-assign-department">{'Departamento'}</label>
            <select
              id="profile-assign-department"
              value={departmentSelection}
              onChange={(event) => {
                setDepartmentSelection(event.target.value);
                setDepartmentMessage('');
                setDepartmentError('');
              }}
            >
              <option value="">{'Sin departamento'}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
            {departmentError && <p className="validation-alert">{departmentError}</p>}
            {departmentMessage && <p className="profile-assign-success">{departmentMessage}</p>}
            <div className="profile-assign-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => void saveDepartment()}
                disabled={savingDepartment || departmentSelection === employee.department}
              >
                {savingDepartment ? 'Guardando…' : 'Guardar departamento'}
              </button>
            </div>
          </article>
        )}

        {onDeleteAccount && (
          <article className="profile-card profile-danger-card">
            <h2>{'Eliminar cuenta'}</h2>
            <p className="profile-danger-help">{deleteHelp}</p>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                setDeleteError('');
                setDeleteOpen(true);
              }}
            >
              {deleteLabel}
            </button>
          </article>
        )}
      </div>

      {deleteOpen && (
        <Modal title={deleteLabel} onClose={() => setDeleteOpen(false)}>
          <p>{deleteQuestion}</p>
          {deleteError && <p className="validation-alert">{deleteError}</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setDeleteOpen(false)}>
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => void confirmDeleteAccount()}
              disabled={deleting}
            >
              {deleting ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
