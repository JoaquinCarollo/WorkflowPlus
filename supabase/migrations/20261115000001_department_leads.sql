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
