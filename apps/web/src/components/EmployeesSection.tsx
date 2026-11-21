import { useState, useEffect, type ReactElement } from 'react';
import {
  assignDepartmentLead,
  cancelEmployeeInvitation,
  createDepartment,
  createEmployeeInvitation,
  deleteDepartment,
  fetchDepartments,
  removeDepartmentLead,
  resendEmployeeInvitation,
  type Department,
  type AuthorityLevel,
  type DepartmentLead,
  type EmployeeAvailabilityStatus,
  type EmployeeInvitationView,
  type EmployeeProfile,
  type SessionActor,
  type Task,
} from '../api.js';
import {
  canInviteEmployeesForSession,
  filterAndSortEmployees,
  pendingTaskCount,
  workloadLevel,
  type EmployeeFilters,
} from '../domain.js';
import {
  AUTHORITY_LABELS,
  AVAILABILITY_LABELS,
  EmptyState,
  Modal,
  QuickViewDrawer,
  RemoveDepartmentLeadConfirmation,
} from './ui.js';

export interface EmployeesSectionProps {
  employees: EmployeeProfile[];
  tasks: Task[];
  invitations: EmployeeInvitationView[];
  departmentLeads: DepartmentLead[];
  session: SessionActor | null;
  organizationId: string;
  onRefresh: () => void | Promise<void>;
  onOpenProfile: (employeeId: string) => void;
}

const EMPTY_FILTERS: EmployeeFilters = {
  query: '',
  department: '',
  authority: 'all',
  sort: 'name',
};

interface InviteFormState {
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  authorityLevel: AuthorityLevel;
  skills: string;
  weeklyCapacityHours: string;
  availabilityStatus: EmployeeAvailabilityStatus;
}

const EMPTY_INVITE: InviteFormState = {
  firstName: '',
  lastName: '',
  email: '',
  position: '',
  department: '',
  authorityLevel: 'operative',
  skills: '',
  weeklyCapacityHours: '40',
  availabilityStatus: 'available',
};

