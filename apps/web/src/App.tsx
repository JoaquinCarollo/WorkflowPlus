import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  deleteEmployeeAccount,
  fetchActivities,
  fetchCategories,
  fetchDepartments,
  fetchDepartmentLeads,
  fetchInvitations,
  fetchJoinedEmployees,
  fetchTasks,
  registerOrganization,
  requestPasswordRecovery,
  resetPassword,
  signInEmployee,
  signInOrganization,
  updateEmployeeProfile,
  type Department,
  type DepartmentLead,
  type EmployeeInvitationView,
  type EmployeeProfile,
  type SessionActor,
  type Task,
  type TaskActivity,
} from './api.js';
import { EmployeesSection } from './components/EmployeesSection.js';
import { HelpSection } from './components/HelpSection.js';
import { EmptyState, Modal, WorkspaceSkeleton } from './components/ui.js';
import { MyProfileSection } from './components/MyProfileSection.js';
import { OverviewSection } from './components/OverviewSection.js';
import {
  clearActiveSession,
  clearStoredSession,
  loadStoredSession,
  loadUiState,
  storeSession,
  storeUiState,
  uiScopeKey,
  type StoredDensity,
  type StoredTheme,
} from './session-storage.js';
import { TasksSection } from './components/TasksSection.js';

export * from './domain.js';
export { DeleteEmployeeConfirmation } from './components/ui.js';

export interface AppProps {
  session?: SessionActor | null;
  organizationId?: string;
}

type AuthRole = 'organization' | 'employee';
type AuthMode = 'signin' | 'register';
type Section = 'overview' | 'tasks' | 'employees' | 'profile' | 'help';

export function clearAccessUrl(): void {
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    return;
  }
}

const ORGANIZATION_TYPES = [
  'Tecnología',
  'Servicios',
  'Comercio',
  'Salud',
  'Educación',
  'Industria',
  'Otro',
];

