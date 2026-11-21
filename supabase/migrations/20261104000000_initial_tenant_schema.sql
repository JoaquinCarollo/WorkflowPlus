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