export function EmployeesSection({
  employees,
  tasks,
  invitations,
  departmentLeads,
  session,
  organizationId,
  onRefresh,
  onOpenProfile,
}: EmployeesSectionProps): ReactElement {
  const [filters, setFilters] = useState<EmployeeFilters>(EMPTY_FILTERS);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(EMPTY_INVITE);
  const [inviteError, setInviteError] = useState('');
  const [inviteNotice, setInviteNotice] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [quickEmployeeId, setQuickEmployeeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [assignLeadOpen, setAssignLeadOpen] = useState(false);
  const [assignLeadDepartment, setAssignLeadDepartment] = useState('');
  const [assignLeadEmployeeId, setAssignLeadEmployeeId] = useState('');
  const [assignLeadError, setAssignLeadError] = useState('');
  const [assigningLead, setAssigningLead] = useState(false);
  const [leadToRemove, setLeadToRemove] = useState<DepartmentLead | null>(null);
  const [removingLead, setRemovingLead] = useState(false);
  const [removeLeadError, setRemoveLeadError] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);

  const [isDeletingDepartments, setIsDeletingDepartments] = useState(false);
  const [deleteDepartmentsOpen, setDeleteDepartmentsOpen] = useState(false);
  const [viewDepartmentsOpen, setViewDepartmentsOpen] = useState(false);
  const [createDepartmentOpen, setCreateDepartmentOpen] = useState(false);
  const [createDepartmentName, setCreateDepartmentName] = useState('');
  const [createDepartmentError, setCreateDepartmentError] = useState('');
  const [creatingDepartment, setCreatingDepartment] = useState(false);

  const reloadDepartments = async (): Promise<void> => {
    const deps = await fetchDepartments(organizationId);
    setDepartments(deps);
    setSelectedDepartmentIds((current) =>
      current.filter((id) => deps.some((department) => department.id === id)),
    );
  };

  useEffect(() => {
    let cancelled = false;
    fetchDepartments(organizationId).then((deps) => {
      if (!cancelled) {
        setDepartments(deps);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const canInvite = canInviteEmployeesForSession(session);
  const visibleEmployees = filterAndSortEmployees(employees, tasks, filters);
  const departmentNames = Array.from(
    new Set([
      ...departments.map((department) => department.name),
      ...employees.map((employee) => employee.department).filter((name) => name.trim().length > 0),
    ]),
  ).sort();
  const viewerDepartment =
    session?.kind === 'employee'
      ? (employees.find((c) => c.id === session.employeeId)?.department ?? '').trim()
      : '';
  const canViewProfileOf = (employee: EmployeeProfile): boolean => {
    if (!session) {
      return true;
    }
    if (session.kind === 'organization') {
      return true;
    }
    if (session.employeeId === employee.id) {
      return true;
    }
    const employeeDepartment = employee.department.trim();
    return (
      session.authorityLevel === 'administrative' &&
      employee.authorityLevel === 'operative' &&
      employeeDepartment.length > 0 &&
      employeeDepartment === viewerDepartment
    );
  };
  const quickEmployee = quickEmployeeId
    ? (employees.find((employee) => employee.id === quickEmployeeId) ?? null)
    : null;
  const leadToRemoveEmployee = leadToRemove
    ? (employees.find((employee) => employee.id === leadToRemove.employeeId) ?? null)
    : null;
  const leadToRemoveName = leadToRemoveEmployee
    ? `${leadToRemoveEmployee.firstName} ${leadToRemoveEmployee.lastName}`
    : (leadToRemove?.employeeId ?? '');

  const submitInvite = async (): Promise<void> => {
    setInviteError('');
    setInviteNotice('');
    setSendingInvite(true);
    try {
      const result = await createEmployeeInvitation(
        {
          organizationId,
          firstName: inviteForm.firstName,
          lastName: inviteForm.lastName,
          email: inviteForm.email,
          position: inviteForm.position,
          department: inviteForm.department,
          authorityLevel: inviteForm.authorityLevel,
          skills: inviteForm.skills
            .split(',')
            .map((skill) => skill.trim())
            .filter((skill) => skill.length > 0),
          weeklyCapacityHours: Number(inviteForm.weeklyCapacityHours),
          availabilityStatus: inviteForm.availabilityStatus,
        },
        session,
      );
      if (result.status === 'email_sent' && result.employee) {
        setInviteNotice(
          `Invitación enviada a ${result.employee.email}. El código vence en 30 días.`,
        );
        setInviteForm(EMPTY_INVITE);
        setInviteOpen(false);
        await onRefresh();
        return;
      }
      if (result.emailAlreadyExists) {
        setInviteError('El mail ya existe. Por favor ingrese un mail diferente.');
        return;
      }
      if (result.status === 'incomplete') {
        setInviteError('Complete los campos obligatorios.');
        return;
      }
      setInviteError('No se pudo enviar la invitación.');
    } finally {
      setSendingInvite(false);
    }
  };

  const resend = async (invitationId: string): Promise<void> => {
    setActionError('');
    const result = await resendEmployeeInvitation(organizationId, invitationId, session);
    if (result.status === 'email_sent') {
      await onRefresh();
      return;
    }
    setActionError('No se pudo reenviar la invitación.');
  };

  const cancel = async (invitationId: string): Promise<void> => {
    setActionError('');
    const result = await cancelEmployeeInvitation(organizationId, invitationId, session);
    if (result.status === 'cancelled') {
      await onRefresh();
      return;
    }
    setActionError('No se pudo cancelar la invitación.');
  };

  const assignDepartmentLeadHandler = async (): Promise<void> => {
    setAssignLeadError('');
    setAssigningLead(true);
    const result = await assignDepartmentLead(
      organizationId,
      assignLeadDepartment,
      assignLeadEmployeeId,
      session,
    );
    setAssigningLead(false);
    if (result.status === 'assigned') {
      setAssignLeadOpen(false);
      setAssignLeadDepartment('');
      setAssignLeadEmployeeId('');
      await onRefresh();
      return;
    }
    setAssignLeadError(result.reason ?? 'No se pudo asignar el jefe de departamento.');
  };

  const confirmRemoveDepartmentLead = async (): Promise<void> => {
    if (!leadToRemove) {
      return;
    }
    setRemoveLeadError('');
    setRemovingLead(true);
    const result = await removeDepartmentLead(organizationId, leadToRemove.department, session);
    setRemovingLead(false);
    if (result.status === 'removed') {
      setLeadToRemove(null);
      await onRefresh();
      return;
    }
    setRemoveLeadError('No se pudo remover el jefe de departamento.');
  };

  const createDepartmentHandler = async (): Promise<void> => {
    setCreateDepartmentError('');
    const trimmedName = createDepartmentName.trim();
    if (!trimmedName) {
      setCreateDepartmentError(
        'No se puede crear el departamento porque el nombre no está puesto.',
      );
      return;
    }
    setCreatingDepartment(true);
    const result = await createDepartment(organizationId, trimmedName, session);
    setCreatingDepartment(false);
    if (result.status === 'created' && result.department) {
      setCreateDepartmentOpen(false);
      setCreateDepartmentName('');
      await reloadDepartments();
      await onRefresh();
      return;
    }
    if (result.reason === 'duplicate') {
      setCreateDepartmentError('No se pueden crear departamentos con nombres ya existentes.');
      return;
    }
    setCreateDepartmentError('No se pudo crear el departamento.');
  };

  const toggleDepartmentSelection = (departmentId: string): void => {
    setSelectedDepartmentIds((current) =>
      current.includes(departmentId)
        ? current.filter((id) => id !== departmentId)
        : [...current, departmentId],
    );
  };

  const toggleAllDepartments = (): void => {
    setSelectedDepartmentIds((current) =>
      current.length === departments.length ? [] : departments.map((department) => department.id),
    );
  };

  const deleteSelectedDepartments = async (): Promise<void> => {
    if (selectedDepartmentIds.length === 0) {
      return;
    }
    setActionError('');
    setIsDeletingDepartments(true);
    const failures: string[] = [];
    for (const departmentId of selectedDepartmentIds) {
      const result = await deleteDepartment(departmentId, organizationId, session);
      if (result.status !== 'deleted') {
        const department = departments.find((candidate) => candidate.id === departmentId);
        failures.push(department?.name ?? departmentId);
      }
    }
    setIsDeletingDepartments(false);
    await reloadDepartments();
    await onRefresh();
    if (failures.length > 0) {
      setActionError(`No se pudieron eliminar: ${failures.join(', ')}`);
      return;
    }
    setDeleteDepartmentsOpen(false);
    setSelectedDepartmentIds([]);
  };

  return (
    <section>
      <div className="task-toolbar">
        <h1>{'Empleados'}</h1>
        <div className="tasks-header-actions">
          {canInvite && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setInviteError('');
                setInviteNotice('');
                setInviteOpen(true);
              }}
            >
              {'Invitar empleado'}
            </button>
          )}
        </div>
      </div>

      <div className="employee-summary">
        <div>
          <strong>{employees.length}</strong>
          <span>{'empleados activos'}</span>
        </div>
        <p>
          {`${invitations.filter((invitation) => invitation.status === 'pending').length} invitaciones pendientes.`}
        </p>
      </div>

      {inviteNotice && <p className="validation-alert">{inviteNotice}</p>}
      {actionError && <p className="validation-alert">{actionError}</p>}

      {canInvite && (
        <div className="department-leads-section">
          <h2>{'Jefes de departamento'}</h2>
          {departmentLeads.length === 0 ? (
            <p>{'Todavía no hay jefes de departamento asignados.'}</p>
          ) : (
            <ul className="department-leads-list">
              {departmentLeads.map((lead) => {
                const employee = employees.find((e) => e.id === lead.employeeId);
                return (
                  <li key={`${lead.organizationId}|${lead.department}`}>
                    <strong>{lead.department}</strong>
                    <span>
                      {employee ? `${employee.firstName} ${employee.lastName}` : lead.employeeId}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Remover jefe de ${lead.department}`}
                      onClick={() => {
                        setRemoveLeadError('');
                        setLeadToRemove(lead);
                      }}
                    >
                      {'Remover'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setAssignLeadError('');
              setAssignLeadOpen(true);
            }}
          >
            {'Asignar jefe de departamento'}
          </button>
        </div>
      )}

      {canInvite && (
        <div className="departments-section">
          <h2>{'Departamentos'}</h2>
          <div className="department-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setCreateDepartmentError('');
                setCreateDepartmentOpen(true);
              }}
            >
              {'Crear departamento'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setViewDepartmentsOpen(true);
              }}
              disabled={departments.length === 0}
            >
              {'Ver departamentos'}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                setActionError('');
                setSelectedDepartmentIds([]);
                setDeleteDepartmentsOpen(true);
              }}
              disabled={departments.length === 0}
            >
              {'Eliminar departamentos'}
            </button>
          </div>
        </div>
      )}

      <div className="employee-filters">
        <div>
          <label htmlFor="employee-search">{'Buscar'}</label>
          <input
            id="employee-search"
            type="search"
            value={filters.query}
            placeholder="Nombre o apellido"
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="employee-department">{'Departamento'}</label>
          <select
            id="employee-department"
            value={filters.department}
            onChange={(event) => setFilters({ ...filters, department: event.target.value })}
          >
            <option value="">{'Todos'}</option>
            {departmentNames.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="employee-authority">{'Nivel'}</label>
          <select
            id="employee-authority"
            value={filters.authority}
            onChange={(event) =>
              setFilters({
                ...filters,
                authority: event.target.value as EmployeeFilters['authority'],
              })
            }
          >
            <option value="all">{'Todos'}</option>
            <option value="administrative">{AUTHORITY_LABELS.administrative}</option>
            <option value="operative">{AUTHORITY_LABELS.operative}</option>
          </select>
        </div>
        <div>
          <label htmlFor="employee-sort">{'Ordenar'}</label>
          <select
            id="employee-sort"
            value={filters.sort}
            onChange={(event) =>
              setFilters({ ...filters, sort: event.target.value as EmployeeFilters['sort'] })
            }
          >
            <option value="name">{'A-Z'}</option>
            <option value="pending">{'Más pendientes'}</option>
          </select>
        </div>
      </div>

      {visibleEmployees.length === 0 ? (
        employees.length > 0 ? (
          <EmptyState
            title={'Sin resultados'}
            description={'Ningún empleado coincide con la búsqueda o los filtros actuales.'}
            actionLabel={'Limpiar filtros'}
            onAction={() => setFilters(EMPTY_FILTERS)}
          />
        ) : (
          <EmptyState
            title={'Todavía no hay empleados.'}
            description={'Invitá al equipo para ver perfiles, habilidades y carga de trabajo.'}
            actionLabel={canInvite ? 'Invitar empleado' : undefined}
            onAction={
              canInvite
                ? () => {
                    setInviteError('');
                    setInviteNotice('');
                    setInviteOpen(true);
                  }
                : undefined
            }
          />
        )
      ) : (
        <div className="employee-grid">
          {visibleEmployees.map((employee) => {
            return (
              <div key={employee.id} className="employee-card">
                <button
                  type="button"
                  className="employee-profile-button"
                  disabled={!canViewProfileOf(employee)}
                  onClick={() => onOpenProfile(employee.id)}
                >
                  <span className="avatar">{employee.firstName.slice(0, 1)}</span>
                  <span className="employee-identity">
                    <strong className="employee-name">
                      {employee.firstName} {employee.lastName}
                    </strong>
                    <span className="employee-position">{employee.position}</span>
                  </span>
                </button>
                <h2>{employee.department.trim() || 'Sin departamento'}</h2>
                <p>{AUTHORITY_LABELS[employee.authorityLevel]}</p>
                {canViewProfileOf(employee) && (
                  <button
                    type="button"
                    className="text-button quick-view-link"
                    aria-label={`Vista rápida de ${employee.firstName} ${employee.lastName}`}
                    onClick={() => setQuickEmployeeId(employee.id)}
                  >
                    {'Vista rápida'}
                  </button>
                )}
                <ul className="skills-list">
                  {employee.skills.slice(0, 4).map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {invitations.length > 0 && (
        <div className="invitations-section">
          <div className="workload-legend" aria-label="Referencia de carga">
            <span className="workload-legend-item">
              <span className="workload-dot workload-dot-low" />
              {'Baja carga'}
            </span>
            <span className="workload-legend-item">
              <span className="workload-dot workload-dot-medium" />
              {'Carga intermedia'}
            </span>
            <span className="workload-legend-item">
              <span className="workload-dot workload-dot-high" />
              {'Alta carga'}
            </span>
          </div>
          <div className="invitations-table-wrapper">
            <table className="invitations-table">
              <thead>
                <tr>
                  <th>{'Empleado'}</th>
                  <th>{'Estado'}</th>
                  <th>{'Carga'}</th>
                  <th>{'Fecha de envío'}</th>
                  <th>{'Vencimiento'}</th>
                  <th>{'Acción'}</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const pendingCount = pendingTaskCount(tasks, invitation.id);
                  const level = workloadLevel(pendingCount);
                  return (
                    <tr key={invitation.id}>
                      <td>
                        <strong>{`${invitation.firstName} ${invitation.lastName}`}</strong>
                        <br />
                        {invitation.email}
                      </td>
                      <td>{invitation.status === 'accepted' ? 'Aceptada' : 'Pendiente'}</td>
                      <td>
                        <span
                          className={`workload-dot workload-dot-${level.tone}`}
                          role="img"
                          aria-label={`Carga ${level.label.toLowerCase()}`}
                          title={`Carga ${level.label.toLowerCase()}`}
                        />
                      </td>
                      <td>{new Date(invitation.sentAt).toLocaleDateString('es-ES')}</td>
                      <td>{new Date(invitation.expiresAt).toLocaleDateString('es-ES')}</td>
                      <td>
                        {invitation.status === 'accepted' ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onOpenProfile(invitation.id)}
                          >
                            {'Ver perfil'}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void resend(invitation.id)}
                            >
                              {'Reenviar'}
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => void cancel(invitation.id)}
                            >
                              {'Cancelar'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inviteOpen && (
        <Modal title="Invitar empleado" onClose={() => setInviteOpen(false)}>
          <div className="form-columns">
            <div>
              <label htmlFor="invite-first-name">{'Nombre *'}</label>
              <input
                id="invite-first-name"
                type="text"
                value={inviteForm.firstName}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, firstName: event.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="invite-last-name">{'Apellido *'}</label>
              <input
                id="invite-last-name"
                type="text"
                value={inviteForm.lastName}
                onChange={(event) => setInviteForm({ ...inviteForm, lastName: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="invite-email">{'Mail *'}</label>
              <input
                id="invite-email"
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="invite-position">{'Puesto *'}</label>
              <input
                id="invite-position"
                type="text"
                value={inviteForm.position}
                onChange={(event) => setInviteForm({ ...inviteForm, position: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="invite-department">{'Departamento'}</label>
              <select
                id="invite-department"
                value={inviteForm.department}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, department: event.target.value })
                }
              >
                <option value="">Sin departamento</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="invite-authority">{'Nivel de Autoridad'}</label>
              <select
                id="invite-authority"
                value={inviteForm.authorityLevel}
                onChange={(event) =>
                  setInviteForm({
                    ...inviteForm,
                    authorityLevel: event.target.value as AuthorityLevel,
                  })
                }
              >
                <option value="administrative">{AUTHORITY_LABELS.administrative}</option>
                <option value="operative">{AUTHORITY_LABELS.operative}</option>
              </select>
            </div>
            <div>
              <label htmlFor="invite-capacity">{`Capacidad semanal (horas)`}</label>
              <input
                id="invite-capacity"
                type="number"
                min={0}
                value={inviteForm.weeklyCapacityHours}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, weeklyCapacityHours: event.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="invite-availability">{'Disponibilidad'}</label>
              <select
                id="invite-availability"
                value={inviteForm.availabilityStatus}
                onChange={(event) =>
                  setInviteForm({
                    ...inviteForm,
                    availabilityStatus: event.target.value as EmployeeAvailabilityStatus,
                  })
                }
              >
                {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="invite-skills">{'Habilidades (separadas por coma)'}</label>
          <input
            id="invite-skills"
            type="text"
            value={inviteForm.skills}
            onChange={(event) => setInviteForm({ ...inviteForm, skills: event.target.value })}
          />
          {inviteError && <p className="validation-alert">{inviteError}</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setInviteOpen(false)}>
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void submitInvite()}
              disabled={sendingInvite}
            >
              {sendingInvite ? 'Enviando…' : 'Enviar invitación'}
            </button>
          </div>
        </Modal>
      )}

      {assignLeadOpen && canInvite && (
        <Modal title="Asignar jefe de departamento" onClose={() => setAssignLeadOpen(false)}>
          <div className="form-columns">
            <div>
              <label htmlFor="assign-lead-department">{'Departamento'}</label>
              <select
                id="assign-lead-department"
                value={assignLeadDepartment}
                onChange={(event) => setAssignLeadDepartment(event.target.value)}
              >
                <option value="">Seleccionar departamento</option>
                {departmentNames.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-lead-employee">{'Empleado administrativo'}</label>
              <select
                id="assign-lead-employee"
                value={assignLeadEmployeeId}
                onChange={(event) => setAssignLeadEmployeeId(event.target.value)}
              >
                <option value="">Seleccionar empleado</option>
                {employees
                  .filter((employee) => employee.authorityLevel === 'administrative')
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {`${employee.firstName} ${employee.lastName}`}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {assignLeadError && <p className="validation-alert">{assignLeadError}</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setAssignLeadOpen(false)}>
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void assignDepartmentLeadHandler()}
              disabled={assigningLead || !assignLeadDepartment || !assignLeadEmployeeId}
            >
              {assigningLead ? 'Asignando…' : 'Asignar'}
            </button>
          </div>
        </Modal>
      )}

      {viewDepartmentsOpen && canInvite && (
        <Modal title="Departamentos creados" onClose={() => setViewDepartmentsOpen(false)}>
          <p>{'Estos son los departamentos creados hasta ahora.'}</p>
          {departments.length === 0 ? (
            <p>{'Todavía no hay departamentos creados.'}</p>
          ) : (
            <ul className="departments-list">
              {departments.map((department) => (
                <li key={department.id} className="department-list-item">
                  <strong>{department.name}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setViewDepartmentsOpen(false)}>
              {'Cerrar'}
            </button>
          </div>
        </Modal>
      )}

      {createDepartmentOpen && canInvite && (
        <Modal title="Crear departamento" onClose={() => setCreateDepartmentOpen(false)}>
          <div className="form-columns">
            <label htmlFor="create-department-name">{'Nombre del departamento *'}</label>
            <input
              id="create-department-name"
              type="text"
              value={createDepartmentName}
              onChange={(event) => {
                setCreateDepartmentError('');
                setCreateDepartmentName(event.target.value);
              }}
            />
          </div>
          {createDepartmentError && <p className="validation-alert">{createDepartmentError}</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setCreateDepartmentOpen(false)}>
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void createDepartmentHandler()}
              disabled={creatingDepartment}
            >
              {creatingDepartment ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </Modal>
      )}

      {deleteDepartmentsOpen && canInvite && (
        <Modal title="Eliminar departamentos" onClose={() => setDeleteDepartmentsOpen(false)}>
          <p>{'Seleccione los departamentos que desea eliminar.'}</p>
          <label htmlFor="select-all-departments" className="department-select-all">
            <input
              id="select-all-departments"
              type="checkbox"
              checked={
                departments.length > 0 && selectedDepartmentIds.length === departments.length
              }
              onChange={toggleAllDepartments}
            />
            {'Seleccionar todos'}
          </label>
          <ul className="departments-list">
            {departments.map((department) => (
              <li key={department.id} className="department-list-item">
                <label htmlFor={`department-select-${department.id}`}>
                  <input
                    id={`department-select-${department.id}`}
                    type="checkbox"
                    checked={selectedDepartmentIds.includes(department.id)}
                    onChange={() => toggleDepartmentSelection(department.id)}
                  />
                  <strong>{department.name}</strong>
                </label>
              </li>
            ))}
          </ul>
          {actionError && <p className="validation-alert">{actionError}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              onClick={() => setDeleteDepartmentsOpen(false)}
            >
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => void deleteSelectedDepartments()}
              disabled={selectedDepartmentIds.length === 0 || isDeletingDepartments}
            >
              {isDeletingDepartments
                ? 'Eliminando…'
                : `Eliminar departamentos (${selectedDepartmentIds.length})`}
            </button>
          </div>
        </Modal>
      )}

      {quickEmployee && (
        <QuickViewDrawer
          eyebrow={'Vista rápida de empleado'}
          title={`${quickEmployee.firstName} ${quickEmployee.lastName}`}
          description={quickEmployee.position}
          tags={quickEmployee.skills.slice(0, 5)}
          fields={[
            { label: 'Departamento', value: quickEmployee.department.trim() || 'Sin departamento' },
            { label: 'Nivel', value: AUTHORITY_LABELS[quickEmployee.authorityLevel] },
            {
              label: 'Disponibilidad',
              value: AVAILABILITY_LABELS[quickEmployee.availabilityStatus],
            },
            {
              label: 'Carga semanal',
              value: `${quickEmployee.weeklyCapacityHours} h`,
            },
            {
              label: 'Carga actual',
              value: workloadLevel(pendingTaskCount(tasks, quickEmployee.id)).label,
            },
            {
              label: 'Ingreso',
              value: quickEmployee.joinedAt
                ? new Date(quickEmployee.joinedAt).toLocaleDateString('es-ES')
                : 'Sin fecha',
            },
          ]}
          onClose={() => setQuickEmployeeId(null)}
          onOpenFull={() => {
            onOpenProfile(quickEmployee.id);
            setQuickEmployeeId(null);
          }}
          fullLabel={'Ver perfil completo'}
        />
      )}

      {leadToRemove && (
        <RemoveDepartmentLeadConfirmation
          lead={leadToRemove}
          employeeName={leadToRemoveName}
          isRemoving={removingLead}
          error={removeLeadError}
          onCancel={() => {
            setRemoveLeadError('');
            setLeadToRemove(null);
          }}
          onConfirm={() => void confirmRemoveDepartmentLead()}
        />
      )}
    </section>
  );
}