export function App({
  session: initialSession = null,
  organizationId: initialOrganizationId = '',
}: AppProps = {}): ReactElement {
  const accessRequestedByUrl = (): boolean => {
    try {
      return new URLSearchParams(window.location.search).get('page') === 'login';
    } catch {
      return false;
    }
  };

  const storedSession = accessRequestedByUrl() ? null : loadStoredSession();
  const initialOrgId = initialOrganizationId || storedSession?.organizationId || '';
  const initialUiScope = uiScopeKey(initialSession ?? storedSession?.session ?? null, initialOrgId);
  const initialUi = loadUiState(initialUiScope, initialOrgId);

  const [session, setSession] = useState<SessionActor | null>(
    () => initialSession ?? storedSession?.session ?? null,
  );
  const [organizationId, setOrganizationId] = useState(() => initialOrgId);
  const uiScope = uiScopeKey(session, organizationId);
  const [accessOpen, setAccessOpen] = useState(false);
  const [authRole, setAuthRole] = useState<AuthRole>('organization');
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(() => initialUi?.section ?? 'overview');
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(
    () => initialUi?.profileEmployeeId ?? null,
  );
  const [theme, setTheme] = useState<StoredTheme>(() => initialUi?.theme ?? 'light');
  const [density, setDensity] = useState<StoredDensity>(() => initialUi?.density ?? 'comfortable');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const sectionsToggleRef = useRef<HTMLButtonElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [invitations, setInvitations] = useState<EmployeeInvitationView[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentLeads, setDepartmentLeads] = useState<DepartmentLead[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPassword, setOrgPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [organizationType, setOrganizationType] = useState(ORGANIZATION_TYPES[0]);
  const [description, setDescription] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  const closeMenus = (): void => {
    setMenuOpen(false);
    setSectionsOpen(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setResetToken(token);
      setAccessOpen(true);
      return;
    }
    if (params.get('page') === 'login') {
      const role = params.get('role');
      clearActiveSession();
      setSession(null);
      setOrganizationId('');
      setTasks([]);
      setEmployees([]);
      setActivities([]);
      setInvitations([]);
      setDepartments([]);
      setDepartmentLeads([]);
      setCategories([]);
      setAccessOpen(true);
      if (role === 'employee') {
        setAuthRole('employee');
      }
    }
  }, []);

  useEffect(() => {
    storeUiState(uiScope, { section, profileEmployeeId, theme, density, organizationId });
  }, [section, profileEmployeeId, theme, density, organizationId, uiScope]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    if (!sectionsOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSectionsOpen(false);
        sectionsToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sectionsOpen]);

  useEffect(() => {
    if (!sectionsOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      if (!sectionsRef.current?.contains(event.target as Node)) {
        setSectionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [sectionsOpen]);

  useEffect(() => {
    if (!session || !organizationId) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setLoadError(false);
      setTasks([]);
      setEmployees([]);
      setActivities([]);
      setInvitations([]);
      setDepartmentLeads([]);
      try {
        const [
          tasksResult,
          employeesResult,
          activitiesResult,
          invitationsResult,
          categoriesResult,
          departmentsResult,
          leadsResult,
        ] = await Promise.all([
          fetchTasks(organizationId),
          fetchJoinedEmployees(organizationId),
          fetchActivities(organizationId, 'all'),
          fetchInvitations(organizationId),
          fetchCategories(organizationId),
          fetchDepartments(organizationId),
          fetchDepartmentLeads(organizationId).catch(() => [] as DepartmentLead[]),
        ]);

        if (cancelled) {
          return;
        }
        setTasks(tasksResult);
        setEmployees(employeesResult);
        setActivities(activitiesResult);
        setInvitations(invitationsResult);
        setCategories(categoriesResult);
        setDepartments(departmentsResult);
        setDepartmentLeads(leadsResult);
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, organizationId, reloadCount]);

  const selfEmployee =
    session?.kind === 'employee'
      ? (employees.find((candidate) => candidate.id === session.employeeId) ?? null)
      : null;
  const profileEmployee = profileEmployeeId
    ? (employees.find((candidate) => candidate.id === profileEmployeeId) ?? null)
    : null;
  const isSelfProfile =
    profileEmployee !== null &&
    session?.kind === 'employee' &&
    session.employeeId === profileEmployee.id;

  const refresh = async (): Promise<void> => {
    if (!organizationId) {
      return;
    }
    const [
      tasksResult,
      employeesResult,
      activitiesResult,
      invitationsResult,
      categoriesResult,
      departmentsResult,
      leadsResult,
    ] = await Promise.all([
      fetchTasks(organizationId),
      fetchJoinedEmployees(organizationId),
      fetchActivities(organizationId, 'all'),
      fetchInvitations(organizationId),
      fetchCategories(organizationId),
      fetchDepartments(organizationId),
      fetchDepartmentLeads(organizationId).catch(() => [] as DepartmentLead[]),
    ]);
    setTasks(tasksResult);
    setEmployees(employeesResult);
    setActivities(activitiesResult);
    setInvitations(invitationsResult);
    setCategories(categoriesResult);
    setDepartments(departmentsResult);
    setDepartmentLeads(leadsResult);
  };

  const assignDepartmentForEmployee = async (
    employeeId: string,
    department: string,
  ): Promise<void> => {
    const result = await updateEmployeeProfile(employeeId, { organizationId, department }, session);
    if (result.status !== 'updated') {
      throw new Error('No se pudo actualizar el departamento');
    }
    await refresh();
  };

  const applyStoredUiForSession = (nextSession: SessionActor, nextOrganizationId: string): void => {
    const stored = loadUiState(uiScopeKey(nextSession, nextOrganizationId), nextOrganizationId);
    setSection(stored?.section ?? 'overview');
    setProfileEmployeeId(null);
    setDensity(stored?.density ?? 'comfortable');
    setTheme(stored?.theme ?? 'light');
  };

  const handleOrganizationSignIn = async (): Promise<void> => {
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    try {
      const result = await signInOrganization({ email: orgEmail, password: orgPassword });
      if (result.status === 'approved' && result.userId) {
        setOrganizationId(result.userId);
        applyStoredUiForSession({ kind: 'organization' }, result.userId);
        setSession({ kind: 'organization' });
        storeSession({ session: { kind: 'organization' }, organizationId: result.userId });
        setAccessOpen(false);
        setOrgPassword('');
      } else {
        setAuthError(
          'El mail o contraseña que introdujo no son los correctos. Por favor introduzca los indicados',
        );
      }
    } catch {
      setAuthError('No se pudo iniciar sesión. Inténtelo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrganizationRegister = async (): Promise<void> => {
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    try {
      const result = await registerOrganization({
        companyName,
        email: orgEmail,
        password: orgPassword,
        organizationType,
        description,
      });
      if (result.status === 'approved' && result.userId) {
        setOrganizationId(result.userId);
        applyStoredUiForSession({ kind: 'organization' }, result.userId);
        setSession({ kind: 'organization' });
        storeSession({ session: { kind: 'organization' }, organizationId: result.userId });
        setAccessOpen(false);
        setOrgPassword('');
      } else if (result.status === 'email_sent') {
        setAuthNotice('Revisa tu correo para confirmar la cuenta antes de iniciar sesión.');
      } else if (result.status === 'incomplete') {
        setAuthError('Complete todos los campos obligatorios.');
      } else {
        setAuthError(
          'El mail o contraseña que usted introdujo ya existe. Por favor ingrese un mail y/o contraseña diferentes',
        );
      }
    } catch {
      setAuthError('No se pudo registrar la organización. Inténtelo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmployeeSignIn = async (): Promise<void> => {
    setAuthError('');
    setSubmitting(true);
    try {
      const result = await signInEmployee({
        accessCode: employeeCode,
      });
      if (result.status === 'approved' && result.employee) {
        const employeeSession = {
          kind: 'employee' as const,
          employeeId: result.employee.id,
          authorityLevel: result.employee.authorityLevel,
        };
        setOrganizationId(result.employee.organizationId);
        applyStoredUiForSession(employeeSession, result.employee.organizationId);
        setSession(employeeSession);
        storeSession({ session: employeeSession, organizationId: result.employee.organizationId });
        clearAccessUrl();
        setAccessOpen(false);
        setEmployeeCode('');
      } else {
        setAuthError('El código de acceso no es válido o pertenece a otra organización.');
      }
    } catch {
      setAuthError('No se pudo iniciar sesión. Inténtelo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (): Promise<void> => {
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    try {
      await requestPasswordRecovery({ email: recoveryEmail });
      setAuthNotice(
        'Si el mail está registrado, recibirás un enlace para recuperar tu contraseña.',
      );
    } catch {
      setAuthError('No se pudo solicitar la recuperación. Inténtelo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    if (!resetToken) {
      return;
    }
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    try {
      const result = await resetPassword({
        email: resetEmail,
        token: resetToken,
        newPassword: resetPasswordValue,
      });
      if (result.status === 'approved') {
        setAuthNotice('Contraseña actualizada. Ya podés iniciar sesión.');
        setResetToken(null);
        setResetPasswordValue('');
        setAuthRole('organization');
        setAuthMode('signin');
      } else if (result.reason === 'password_reused') {
        setAuthError('La nueva contraseña no puede ser igual a la anterior.');
      } else if (result.reason === 'email_mismatch') {
        setAuthError('El correo no coincide con el enlace de recuperación.');
      } else {
        setAuthError('El enlace no es válido o ya fue utilizado.');
      }
    } catch {
      setAuthError('No se pudo actualizar la contraseña. Inténtelo nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const performSignOut = (): void => {
    clearStoredSession(uiScope);
    setSession(null);
    setOrganizationId('');
    setTasks([]);
    setEmployees([]);
    setActivities([]);
    setInvitations([]);
    setCategories([]);
    setDepartmentLeads([]);
    setSection('overview');
    setProfileEmployeeId(null);
    setTheme('light');
    setDensity('comfortable');
    closeMenus();
    setSignOutConfirmOpen(false);
  };

  const deleteOwnAccount = async (): Promise<void> => {
    if (session?.kind !== 'employee' || !session.employeeId) {
      return;
    }
    const result = await deleteEmployeeAccount(organizationId, session.employeeId, session, {
      mode: 'unassign',
    });
    if (result.status !== 'deleted') {
      throw new Error('No se pudo eliminar la cuenta del empleado.');
    }
    performSignOut();
  };

  const deleteProfileEmployee = async (): Promise<void> => {
    if (session?.kind !== 'organization' || !profileEmployee) {
      return;
    }
    const result = await deleteEmployeeAccount(organizationId, profileEmployee.id, session, {
      mode: 'unassign',
    });
    if (result.status !== 'deleted') {
      throw new Error('No se pudo eliminar la cuenta del empleado.');
    }
    setProfileEmployeeId(null);
    setSection('employees');
    await refresh();
  };

  const signOut = (): void => {
    setSignOutConfirmOpen(true);
  };

  const publicHome = (onAccess: () => void): ReactElement => (
    <main className="site-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={onAccess}>
          <span className="brand-mark">W</span>
          <span className="brand-ai">WorkflowPlus</span>
        </button>
      </header>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="section-kicker">{'Trabajo en equipo'}</p>
          <h1>{'Haz que el trabajo'}</h1>
          <p className="hero-text">
            {
              'La gestion colaborativa del trabajo en equipo: asigna, prioriza y da seguimiento en una sola vista.'
            }
          </p>
          <div className="hero-actions">
            <button type="button" className="button button-primary" onClick={onAccess}>
              {'Acceder o registrarse'}
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <p className="panel-heading">{'En vivo'}</p>
          <div className="pulse-row">
            <strong>{'WorkFlowPlus'}</strong>
            <span>{'el trabajo de tu equipo en una sola vista'}</span>
          </div>
          <div className="pulse-chart">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="about-section">
        <article>
          <h2>{'Quiénes somos'}</h2>
          <p>
            {
              'Somos un equipo dedicado a ayudar a organizaciones y equipos a convertir el trabajo en una operacion clara y ejecutable.'
            }
          </p>
        </article>
        <article>
          <h2>{'Nuestro objetivo'}</h2>
          <p>
            {'Que cada tarea tenga un responsable, una prioridad y un horizonte de entrega real.'}
          </p>
        </article>
        <article>
          <h2>{'A qué nos dedicamos'}</h2>
          <p>
            {
              'A construir herramientas simples para equipos que ya no quieren perder el control del trabajo asignado.'
            }
          </p>
        </article>
      </section>
      <footer className="home-footer">
        <p>{'WorkFlowPlus'}</p>
        <button type="button" className="text-button" onClick={onAccess}>
          {'Acceder o registrarse'}
        </button>
      </footer>
    </main>
  );

  const organizationSignInForm = (
    <div>
      <label htmlFor="org-email">{'Correo electrónico'}</label>
      <input
        id="org-email"
        type="email"
        value={orgEmail}
        onChange={(event) => setOrgEmail(event.target.value)}
      />
      <label htmlFor="org-password">{'Contraseña'}</label>
      <input
        id="org-password"
        type="password"
        value={orgPassword}
        onChange={(event) => setOrgPassword(event.target.value)}
      />
      {authError && <p className="validation-alert">{authError}</p>}
      {authNotice && <p className="validation-alert">{authNotice}</p>}
      <button
        type="button"
        className="button button-primary login-submit"
        onClick={() => void handleOrganizationSignIn()}
        disabled={submitting}
      >
        {submitting ? 'Ingresando…' : 'Ingresar'}
      </button>
    </div>
  );

  const organizationRegisterForm = (
    <div>
      <label htmlFor="company-name">{'Nombre de la empresa'}</label>
      <input
        id="company-name"
        type="text"
        value={companyName}
        onChange={(event) => setCompanyName(event.target.value)}
      />
      <label htmlFor="register-email">{'Correo electrónico'}</label>
      <input
        id="register-email"
        type="email"
        value={orgEmail}
        onChange={(event) => setOrgEmail(event.target.value)}
      />
      <label htmlFor="register-password">{'Contraseña'}</label>
      <input
        id="register-password"
        type="password"
        value={orgPassword}
        onChange={(event) => setOrgPassword(event.target.value)}
      />
      <label htmlFor="organization-type">{'Tipo de organización'}</label>
      <select
        id="organization-type"
        value={organizationType}
        onChange={(event) => setOrganizationType(event.target.value)}
      >
        {ORGANIZATION_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <label htmlFor="organization-description">
        {'Descripción'}
        <span className="optional">{' (opcional)'}</span>
      </label>
      <textarea
        id="organization-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {authError && <p className="validation-alert">{authError}</p>}
      {authNotice && <p className="validation-alert">{authNotice}</p>}
      {companyName.trim() &&
      orgEmail.trim() &&
      orgPassword.trim() &&
      organizationType.trim() ? null : (
        <p className="validation-alert">{'Los campos marcados son obligatorios.'}</p>
      )}
      <button
        type="button"
        className="button button-primary login-submit"
        onClick={() => void handleOrganizationRegister()}
        disabled={submitting}
      >
        {submitting ? 'Creando…' : 'Crear organización'}
      </button>
    </div>
  );

  const employeeForm = (
    <div>
      <label htmlFor="employee-code">{'Código de acceso'}</label>
      <input
        id="employee-code"
        type="text"
        value={employeeCode}
        onChange={(event) => setEmployeeCode(event.target.value)}
      />
      {authError && <p className="validation-alert">{authError}</p>}
      <button
        type="button"
        className="button button-primary login-submit"
        onClick={() => void handleEmployeeSignIn()}
        disabled={submitting}
      >
        {submitting ? 'Ingresando…' : 'Ingresar'}
      </button>
    </div>
  );

  const accessScreen = (): ReactElement => {
    if (resetToken) {
      return (
        <main className="site-shell">
          <header className="topbar">
            <button
              type="button"
              className="brand"
              onClick={() => {
                setResetToken(null);
                setAccessOpen(false);
              }}
            >
              <span className="brand-mark">W</span>
              <span className="brand-ai">WorkflowPlus</span>
            </button>
          </header>
          <section className="login-page">
            <div className="login-intro">
              <h1>{'Nueva contraseña'}</h1>
              <p className="hero-text">{'Ingresá tu correo y elegí una nueva contraseña.'}</p>
            </div>
            <div className="login-card">
              <label htmlFor="reset-email">{'Correo electrónico'}</label>
              <input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
              />
              <label htmlFor="reset-password">{'Nueva contraseña'}</label>
              <input
                id="reset-password"
                type="password"
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
              />
              {authError && <p className="validation-alert">{authError}</p>}
              {authNotice && <p className="validation-alert">{authNotice}</p>}
              <button
                type="button"
                className="button button-primary login-submit"
                onClick={() => void handleReset()}
                disabled={submitting}
              >
                {submitting ? 'Actualizando…' : 'Actualizar contraseña'}
              </button>
              <div className="login-back">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setResetToken(null);
                    setAccessOpen(false);
                  }}
                >
                  {'Volver'}
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    }

    if (recoveryOpen) {
      return (
        <main className="site-shell">
          <header className="topbar">
            <button
              type="button"
              className="brand"
              onClick={() => {
                setRecoveryOpen(false);
                setAccessOpen(false);
              }}
            >
              <span className="brand-mark">W</span>
              <span className="brand-ai">WorkflowPlus</span>
            </button>
          </header>
          <section className="login-page">
            <div className="login-intro">
              <h1>{'Recuperar contraseña'}</h1>
              <p className="hero-text">{'Ingresá tu correo y te enviaremos un enlace.'}</p>
            </div>
            <div className="login-card">
              <label htmlFor="recovery-email">{'Correo electrónico'}</label>
              <input
                id="recovery-email"
                type="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
              />
              {authError && <p className="validation-alert">{authError}</p>}
              {authNotice && <p className="validation-alert">{authNotice}</p>}
              <button
                type="button"
                className="button button-primary login-submit"
                onClick={() => void handleRecovery()}
                disabled={submitting}
              >
                {submitting ? 'Enviando…' : 'Enviar enlace'}
              </button>
              <div className="login-back">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setRecoveryOpen(false);
                    setAuthError('');
                    setAuthNotice('');
                  }}
                >
                  {'Volver'}
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="site-shell">
        <header className="topbar">
          <button type="button" className="brand" onClick={() => setAccessOpen(false)}>
            <span className="brand-mark">W</span>
            <span className="brand-ai">WorkflowPlus</span>
          </button>
        </header>
        <section className="login-page">
          <div className="login-intro">
            <h1>{'Acceder o registrarse'}</h1>
            <p className="hero-text">
              {'Accedé con tu organización o con el código de empleado que recibiste por mail.'}
            </p>
          </div>
          <div className="login-card">
            <h2>{'Iniciar sesión'}</h2>
            <div className="role-switch">
              <button
                type="button"
                className={authRole === 'organization' ? 'selected' : ''}
                onClick={() => {
                  setAuthRole('organization');
                  setAuthMode('signin');
                  setAuthError('');
                  setAuthNotice('');
                }}
              >
                {'Organización'}
              </button>
              <button
                type="button"
                className={authRole === 'employee' ? 'selected' : ''}
                onClick={() => {
                  setAuthRole('employee');
                  setAuthError('');
                  setAuthNotice('');
                }}
              >
                {'Empleado'}
              </button>
            </div>
            {authRole === 'organization' && (
              <div className="access-mode">
                <button
                  type="button"
                  className={authMode === 'signin' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthError('');
                    setAuthNotice('');
                  }}
                >
                  {'Iniciar sesión'}
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                    setAuthNotice('');
                  }}
                >
                  {'Registrarse'}
                </button>
              </div>
            )}
            {authRole === 'employee'
              ? employeeForm
              : authMode === 'signin'
                ? organizationSignInForm
                : organizationRegisterForm}
            {authRole === 'organization' && (
              <p className="login-note">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryOpen(true);
                    setAuthError('');
                    setAuthNotice('');
                  }}
                >
                  {'¿Olvidaste tu contraseña? Recuperala'}
                </button>
              </p>
            )}
            <div className="login-back">
              <button type="button" className="button" onClick={() => setAccessOpen(false)}>
                {'Volver'}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  };

  if (!session) {
    if (accessOpen) {
      return accessScreen();
    }
    return publicHome(() => setAccessOpen(true));
  }

  const sectionItems: Array<{ value: Section; label: string }> = [
    { value: 'overview', label: 'Vista general' },
    { value: 'tasks', label: 'Tareas' },
    { value: 'employees', label: 'Empleados' },
    ...(selfEmployee ? [{ value: 'profile' as const, label: 'Mi perfil' }] : []),
    { value: 'help', label: 'Ayuda' },
  ];

  return (
    <main className="workspace">
      <header className="topbar">
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="menu-toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <button type="button" className="brand" onClick={() => setSection('overview')}>
          <span className="brand-mark">W</span>
          <span className="brand-ai">WorkflowPlus</span>
        </button>
        <nav className={`navigation ${menuOpen ? 'is-open' : ''}`}>
          <div className="sections-dropdown" ref={sectionsRef}>
            <button
              type="button"
              className="nav-link sections-toggle"
              ref={sectionsToggleRef}
              aria-controls="workspace-sections-menu"
              aria-expanded={sectionsOpen}
              onClick={() => setSectionsOpen(!sectionsOpen)}
            >
              {sectionsOpen ? 'Secciones ▴' : 'Secciones ▾'}
            </button>
            <div id="workspace-sections-menu" className="sections-menu" hidden={!sectionsOpen}>
              {sectionItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`nav-link ${section === item.value ? 'is-active' : ''}`}
                  onClick={() => {
                    setSection(item.value);
                    closeMenus();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="nav-link theme-toggle"
            aria-label={theme === 'dark' ? 'Activar Modo Claro' : 'Activar Modo Nocturno'}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀ Modo Claro' : '☾ Modo Nocturno'}
          </button>
          <button
            type="button"
            className="nav-link density-toggle"
            aria-label={density === 'compact' ? 'Usar densidad cómoda' : 'Usar densidad compacta'}
            aria-pressed={density === 'compact'}
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          >
            {density === 'compact' ? '▤ Vista cómoda' : '▤ Vista compacta'}
          </button>
          <button type="button" className="nav-link" onClick={signOut}>
            {'Cerrar sesión'}
          </button>
        </nav>
      </header>
      {loading ? (
        <WorkspaceSkeleton />
      ) : loadError ? (
        <EmptyState
          title={'No se pudo cargar la información.'}
          description={'Revisá la conexión e intentá nuevamente.'}
          actionLabel={'Reintentar'}
          onAction={() => setReloadCount((current) => current + 1)}
        />
      ) : (
        <>
          {(section === 'overview' || (section === 'profile' && !profileEmployee)) && (
            <OverviewSection
              tasks={tasks}
              employees={employees}
              activities={activities}
              departmentLeads={departmentLeads}
              session={session}
              onNavigate={(target) => setSection(target)}
              onOpenProfile={(employeeId) => {
                setProfileEmployeeId(employeeId);
                setSection('profile');
              }}
            />
          )}
          {section === 'tasks' && (
            <TasksSection
              tasks={tasks}
              employees={employees}
              categories={categories}
              departmentLeads={departmentLeads}
              session={session}
              organizationId={organizationId}
              onRefresh={refresh}
            />
          )}
          {section === 'employees' && (
            <EmployeesSection
              employees={employees}
              tasks={tasks}
              invitations={invitations}
              departmentLeads={departmentLeads}
              session={session}
              organizationId={organizationId}
              onRefresh={refresh}
              onOpenProfile={(employeeId) => {
                setProfileEmployeeId(employeeId);
                setSection('profile');
              }}
            />
          )}

          {section === 'profile' && profileEmployee && (
            <MyProfileSection
              employee={profileEmployee}
              tasks={tasks}
              activities={activities}
              isSelf={isSelfProfile}
              isOwner={session?.kind === 'organization'}
              departments={departments}
              onAssignDepartment={assignDepartmentForEmployee}
              onDeleteAccount={
                session?.kind === 'organization'
                  ? deleteProfileEmployee
                  : isSelfProfile && session?.kind === 'employee'
                    ? deleteOwnAccount
                    : undefined
              }
              onBack={() => {
                setSection(isSelfProfile ? 'overview' : 'employees');
                setProfileEmployeeId(null);
              }}
            />
          )}

          {section === 'help' && (
            <HelpSection
              onNavigate={(target) => {
                setSection(
                  target === 'overview' ? 'overview' : target === 'tasks' ? 'tasks' : 'employees',
                );
                closeMenus();
              }}
            />
          )}
        </>
      )}

      {selfEmployee && (
        <button
          type="button"
          className="fab-profile"
          aria-label="Ver mi perfil"
          onClick={() => {
            setProfileEmployeeId(selfEmployee.id);
            setSection('profile');
            closeMenus();
          }}
        >
          {selfEmployee.firstName.slice(0, 1).toUpperCase()}
        </button>
      )}

      {signOutConfirmOpen && (
        <Modal
          title={'Cerrar sesión'}
          onClose={() => setSignOutConfirmOpen(false)}
          label={'Confirmar cierre de sesión'}
        >
          <p>{'¿Está seguro de que desea cerrar la sesión?'}</p>
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setSignOutConfirmOpen(false)}>
              {'Cancelar'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void performSignOut()}
            >
              {'Cerrar Sesión'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
