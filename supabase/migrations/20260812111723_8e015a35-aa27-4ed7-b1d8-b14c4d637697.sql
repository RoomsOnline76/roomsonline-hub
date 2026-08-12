with ranked as (
  select id, row_number() over (
    partition by property_id, lower(trim(name))
    order by updated_at desc nulls last, created_at desc
  ) as rn
  from public.hostfully_room_types
  where is_active = true and name is not null
)
update public.hostfully_room_types t
set is_active = false, updated_at = now()
from ranked r
where t.id = r.id and r.rn > 1;

with ranked as (
  select id, row_number() over (
    partition by property_id, lower(trim(name))
    order by updated_at desc nulls last, created_at desc
  ) as rn
  from public.rolos_room_types
  where is_active = true and name is not null
)
update public.rolos_room_types t
set is_active = false, updated_at = now()
from ranked r
where t.id = r.id and r.rn > 1;