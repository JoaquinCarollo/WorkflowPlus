-- Each table with organization_id is protected by membership-based RLS.
create type public.organization_role as enum ('owner', 'manager', 'employee');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('backlog', 'todo', 'in_progress', 'blocked', 'done');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'employee',
  weekly_capacity_hours numeric(5,2) not null default 40 check (weekly_capacity_hours >= 0),
  primary key (organization_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

create table public.member_skills (
  organization_id uuid not null,
  user_id uuid not null,
  skill_id uuid not null references public.skills(id) on delete cascade,
  proficiency smallint not null check (proficiency between 1 and 5),
  primary key (organization_id, user_id, skill_id),
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'backlog',
  due_at timestamptz,
  estimated_hours numeric(6,2) check (estimated_hours > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  candidate_user_id uuid not null references public.profiles(id),
  score numeric(5,2) not null check (score between 0 and 100),
  rationale jsonb not null default '[]'::jsonb,
  coordinator_version text not null,
  quality_review jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index tasks_organization_status_idx on public.tasks (organization_id, status);
create index task_assignments_organization_user_idx on public.task_assignments (organization_id, user_id);
create index availability_blocks_organization_user_idx on public.availability_blocks (organization_id, user_id);

create function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.categories enable row level security;
alter table public.skills enable row level security;
alter table public.member_skills enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.ai_recommendations enable row level security;

create policy "members can read their organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "users can read own profile" on public.profiles for select using (id = auth.uid());
create policy "members can read organization memberships" on public.organization_members for select using (public.is_organization_member(organization_id));

create policy "members can access categories" on public.categories for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access skills" on public.skills for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access member skills" on public.member_skills for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access availability" on public.availability_blocks for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access tasks" on public.tasks for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access assignments" on public.task_assignments for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members can access recommendations" on public.ai_recommendations for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
-- Employee access codes are generated by the API, delivered by email, and stored only as SHA-256 digests.
create type public.employee_invite_status as enum ('pending', 'sent', 'redeemed', 'expired', 'revoked');

create table public.employee_access_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  full_name text not null check (char_length(full_name) between 2 and 160),
  role public.organization_role not null default 'employee' check (role in ('manager', 'employee')),
  access_code_digest char(64) not null check (access_code_digest ~ '^[a-f0-9]{64}$'),
  status public.employee_invite_status not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index employee_access_invites_active_recipient_idx
  on public.employee_access_invites (organization_id, recipient_email)
  where status in ('pending', 'sent');
create index employee_access_invites_digest_idx on public.employee_access_invites (access_code_digest)
  where status in ('pending', 'sent');

create function public.is_organization_manager(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

grant execute on function public.is_organization_manager(uuid) to authenticated;

alter table public.employee_access_invites enable row level security;

create policy "managers can manage employee access invitations"
  on public.employee_access_invites for all
  using (public.is_organization_manager(organization_id))
  with check (public.is_organization_manager(organization_id));
-- Invitation form profile fields and global uniqueness for active employee emails and access-code digests.
alter table public.employee_access_invites
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists position text;

update public.employee_access_invites
set first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), '')),
    last_name = coalesce(
      last_name,
      nullif(trim(split_part(full_name, ' ', 2)), ''),
      nullif(split_part(full_name, ' ', 1), '')
    ),
    position = coalesce(position, role::text)
where first_name is null or last_name is null or position is null;

alter table public.employee_access_invites
  alter column first_name set not null,
  alter column last_name set not null,
  alter column position set not null,
  add constraint employee_access_invites_first_name_length check (char_length(first_name) between 1 and 120),
  add constraint employee_access_invites_last_name_length check (char_length(last_name) between 1 and 120),
  add constraint employee_access_invites_position_length check (char_length(position) between 1 and 120);

drop index if exists public.employee_access_invites_active_recipient_idx;
drop index if exists public.employee_access_invites_digest_idx;

create unique index employee_access_invites_global_recipient_idx
  on public.employee_access_invites (recipient_email)
  where status in ('pending', 'sent');
create unique index employee_access_invites_global_digest_idx
  on public.employee_access_invites (access_code_digest)
  where status in ('pending', 'sent');
do $$
begin
  alter type public.task_status add value if not exists 'pending';
  alter type public.task_status add value if not exists 'completed';
  alter type public.task_status add value if not exists 'cancelled';
  alter type public.task_status add value if not exists 'in_review';
exception
  when duplicate_object then null;
end $$;
-- Employee authority level: administrative employees can create/assign tasks like the
-- owner, operative employees can only view organization tasks. Only the organization
-- owner can invite employees (see RLS policy below).
do $$
begin
  create type public.employee_authority_level as enum ('administrative', 'operative');
exception
  when duplicate_object then null;
end $$;

alter table public.employee_access_invites
  add column if not exists authority_level public.employee_authority_level not null default 'operative';

alter table public.employee_access_invites
  alter column authority_level set default 'operative',
  alter column authority_level set not null,
  add constraint employee_access_invites_authority_level_check
    check (authority_level in ('administrative', 'operative'));

create or replace function public.is_organization_owner(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

grant execute on function public.is_organization_owner(uuid) to authenticated;

drop policy if exists "managers can manage employee access invitations" on public.employee_access_invites;

create policy "owners can manage employee access invitations"
  on public.employee_access_invites for all
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));
-- Task lifecycle (pending -> in_progress -> completed, plus cancelled) with per-day
-- completion analytics and a team activity feed. Every row stays scoped by
-- organization_id and the policies below follow the existing membership model.
do $$
begin
  create type public.task_lifecycle_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tasks
  add constraint tasks_completion_timestamps_check
    check (
      (completed_at is null or status = 'done')
      and (cancelled_at is null or status = 'cancelled')
    );

