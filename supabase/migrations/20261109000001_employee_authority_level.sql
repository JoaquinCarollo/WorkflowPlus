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
