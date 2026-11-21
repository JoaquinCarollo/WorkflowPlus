import { useEffect, useState, type ReactElement } from 'react';
import {
  addTaskComment,
  createTask,
  deleteTask,
  fetchTaskAttachments,
  fetchTaskComments,
  updateTask,
  type DepartmentLead,
  type EmployeeProfile,
  type SessionActor,
  type Task,
  type TaskAttachment,
  type TaskAttachmentInput,
  type TaskComment,
  type TaskStatus,
} from '../api.js';
import {
  canCreateTasksForSession,
  filterTasks,
  isTaskOverdue,
  scopeTasksForSession,
  type TaskFilters,
} from '../domain.js';
import { EmptyState, PRIORITY_LABELS, QuickViewDrawer, STATUS_LABELS, statusTone } from './ui.js';

export interface TasksSectionProps {
  tasks: Task[];
  employees: EmployeeProfile[];
  categories: string[];
  departmentLeads: DepartmentLead[];
  session: SessionActor | null;
  organizationId: string;
  onRefresh: () => void | Promise<void>;
}

const STATUS_OPTIONS: TaskStatus[] = [
  'pending',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
];

const PRIORITY_OPTIONS: Array<Task['priority']> = ['low', 'medium', 'high', 'urgent'];

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MAX_ATTACHMENTS_PER_TASK = 5;

const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'pending', label: 'Pendientes' },
  { status: 'in_progress', label: 'En progreso' },
  { status: 'in_review', label: 'En revisión' },
  { status: 'completed', label: 'Completadas' },
];

const EMPTY_FILTERS: TaskFilters = {
  status: 'all',
  query: '',
  ownerId: '',
  priority: '',
  category: '',
  due: 'all',
  state: '',
};

export function reasonMessage(reason: string | null): string {
  switch (reason) {
    case 'invalid_owner':
      return 'El responsable no es un empleado activo de la organización.';
    case 'invalid_dependency':
      return 'Hay una dependencia que no pertenece a la organización.';
    case 'invalid_transition':
      return 'El cambio de estado no está permitido.';
    case 'approval_required':
      return 'Se requiere la aprobación del responsable designado.';
    case 'blocked_by_dependency':
      return 'La tarea tiene dependencias sin completar.';
    case 'not_found':
      return 'La tarea ya no existe.';
    default:
      return 'No se pudo guardar la tarea. Revise los datos.';
  }
}

export interface NewTaskFormState {
  title: string;
  description: string;
  category: string;
  priority: Task['priority'] | '';
  ownerId: string;
  dueAt: string;
}

type CompleteNewTaskFormState = Omit<NewTaskFormState, 'priority'> & {
  priority: Task['priority'];
};

const EMPTY_FORM: NewTaskFormState = {
  title: '',
  description: '',
  category: '',
  priority: '',
  ownerId: '',
  dueAt: '',
};

function isInvalidDate(value: string): boolean {
  return value.trim() !== '' && Number.isNaN(Date.parse(value));
}

export function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(parsed.getFullYear()).padStart(4, '0')}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export interface TaskAttachmentReadResult {
  attachments: TaskAttachmentInput[];
  error: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export async function readTaskAttachmentFiles(
  files: File[],
  existing: TaskAttachmentInput[] = [],
): Promise<TaskAttachmentReadResult> {
  if (files.length === 0) {
    return { attachments: [], error: '' };
  }
  if (existing.length + files.length > MAX_ATTACHMENTS_PER_TASK) {
    return { attachments: [], error: `Podés adjuntar hasta ${MAX_ATTACHMENTS_PER_TASK} archivos.` };
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const existingBytes = existing.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    return { attachments: [], error: 'Cada archivo debe pesar hasta 5 MB.' };
  }
  if (existingBytes + totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { attachments: [], error: 'El total de los archivos no puede superar los 10 MB.' };
  }
  try {
    const attachments = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    return { attachments, error: '' };
  } catch {
    return { attachments: [], error: 'No se pudieron leer los archivos. Inténtelo nuevamente.' };
  }
}

function isInvalidEstimate(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }
  const minutes = Number(value);
  return !Number.isFinite(minutes) || minutes < 0;
}