create index if not exists tasks_organization_completed_at_idx
  on public.tasks (organization_id, completed_at)
  where completed_at is not null;
create index if not exists tasks_organization_created_at_idx
  on public.tasks (organization_id, created_at);

do $$
begin
  create type public.task_activity_type as enum (
    'created', 'started', 'completed', 'cancelled',
    'reopened', 'reassigned', 'priority_changed', 'status_changed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.task_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  task_title text not null,
  actor_name text not null,
  activity_type public.task_activity_type not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_events_organization_created_idx
  on public.task_activity_events (organization_id, created_at desc);

alter table public.task_activity_events enable row level security;

create policy "members can read task activity"
  on public.task_activity_events for select
  using (public.is_organization_member(organization_id));
-- Departments, skills, invitation expiry and task deadlines for the employee
-- administration workflow (pending invitations, employee profiles, search,
-- workload and overdue tasks).
alter table public.employee_access_invites
  add column if not exists department text not null default 'General',
  add column if not exists skills text[] not null default '{}',
  add column if not exists sent_at timestamptz not null default created_at,
  add column if not exists expires_at timestamptz not null default (created_at + interval '30 days');

alter table public.employee_access_invites
  alter column department set default 'General',
  alter column department set not null,
  add constraint employee_access_invites_department_length
    check (char_length(department) between 1 and 120);

create index if not exists employee_access_invites_organization_department_idx
  on public.employee_access_invites (organization_id, department);

alter table public.tasks
  add column if not exists due_at timestamptz;

create index if not exists tasks_organization_due_at_idx
  on public.tasks (organization_id, due_at);
-- Task detail: description, categories, estimated effort, review state,
-- comments and attachments. Tasks already carry organization_id and the
-- membership RLS from the initial schema.
alter table public.tasks
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'Otros',
  add column if not exists estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0);

do $$
begin
  alter type public.task_status add value if not exists 'in_review';
exception
  when others then null;
end $$;

create index if not exists tasks_organization_category_idx
  on public.tasks (organization_id, category);

create table if not exists public.organization_categories (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  primary key (organization_id, name)
);

alter table public.organization_categories enable row level security;
create policy "members can manage task categories"
  on public.organization_categories for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_name text not null,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;
create policy "members can access task comments"
  on public.task_comments for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  data_url text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_idx
  on public.task_attachments (task_id, created_at);

alter table public.task_attachments enable row level security;
create policy "members can access task attachments"
  on public.task_attachments for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
-- Task dependencies: a task may depend on other tasks in the same organization.
-- A dependent task must not start/progress/complete/review until every dependency is completed.
create table if not exists public.task_dependencies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint task_dependencies_no_self check (task_id <> depends_on_task_id)
);

create index if not exists task_dependencies_organization_task_idx
  on public.task_dependencies (organization_id, task_id);
create index if not exists task_dependencies_depends_on_idx
  on public.task_dependencies (depends_on_task_id);

alter table public.task_dependencies enable row level security;
create policy "members can access task dependencies"
  on public.task_dependencies for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
-- Fase 1.3 & 1.4: capacidad laboral individual y disponibilidad/ausencias.
alter table public.employee_access_invites
  add column if not exists weekly_capacity_hours numeric(5,2) not null default 40 check (weekly_capacity_hours >= 0),
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'vacation', 'leave', 'absent', 'temporarily_unavailable'));
-- Fase 4: recurrencia, aprobación configurable, onboarding y plantillas de tareas.
alter table public.tasks
  add column if not exists recurrence_frequency text check (recurrence_frequency is null or recurrence_frequency in ('daily', 'weekly', 'fortnight', 'monthly')),
  add column if not exists recurrence_next_due_at timestamptz,
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approver_id uuid references public.employee_access_invites(id) on delete set null;

alter table public.employee_access_invites
  add column if not exists onboarding_completed boolean not null default false;

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Otros',
  priority public.task_priority not null default 'medium',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_templates_organization_idx
  on public.task_templates (organization_id, created_at);

alter table public.task_templates enable row level security;
create policy "members can access task templates"
  on public.task_templates for all
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
-- Tabla para jefes de departamento
-- Un jefe de departamento es un empleado administrativo asignado por el dueño
-- para supervisar un departamento específico. Solo puede asignar tareas a
-- empleados de nivel operativo de ese mismo departamento.

create table if not exists public.department_leads (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department text not null check (length(trim(department)) >= 1),
  employee_id uuid not null references public.employee_access_invites(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (organization_id, department),
  unique (organization_id, employee_id)
);

alter table public.department_leads enable row level security;

-- Solo el dueño de la organización puede gestionar jefes de departamento
create policy "owners can manage department leads"
  on public.department_leads
  for all
  to authenticated
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = public.department_leads.organization_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- Cualquier miembro de la organización puede leer los jefes de departamento
create policy "members can read department leads"
  on public.department_leads
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = public.department_leads.organization_id
        and user_id = auth.uid()
    )
  );

create index if not exists department_leads_organization_department_idx
  on public.department_leads(organization_id, department);

create index if not exists department_leads_organization_employee_idx
  on public.department_leads(organization_id, employee_id);
-- Tabla de departamentos por organización
create table if not exists public.departments (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) >= 1),
  created_at timestamptz not null default now(),
  primary key (id),
  unique (organization_id, name)
);

alter table public.departments enable row level security;

-- Solo el dueño de la organización puede crear/eliminar departamentos
create policy "owners can manage departments"
  on public.departments
  for all
  to authenticated
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = public.departments.organization_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- Cualquier miembro de la organización puede leer los departamentos
create policy "members can read departments"
  on public.departments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = public.departments.organization_id
        and user_id = auth.uid()
    )
  );

create index if not exists departments_organization_idx
  on public.departments(organization_id);
