import { useState, type ReactElement } from 'react';

type HelpTab = 'empleado' | 'vista-general' | 'tareas';

interface HelpSectionProps {
  onNavigate: (section: 'empleados' | 'overview' | 'tasks') => void;
}

const TAB_LABELS: Record<HelpTab, string> = {
  empleado: 'Empleado',
  'vista-general': 'Vista general',
  tareas: 'Tareas',
};

const TAB_ICONS: Record<HelpTab, string> = {
  empleado: '👤',
  'vista-general': '📊',
  tareas: '✅',
};

const SECTION_BORDER_COLORS: Record<HelpTab, string> = {
  empleado: '#17233a',
  'vista-general': '#7b9f22',
  tareas: '#c4ec57',
};

export const HELP_CONTENT: Record<
  HelpTab,
  { title: string; intro: string; items: Array<{ heading: string; text: string }> }
> = {
  empleado: {
    title: 'Sección Empleados',
    intro:
      'Aquí gestionas el directorio de personas de tu organización: quiénes forman parte del equipo, su departamento, nivel de autoridad y carga de trabajo.',
    items: [
      {
        heading: 'Ver el directorio',
        text: 'La lista muestra a todos los empleados activos con su nombre, puesto, departamento y nivel de autoridad. Toca una tarjeta para abrir su perfil completo.',
      },
      {
        heading: 'Invitar empleados',
        text: 'Solo el dueño de la organización puede invitar empleados. Rellena el formulario de invitación y el sistema envía un código de acceso al correo del empleado para que pueda ingresar.',
      },
      {
        heading: 'Niveles de autoridad',
        text: 'Administrativo puede crear tareas y ver el equipo de su departamento. Operativo ve sus propias tareas asignadas y actualiza su estado.',
      },
      {
        heading: 'Departamentos y jefes',
        text: 'Los departamentos agrupan empleados. El dueño puede asignar un jefe de departamento (un empleado administrativo) que lidera al equipo operativo de ese departamento.',
      },
      {
        heading: 'Carga de trabajo',
        text: 'Cada empleado muestra un indicador de carga (Baja, Media o Alta) calculado a partir de sus tareas pendientes.',
      },
    ],
  },
  'vista-general': {
    title: 'Sección Vista general',
    intro:
      'Es el panel de control de tu organización. Resume el estado de las tareas, la carga del equipo y las novedades que requieren atención.',
    items: [
      {
        heading: 'Estadísticas',
        text: 'Cuatro tarjetas muestran el total de tareas asignadas, cuántas están completadas, pendientes y canceladas, junto con el porcentaje de completado.',
      },
      {
        heading: 'Gráfico de actividad',
        text: 'Muestra las tareas creadas y completadas por día dentro del período seleccionado (últimos 7, 30, 90 días o todo el período).',
      },
      {
        heading: 'Centro de atención',
        text: 'Lista alertas como tareas sin asignar, tareas urgentes pendientes y tareas canceladas. Cada alerta tiene un botón para ir directamente a Tareas.',
      },
      {
        heading: 'Carga laboral',
        text: 'Distribución de horas asignadas por empleado. Toca un empleado para abrir su perfil desde la sección Empleados.',
      },
      {
        heading: 'Pronóstico de la semana',
        text: 'Muestra las tareas que vencen en los próximos 7 días frente a la capacidad del equipo, con un nivel de utilización (bajo, manejable, exigente o muy exigente).',
      },
      {
        heading: 'Organigrama y actividad',
        text: 'El organigrama muestra la estructura por departamentos con los jefes destacados. La actividad reciente lista los últimos eventos de la organización.',
      },
    ],
  },
  tareas: {
    title: 'Sección Tareas',
    intro:
      'Aquí creas, asignas y da seguimiento al trabajo de la organización. Cada tarea tiene un responsable, prioridad, categoría y fecha de entrega.',
    items: [
      {
        heading: 'Crear una tarea',
        text: 'Toca "Nueva tarea" y rellena el título, descripción, categoría, prioridad, responsable y fecha de entrega. Podés adjuntar archivos para el empleado. Solo administrativos y el dueño pueden crear tareas.',
      },
      {
        heading: 'Ver el detalle',
        text: 'Toca el botón Detalle de cualquier tarea para abrir su detalle: estado, fechas, comentarios, archivos e historial de actividades.',
      },
      {
        heading: 'Cambiar el estado',
        text: 'Las tareas pasan por estados: Pendiente, En progreso, En revisión, Completada y Cancelada. Puedes cambiar el estado desde el select de cada fila o del detalle.',
      },
      {
        heading: 'Vista Kanban',
        text: 'Cambia a la vista Kanban para organizar las tareas en columnas por estado y arrastra las tarjetas para moverlas de una columna a otra.',
      },
      {
        heading: 'Filtros y búsqueda',
        text: 'Usa las pills de estado, el buscador por nombre o descripción y los filtros por empleado, prioridad, categoría y fecha para encontrar tareas rápidamente.',
      },
      {
        heading: 'Comentarios y archivos',
        text: 'Al crear una tarea podés adjuntar hasta 5 archivos de 5 MB cada uno (10 MB en total) para que el empleado tenga lo necesario. Desde el detalle podés agregar comentarios y descargar esos archivos.',
      },
    ],
  },
};

export function HelpSection({ onNavigate }: HelpSectionProps): ReactElement {
  const [activeTab, setActiveTab] = useState<HelpTab>('empleado');
  const content = HELP_CONTENT[activeTab];

  return (
    <section className="help-section">
      <div className="help-header">
        <h1>{'Ayuda de WorkFlowPlus'}</h1>
        <p>{'Selecciona una sección para saber cómo funciona.'}</p>
      </div>

      <div className="help-banner">
        <span className="help-banner-icon">ⓘ</span>
        <div>
          <h2>{'Aprende a usar WorkFlowPlus'}</h2>
          <p>
            {
              'Elige una sección arriba para ver una guía rápida de cómo funciona cada parte de la aplicación.'
            }
          </p>
        </div>
      </div>

      <div className="help-tabs">
        {Object.entries(TAB_LABELS).map(([key, label]) => {
          const tab = key as HelpTab;
          return (
            <button
              key={tab}
              type="button"
              className={`help-tab ${activeTab === tab ? 'is-active' : ''}`}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              <span className="help-tab-icon">{TAB_ICONS[tab]}</span>
              {label}
            </button>
          );
        })}
      </div>

      <div className="help-content">
        <h2>{content.title}</h2>
        <p className="help-intro">{content.intro}</p>
        <ul className="help-list">
          {content.items.map((item) => (
            <li
              key={item.heading}
              className="help-item"
              style={{ borderLeftColor: SECTION_BORDER_COLORS[activeTab] }}
            >
              <span className="help-item-icon">{TAB_ICONS[activeTab]}</span>
              <div>
                <h3>{item.heading}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="help-actions">
          {activeTab === 'empleado' && (
            <button
              type="button"
              className="button"
              onClick={() => {
                onNavigate('empleados');
              }}
            >
              {'Ir a Empleados'}
            </button>
          )}
          {activeTab === 'vista-general' && (
            <button
              type="button"
              className="button"
              onClick={() => {
                onNavigate('overview');
              }}
            >
              {'Ir a Vista general'}
            </button>
          )}
          {activeTab === 'tareas' && (
            <button
              type="button"
              className="button"
              onClick={() => {
                onNavigate('tasks');
              }}
            >
              {'Ir a Tareas'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
