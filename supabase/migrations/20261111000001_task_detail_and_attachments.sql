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
