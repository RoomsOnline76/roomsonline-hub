update hostfully_room_types r
set is_active = true, updated_at = now()
where not r.is_active
  and (
    (r.property_id = 'a22384f0-749f-4c48-add5-efd6103caf25' and r.name in ('Dassie','Steenbok','Grysbok'))
    or (r.property_id = '00015d06-a9cb-4e82-a62e-a7685e5d7c33' and r.name = 'Galjoen')
  );