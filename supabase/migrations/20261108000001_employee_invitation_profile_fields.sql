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
