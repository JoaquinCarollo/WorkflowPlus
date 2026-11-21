import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import type { DepartmentLead, EmployeeProfile, Task, TaskStatus } from '../api.js';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export const AUTHORITY_LABELS: Record<EmployeeProfile['authorityLevel'], string> = {
  administrative: 'Nivel Administrativo',
  operative: 'Nivel Operativo',
};

export const AVAILABILITY_LABELS: Record<EmployeeProfile['availabilityStatus'], string> = {
  available: 'Disponible',
  vacation: 'Vacaciones',
  leave: 'Licencia',
  absent: 'Ausente',
  temporarily_unavailable: 'No disponible temporalmente',
};

export function statusTone(status: TaskStatus): string {
  if (status === 'completed') {
    return 'green';
  }
  if (status === 'cancelled') {
    return 'amber';
  }
  if (status === 'in_progress' || status === 'in_review') {
    return 'blue';
  }
  return 'pending';
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
  backdropClassName = '',
  label,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  label?: string;
}): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables.item(0);
      const last = focusables.item(focusables.length - 1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className={`modal-backdrop ${backdropClassName}`.trim()} onClick={onClose}>
      <div
        ref={panelRef}
        className={`task-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            {'×'}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function WorkspaceSkeleton(): ReactElement {
  return (
    <div className="workspace-skeleton" role="status" aria-label="Cargando información">
      <span className="sr-only">{'Cargando información...'}</span>
      <div className="skeleton-stats" aria-hidden="true">
        <span className="skeleton-card" />
        <span className="skeleton-card" />
        <span className="skeleton-card" />
        <span className="skeleton-card" />
      </div>
      <div className="skeleton-list" aria-hidden="true">
        <span className="skeleton-line skeleton-line-wide" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-short" />
        <span className="skeleton-line" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactElement {
  const showAction = Boolean(actionLabel && onAction);
  return (
    <div className="empty-state">
      <span className="empty-state-mark" aria-hidden="true">
        {'◇'}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {showAction && (
        <button type="button" className="button button-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export interface QuickViewField {
  label: string;
  value: string;
}

export function QuickViewDrawer({
  eyebrow,
  title,
  description,
  fields,
  tags = [],
  onClose,
  onOpenFull,
  fullLabel = 'Ver detalle completo',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  fields: QuickViewField[];
  tags?: string[];
  onClose: () => void;
  onOpenFull?: () => void;
  fullLabel?: string;
}): ReactElement {
  return (
    <Modal
      title={title}
      label={`${eyebrow}: ${title}`}
      className="quick-view-drawer"
      backdropClassName="quick-view-backdrop"
      onClose={onClose}
    >
      <div className="quick-view-content">
        <p className="quick-view-eyebrow">{eyebrow}</p>
        {description && <p className="quick-view-description">{description}</p>}
        {tags.length > 0 && (
          <ul className="quick-view-tags" aria-label="Etiquetas">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        <dl className="quick-view-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        {onOpenFull && (
          <div className="modal-actions quick-view-actions">
            <button type="button" className="button button-primary" onClick={onOpenFull}>
              {fullLabel}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export type DeleteEmployeeMode = 'reassign' | 'unassign' | 'cancel';

export interface DeleteEmployeeConfirmationProps {
  employee: EmployeeProfile;
  pendingTasks: Task[];
  otherEmployees: EmployeeProfile[];
  isDeleting: boolean;
  error: string;
  mode?: DeleteEmployeeMode;
  toEmployeeId?: string;
  onModeChange?: (mode: DeleteEmployeeMode) => void;
  onToEmployeeIdChange?: (employeeId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteEmployeeConfirmation(props: DeleteEmployeeConfirmationProps): ReactElement {
  const mode = props.mode ?? 'unassign';
  const toEmployeeId = props.toEmployeeId ?? '';
  return (
    <div className="modal-backdrop">
      <section
        className="task-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label="Eliminar empleado"
      >
        <h2>{'¿Est\u00E1 seguro de querer eliminar al siguiente empleado?'}</h2>
        <dl className="delete-employee-details">
          <div>
            <dt>{'Nombre'}</dt>
            <dd>{props.employee.firstName}</dd>
          </div>
          <div>
            <dt>{'Apellido'}</dt>
            <dd>{props.employee.lastName}</dd>
          </div>
          <div>
            <dt>{'Puesto'}</dt>
            <dd>{props.employee.position}</dd>
          </div>
          <div>
            <dt>{'Nivel de autoridad'}</dt>
            <dd>
              {props.employee.authorityLevel === 'administrative'
                ? 'Nivel Administrativo'
                : 'Nivel Operativo'}
            </dd>
          </div>
        </dl>
        {props.pendingTasks.length > 0 && (
          <div className="delete-tasks-options">
            <label>{'Este empleado tiene tareas activas. ¿Qué desea hacer con ellas?'}</label>
            <label>
              <input
                type="radio"
                name="delete-employee-mode"
                checked={mode === 'reassign'}
                onChange={() => props.onModeChange?.('reassign')}
              />
              {'Reasignarlas'}
            </label>
            {mode === 'reassign' && (
              <select
                value={toEmployeeId}
                onChange={(event) => props.onToEmployeeIdChange?.(event.target.value)}
                aria-label="Nuevo responsable"
              >
                <option value="">{'Seleccionar empleado'}</option>
                {props.otherEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {`${employee.firstName} ${employee.lastName}`}
                  </option>
                ))}
              </select>
            )}
            <label>
              <input
                type="radio"
                name="delete-employee-mode"
                checked={mode === 'unassign'}
                onChange={() => props.onModeChange?.('unassign')}
              />
              {'Dejarlas sin asignar'}
            </label>
            <label>
              <input
                type="radio"
                name="delete-employee-mode"
                checked={mode === 'cancel'}
                onChange={() => props.onModeChange?.('cancel')}
              />
              {'Cancelarlas'}
            </label>
          </div>
        )}
        {props.error && <p className="validation-alert">{props.error}</p>}
        <div className="delete-employee-actions modal-actions">
          <button type="button" className="button" onClick={props.onCancel}>
            {'Cancelar'}
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={props.onConfirm}
            disabled={props.isDeleting}
          >
            {props.isDeleting ? 'Eliminando…' : 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}

export interface RemoveDepartmentLeadConfirmationProps {
  lead: DepartmentLead;
  employeeName: string;
  isRemoving?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveDepartmentLeadConfirmation(
  props: RemoveDepartmentLeadConfirmationProps,
): ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled])',
      );
      const first = focusables.item(0);
      const last = focusables.item(focusables.length - 1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop">
      <section
        ref={panelRef}
        className="task-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label="Quitar jefe de departamento"
      >
        <h2>{'Quitar jefe de departamento'}</h2>
        <p>{`Va a quitar a ${props.employeeName} de su puesto como jefe del departamento ${props.lead.department}.`}</p>
        {props.error && <p className="validation-alert">{props.error}</p>}
        <div className="delete-employee-actions modal-actions">
          <button ref={cancelRef} type="button" className="button" onClick={props.onCancel}>
            {'Cancelar'}
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={props.onConfirm}
            disabled={props.isRemoving}
          >
            {props.isRemoving ? 'Quitando…' : 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}
