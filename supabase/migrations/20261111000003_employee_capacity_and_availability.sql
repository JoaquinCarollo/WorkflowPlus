-- Fase 1.3 & 1.4: capacidad laboral individual y disponibilidad/ausencias.
alter table public.employee_access_invites
  add column if not exists weekly_capacity_hours numeric(5,2) not null default 40 check (weekly_capacity_hours >= 0),
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'vacation', 'leave', 'absent', 'temporarily_unavailable'));
