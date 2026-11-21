do $$
begin
  alter type public.task_status add value if not exists 'pending';
  alter type public.task_status add value if not exists 'completed';
  alter type public.task_status add value if not exists 'cancelled';
  alter type public.task_status add value if not exists 'in_review';
exception
  when duplicate_object then null;
end $$;
