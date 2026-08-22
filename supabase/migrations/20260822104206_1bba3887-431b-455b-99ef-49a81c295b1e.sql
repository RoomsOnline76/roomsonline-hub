-- Cathedral Peak's room count was captured as monthly capacity days (3225),
-- which divided occupancy by ~31. 3225 / 31 = 104 sellable rooms.
update property_report_settings
set room_count = 104, updated_at = now()
where property_id = 'ed2a7a4f-f4a5-48ee-b3d9-c2972f834a55'
  and room_count = 3225;

-- Occupancy percentages were imported into the previous-room-nights map, which
-- made previous ADR (revenue / nights) read in the millions. Drop the
-- implausible entries; the report falls back to no previous ADR for those months.
update report_runs r
set imported_baseline = jsonb_set(
      r.imported_baseline,
      '{previous_room_nights}',
      coalesce((
        select jsonb_object_agg(k, v)
        from jsonb_each(r.imported_baseline -> 'previous_room_nights') as e(k, v)
        where (v#>>'{}')::numeric >= 1
      ), '{}'::jsonb)
    )
where r.imported_baseline ? 'previous_room_nights'
  and exists (
    select 1
    from jsonb_each(r.imported_baseline -> 'previous_room_nights') as e(k, v)
    where (v#>>'{}')::numeric < 1
  );

-- Same guard for the snapshots already written from those baselines.
update report_snapshots s
set previous_room_nights = coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(s.previous_room_nights) as e(k, v)
      where (v#>>'{}')::numeric >= 1
    ), '{}'::jsonb)
where s.previous_room_nights is not null
  and exists (
    select 1
    from jsonb_each(s.previous_room_nights) as e(k, v)
    where (v#>>'{}')::numeric < 1
  );