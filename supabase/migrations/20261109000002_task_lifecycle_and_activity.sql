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
      and (cancelled_at is null or status::text = 'cancelled')
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
