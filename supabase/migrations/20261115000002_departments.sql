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