export function missingNewTaskFields(form: NewTaskFormState): string[] {
  const missing: string[] = [];
  if (!form.title.trim()) {
    missing.push('Título');
  }
  if (!form.description.trim()) {
    missing.push('Descripción');
  }
  if (!form.category.trim()) {
    missing.push('Categoría');
  }
  if (!form.priority) {
    missing.push('Prioridad');
  }
  if (!form.ownerId.trim()) {
    missing.push('Responsable');
  }
  if (!form.dueAt.trim() || isInvalidDate(form.dueAt)) {
    missing.push('Fecha de entrega');
  }
  return missing;
}

export function isNewTaskFormComplete(form: NewTaskFormState): form is CompleteNewTaskFormState {
  return missingNewTaskFields(form).length === 0;
}

export function NewTaskModal({
  employees,
  categories,
  organizationId,
  session,
  onClose,
  onCreated,
}: {
  employees: EmployeeProfile[];
  categories: string[];
  organizationId: string;
  session: SessionActor | null;
  onClose: () => void;
  onCreated: () => void;
}): ReactElement {
  const [form, setForm] = useState<NewTaskFormState>(EMPTY_FORM);
  const [attachments, setAttachments] = useState<TaskAttachmentInput[]>([]);
  const [fileError, setFileError] = useState('');
  const [readingFiles, setReadingFiles] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFiles = (files: File[]): void => {
    setReadingFiles(true);
    void readTaskAttachmentFiles(files, attachments)
      .then((result) => {
        if (result.error) {
          setFileError(result.error);
          return;
        }
        setFileError('');
        setAttachments((current) => [...current, ...result.attachments]);
      })
      .catch(() => setFileError('No se pudieron leer los archivos. Inténtelo nuevamente.'))
      .finally(() => setReadingFiles(false));
  };

  const submit = async (): Promise<void> => {
    if (!isNewTaskFormComplete(form)) {
      setError(`Completá todos los campos obligatorios: ${missingNewTaskFields(form).join(', ')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await createTask(
        {
          organizationId,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          priority: form.priority,
          ownerId: form.ownerId,
          dueAt: fromDateTimeLocalValue(form.dueAt),
          attachments,
        },
        session,
      );
      if (result.status === 'created') {
        onCreated();
        return;
      }
      setError(reasonMessage(result.reason ?? null));
    } catch {
      setError('No se pudo crear la tarea. Revise los datos e inténtelo nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nueva tarea"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{'Nueva tarea'}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar">
            {'×'}
          </button>
        </div>
        <label htmlFor="task-title">{'Título *'}</label>
        <input
          id="task-title"
          type="text"
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <label htmlFor="task-description">{'Descripción *'}</label>
        <input
          id="task-description"
          type="text"
          required
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <div className="form-columns">
          <div>
            <label htmlFor="task-category">{'Categoría *'}</label>
            <select
              id="task-category"
              required
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              <option value="">{'Seleccionar categoría'}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-priority">{'Prioridad *'}</label>
            <select
              id="task-priority"
              required
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as Task['priority'] | '' })
              }
            >
              <option value="">{'Seleccionar prioridad'}</option>
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-owner">{'Responsable *'}</label>
            <select
              id="task-owner"
              required
              value={form.ownerId}
              onChange={(event) => setForm({ ...form, ownerId: event.target.value })}
            >
              <option value="">{'Seleccionar responsable'}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {`${employee.firstName} ${employee.lastName}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-due">{'Fecha de entrega *'}</label>
            <input
              id="task-due"
              type="datetime-local"
              required
              value={form.dueAt}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
          </div>
        </div>
        <label htmlFor="task-attachments">{'Archivos para el empleado (opcional)'}</label>
        <input
          id="task-attachments"
          type="file"
          multiple
          aria-describedby="task-attachments-help"
          onChange={(event) => {
            handleFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <p id="task-attachments-help" className="field-help">
          {'Podés adjuntar hasta 5 archivos de 5 MB cada uno (10 MB en total).'}
        </p>
        {attachments.length > 0 && (
          <ul className="attachment-list">
            {attachments.map((attachment, index) => (
              <li key={`${attachment.name}-${index}`}>
                <span>{attachment.name}</span>
                <button
                  type="button"
                  className="row-action"
                  aria-label={`Quitar archivo ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((_, item) => item !== index))
                  }
                >
                  {'×'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && (
          <p className="validation-alert" role="alert">
            {fileError}
          </p>
        )}
        {error && (
          <p className="validation-alert" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            {'Cancelar'}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void submit()}
            disabled={saving || readingFiles}
          >
            {saving || readingFiles ? 'Guardando…' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailModal({
  task,
  employees,
  organizationId,
  session,
  onClose,
  onChanged,
}: {
  task: Task;
  employees: EmployeeProfile[];
  organizationId: string;
  session: SessionActor | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}): ReactElement {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [category, setCategory] = useState(task.category);
  const [priority, setPriority] = useState<Task['priority']>(task.priority);
  const [ownerId, setOwnerId] = useState(task.ownerId ?? '');
  const [dueAt, setDueAt] = useState(toDateTimeLocalValue(task.dueAt));
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task.estimatedMinutes === null ? '' : String(task.estimatedMinutes),
  );
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = canCreateTasksForSession(session);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const result = await fetchTaskComments(task.id, organizationId);
      if (!cancelled) {
        setComments(result);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [task.id, organizationId]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const result = await fetchTaskAttachments(task.id, organizationId);
      if (!cancelled) {
        setAttachments(result);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [task.id, organizationId]);

  const save = async (): Promise<void> => {
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (canManage) {
      if (!description.trim() || !category.trim() || !priority) {
        setError('Completá la descripción, la categoría y la prioridad.');
        return;
      }
      if (isInvalidDate(dueAt) || isInvalidEstimate(estimatedMinutes)) {
        setError('Revisá la fecha de entrega y el tiempo estimado.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const input = canManage
        ? {
            organizationId,
            title,
            description,
            category,
            estimatedMinutes: estimatedMinutes === '' ? null : Number(estimatedMinutes),
            priority,
            ownerId: ownerId || null,
            dueAt: dueAt ? fromDateTimeLocalValue(dueAt) : null,
            status,
          }
        : { organizationId, status };
      const result = await updateTask(task.id, input, session);
      if (result.status === 'updated') {
        await onChanged();
        return;
      }
      setError(reasonMessage(result.reason));
    } catch {
      setError('No se pudo guardar la tarea. Revise los datos e inténtelo nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: TaskStatus): Promise<void> => {
    setStatus(next);
    setError('');
    const result = await updateTask(task.id, { organizationId, status: next }, session);
    if (result.status === 'updated') {
      await onChanged();
      return;
    }
    setError(reasonMessage(result.reason));
    setStatus(task.status);
  };

  const remove = async (): Promise<void> => {
    const result = await deleteTask(task.id, organizationId, session);
    if (result.status === 'deleted') {
      await onChanged();
      onClose();
      return;
    }
    setError('No se pudo eliminar la tarea.');
  };

  const submitComment = async (): Promise<void> => {
    const text = commentText.trim();
    if (!text) {
      return;
    }
    const result = await addTaskComment(task.id, { organizationId, text }, session);
    if (result.status === 'added' && result.comment) {
      setComments([...comments, result.comment]);
      setCommentText('');
      return;
    }
    setError('No se pudo agregar el comentario.');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="task-modal task-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Tarea ${task.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{task.title}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar">
            {'×'}
          </button>
        </div>
        <div className="task-detail-body">
          <article>
            <h3>{'Detalle'}</h3>
            <label htmlFor="detail-title">{'Título'}</label>
            <input
              id="detail-title"
              type="text"
              value={title}
              disabled={!canManage}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="detail-description">{'Descripción'}</label>
            <input
              id="detail-description"
              type="text"
              value={description}
              disabled={!canManage}
              onChange={(event) => setDescription(event.target.value)}
            />
            <label htmlFor="detail-category">{'Categoría'}</label>
            <input
              id="detail-category"
              type="text"
              value={category}
              disabled={!canManage}
              onChange={(event) => setCategory(event.target.value)}
            />
            <label htmlFor="detail-estimate">{'Tiempo estimado (minutos)'}</label>
            <input
              id="detail-estimate"
              type="number"
              min={0}
              value={estimatedMinutes}
              disabled={!canManage}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
            />
            <label htmlFor="detail-due">{'Fecha de entrega'}</label>
            <input
              id="detail-due"
              type="datetime-local"
              value={dueAt}
              disabled={!canManage}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </article>
          <article>
            <h3>{'Estado y asignación'}</h3>
            <label htmlFor="detail-status">{'Estado'}</label>
            <select
              id="detail-status"
              value={status}
              onChange={(event) => void changeStatus(event.target.value as TaskStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
            <label htmlFor="detail-priority">{'Prioridad'}</label>
            <select
              id="detail-priority"
              value={priority}
              disabled={!canManage}
              onChange={(event) => setPriority(event.target.value as Task['priority'])}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {PRIORITY_LABELS[option]}
                </option>
              ))}
            </select>
            <label htmlFor="detail-owner">{'Responsable'}</label>
            <select
              id="detail-owner"
              value={ownerId}
              disabled={!canManage}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">{'Sin asignar'}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {`${employee.firstName} ${employee.lastName}`}
                </option>
              ))}
            </select>
            <p>{`Creada: ${new Date(task.createdAt).toLocaleString('es-ES')}`}</p>
            {task.completedAt && (
              <p>{`Completada: ${new Date(task.completedAt).toLocaleString('es-ES')}`}</p>
            )}
            {task.cancelledAt && (
              <p>{`Cancelada: ${new Date(task.cancelledAt).toLocaleString('es-ES')}`}</p>
            )}
          </article>
          <article>
            <h3>{'Comentarios'}</h3>
            {comments.length === 0 ? (
              <p>{'Todavía no hay comentarios.'}</p>
            ) : (
              <ul>
                {comments.map((comment) => (
                  <li key={comment.id}>{`${comment.authorName}: ${comment.text}`}</li>
                ))}
              </ul>
            )}
            <div className="comment-add">
              <input
                type="text"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Escribí un comentario"
                aria-label="Comentario"
              />
              <button type="button" className="button" onClick={() => void submitComment()}>
                {'Comentar'}
              </button>
            </div>
          </article>
          <article>
            <h3>{'Archivos'}</h3>
            {attachments.length === 0 ? (
              <p>{'No hay archivos adjuntos.'}</p>
            ) : (
              <ul className="attachment-list">
                {attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a href={attachment.dataUrl} download={attachment.name}>
                      {attachment.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
          <article>
            <h3>{'Historial'}</h3>
            <p>{`Estado actual: ${STATUS_LABELS[task.status]}`}</p>
          </article>
        </div>
        {error && (
          <p className="validation-alert" role="alert">
            {error}
          </p>
        )}
        <div className="task-detail-actions modal-actions">
          {canManage &&
            (confirmingDelete ? (
              <>
                <button type="button" className="button" onClick={() => setConfirmingDelete(false)}>
                  {'Volver'}
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => void remove()}
                >
                  {'Confirmar eliminación'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                {'Eliminar'}
              </button>
            ))}
          <button type="button" className="button" onClick={onClose}>
            {'Cerrar'}
          </button>
          {canManage && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TasksSection({
  tasks,
  employees,
  categories,
  departmentLeads,
  session,
  organizationId,
  onRefresh,
}: TasksSectionProps): ReactElement {
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [quickTaskId, setQuickTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const canManage = canCreateTasksForSession(session);

  const scopedTasks = scopeTasksForSession(tasks, session, employees, departmentLeads);
  const visibleTasks = filterTasks(scopedTasks, filters);
  const counts = {
    all: scopedTasks.length,
    pending: scopedTasks.filter((task) => task.status === 'pending').length,
    in_progress: scopedTasks.filter((task) => task.status === 'in_progress').length,
    in_review: scopedTasks.filter((task) => task.status === 'in_review').length,
    completed: scopedTasks.filter((task) => task.status === 'completed').length,
    cancelled: scopedTasks.filter((task) => task.status === 'cancelled').length,
  };
  const detailTask = detailTaskId
    ? (scopedTasks.find((task) => task.id === detailTaskId) ?? null)
    : null;
  const quickTask = quickTaskId
    ? (scopedTasks.find((task) => task.id === quickTaskId) ?? null)
    : null;
  const changeStatus = async (taskId: string, next: TaskStatus): Promise<void> => {
    setNotice('');
    const result = await updateTask(taskId, { organizationId, status: next }, session);
    if (result.status === 'updated') {
      await onRefresh();
      return;
    }
    setNotice(reasonMessage(result.reason));
  };

  const pills: Array<{ value: TaskStatus | 'all'; label: string; count: number }> = [
    { value: 'all', label: 'Todas', count: counts.all },
    { value: 'pending', label: 'Pendientes', count: counts.pending },
    { value: 'in_progress', label: 'En progreso', count: counts.in_progress },
    { value: 'in_review', label: 'En revisión', count: counts.in_review },
    { value: 'completed', label: 'Completadas', count: counts.completed },
    { value: 'cancelled', label: 'Canceladas', count: counts.cancelled },
  ];

  return (
    <section>
      <div className="task-toolbar">
        <h1>{'Tareas'}</h1>
        <div className="tasks-header-actions">
          {canManage && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setNewTaskOpen(true)}
            >
              {'Nueva tarea'}
            </button>
          )}
        </div>
      </div>

      <div className="filter-pills">
        {pills.map((pill) => (
          <button
            key={pill.value}
            type="button"
            className={`filter ${filters.status === pill.value ? 'is-selected' : ''}`}
            onClick={() => setFilters({ ...filters, status: pill.value })}
          >
            {pill.label}
            <span>{` ${pill.count}`}</span>
          </button>
        ))}
      </div>

      <div className="task-filters">
        <div>
          <label htmlFor="task-filter-owner">{'Empleado'}</label>
          <select
            id="task-filter-owner"
            value={filters.ownerId}
            onChange={(event) => setFilters({ ...filters, ownerId: event.target.value })}
          >
            <option value="">{'Todos'}</option>
            <option value="__unassigned__">{'Sin asignar'}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {`${employee.firstName} ${employee.lastName}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-filter-priority">{'Prioridad'}</label>
          <select
            id="task-filter-priority"
            value={filters.priority}
            onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
          >
            <option value="">{'Todas'}</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-filter-category">{'Categoría'}</label>
          <select
            id="task-filter-category"
            value={filters.category}
            onChange={(event) => setFilters({ ...filters, category: event.target.value })}
          >
            <option value="">{'Todas'}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-filter-due">{'Fecha'}</label>
          <select
            id="task-filter-due"
            value={filters.due}
            onChange={(event) =>
              setFilters({ ...filters, due: event.target.value as 'all' | 'overdue' })
            }
          >
            <option value="all">{'Todas'}</option>
            <option value="overdue">{'Vencidas'}</option>
          </select>
        </div>
      </div>

      <div className="task-search">
        <label htmlFor="task-search-input">{'Buscar'}</label>
        <input
          id="task-search-input"
          type="search"
          value={filters.query}
          placeholder="Buscar por nombre o descripción"
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
      </div>

      <div className="task-view-toggle">
        <button
          type="button"
          className={`filter ${view === 'list' ? 'is-selected' : ''}`}
          onClick={() => setView('list')}
        >
          {'Lista'}
        </button>
        <button
          type="button"
          className={`filter ${view === 'kanban' ? 'is-selected' : ''}`}
          onClick={() => setView('kanban')}
        >
          {'Kanban'}
        </button>
      </div>

      {notice && (
        <p className="validation-alert" role="alert">
          {notice}
        </p>
      )}

      {visibleTasks.length === 0 ? (
        scopedTasks.length > 0 ? (
          <EmptyState
            title={'Sin resultados'}
            description={'Ninguna tarea coincide con la búsqueda o los filtros actuales.'}
            actionLabel={'Limpiar filtros'}
            onAction={() => setFilters(EMPTY_FILTERS)}
          />
        ) : (
          <EmptyState
            title={'Todavía no hay tareas asignadas.'}
            description={'Las tareas del equipo aparecerán acá con su responsable y vencimiento.'}
            actionLabel={canManage ? 'Nueva tarea' : undefined}
            onAction={canManage ? () => setNewTaskOpen(true) : undefined}
          />
        )
      ) : view === 'list' ? (
        <div className="task-list">
          {visibleTasks.map((task) => (
            <div key={task.id} className="task-row">
              <span className={`status-mark ${statusTone(task.status)}`} />
              <div className="task-title">
                <strong>{task.title}</strong>
                <span>{task.category || 'Sin categoría'}</span>
                <button
                  type="button"
                  className="text-button quick-view-link"
                  aria-label={`Vista rápida de ${task.title}`}
                  onClick={() => setQuickTaskId(task.id)}
                >
                  {'Vista rápida'}
                </button>
              </div>
              <span className="task-owner">{task.ownerName ?? 'Sin asignar'}</span>
              <select
                className="task-status-select"
                value={task.status}
                aria-label={`Estado de ${task.title}`}
                onChange={(event) => void changeStatus(task.id, event.target.value as TaskStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-detail"
                aria-label={`Ver detalle de ${task.title}`}
                onClick={() => setDetailTaskId(task.id)}
              >
                {'Detalle'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban-board">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = visibleTasks.filter((task) => task.status === column.status);
            return (
              <div
                key={column.status}
                className="kanban-column"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedTaskId) {
                    void changeStatus(draggedTaskId, column.status);
                    setDraggedTaskId(null);
                  }
                }}
              >
                <h2>{`${column.label} (${columnTasks.length})`}</h2>
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                  >
                    <strong>{task.title}</strong>
                    <p>{task.category || 'Sin categoría'}</p>
                    <p>{task.ownerName ?? 'Sin asignar'}</p>
                    <button
                      type="button"
                      className="text-button quick-view-link"
                      aria-label={`Vista rápida de ${task.title}`}
                      onClick={() => setQuickTaskId(task.id)}
                    >
                      {'Vista rápida'}
                    </button>
                    <select
                      value={task.status}
                      aria-label={`Estado de ${task.title}`}
                      onChange={(event) =>
                        void changeStatus(task.id, event.target.value as TaskStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-detail"
                      aria-label={`Ver detalle de ${task.title}`}
                      onClick={() => setDetailTaskId(task.id)}
                    >
                      {'Detalle'}
                    </button>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <span className="kanban-drop-hint">{'Arrastrá tareas acá'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {newTaskOpen && (
        <NewTaskModal
          employees={employees}
          categories={categories}
          organizationId={organizationId}
          session={session}
          onClose={() => setNewTaskOpen(false)}
          onCreated={() => {
            setNewTaskOpen(false);
            void onRefresh();
          }}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          employees={employees}
          organizationId={organizationId}
          session={session}
          onClose={() => setDetailTaskId(null)}
          onChanged={() => void onRefresh()}
        />
      )}
      {quickTask && (
        <QuickViewDrawer
          eyebrow={'Vista rápida de tarea'}
          title={quickTask.title}
          description={quickTask.description}
          tags={isTaskOverdue(quickTask, Date.now()) ? ['Vencida'] : []}
          fields={[
            { label: 'Estado', value: STATUS_LABELS[quickTask.status] },
            { label: 'Prioridad', value: PRIORITY_LABELS[quickTask.priority] },
            { label: 'Responsable', value: quickTask.ownerName ?? 'Sin asignar' },
            { label: 'Categoría', value: quickTask.category || 'Sin categoría' },
            {
              label: 'Vencimiento',
              value: quickTask.dueAt
                ? new Date(quickTask.dueAt).toLocaleDateString('es-ES')
                : 'Sin fecha',
            },
          ]}
          onClose={() => setQuickTaskId(null)}
          onOpenFull={() => {
            setDetailTaskId(quickTask.id);
            setQuickTaskId(null);
          }}
          fullLabel={'Abrir detalle completo'}
        />
      )}
    </section>
  );
}
