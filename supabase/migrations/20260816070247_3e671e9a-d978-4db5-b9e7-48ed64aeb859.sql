create table if not exists public.ru_lnm_repull_queue (
  id uuid primary key default gen_random_uuid(),
  ru_property_id text not null,
  ru_owner_id text,
  property_id uuid,
  kind text not null default 'ari',
  date_from date,
  date_to date,
  notifications integer not null default 1,
  change_types text[] not null default '{}',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  last_change_id text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists ru_lnm_repull_queue_pending_key
  on public.ru_lnm_repull_queue (ru_property_id, kind, coalesce(ru_owner_id, ''))
  where status = 'pending';

create index if not exists ru_lnm_repull_queue_status_idx
  on public.ru_lnm_repull_queue (status, first_seen_at);

grant select on public.ru_lnm_repull_queue to authenticated;
grant all on public.ru_lnm_repull_queue to service_role;

alter table public.ru_lnm_repull_queue enable row level security;

create policy "Admins can view the channel repull queue"
on public.ru_lnm_repull_queue
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'dev')
  or public.has_role(auth.uid(), 'fearless_leader')
);

create or replace function public.ru_queue_lnm_repull(
  _ru_property_id text,
  _kind text,
  _ru_owner_id text default null,
  _property_id uuid default null,
  _date_from date default null,
  _date_to date default null,
  _change_type text default null,
  _change_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  update public.ru_lnm_repull_queue
     set date_from = least(coalesce(date_from, _date_from), coalesce(_date_from, date_from)),
         date_to = greatest(coalesce(date_to, _date_to), coalesce(_date_to, date_to)),
         notifications = notifications + 1,
         change_types = case
           when _change_type is null or _change_type = any(change_types) then change_types
           else array_append(change_types, _change_type)
         end,
         property_id = coalesce(property_id, _property_id),
         ru_owner_id = coalesce(ru_owner_id, _ru_owner_id),
         last_change_id = coalesce(_change_id, last_change_id),
         updated_at = now()
   where status = 'pending'
     and ru_property_id = _ru_property_id
     and kind = _kind
     and coalesce(ru_owner_id, '') = coalesce(_ru_owner_id, '')
  returning id into _id;

  if _id is not null then
    return _id;
  end if;

  insert into public.ru_lnm_repull_queue (
    ru_property_id, ru_owner_id, property_id, kind, date_from, date_to,
    change_types, last_change_id
  ) values (
    _ru_property_id, _ru_owner_id, _property_id, _kind, _date_from, _date_to,
    case when _change_type is null then '{}'::text[] else array[_change_type] end,
    _change_id
  )
  on conflict do nothing
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.ru_queue_lnm_repull(text, text, text, uuid, date, date, text, text) from public;
grant execute on function public.ru_queue_lnm_repull(text, text, text, uuid, date, date, text, text) to service_role;