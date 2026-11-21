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
