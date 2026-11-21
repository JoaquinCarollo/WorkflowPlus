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
