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
