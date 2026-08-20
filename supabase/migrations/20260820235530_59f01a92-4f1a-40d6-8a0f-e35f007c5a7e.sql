DELETE FROM public.rolos_rate_plan_season_rates
WHERE room_type_id IN (
  '0ca9a0ae-10dd-4476-99f3-b25c338ce8d1',
  'c6f8a2a8-f0cc-46d9-850f-be10f0b32bc5',
  '8a4988c3-7994-4c75-b463-3b672caf5ddc');

DELETE FROM public.rolos_rate_plan_room_types
WHERE room_type_id IN (
  '0ca9a0ae-10dd-4476-99f3-b25c338ce8d1',
  'c6f8a2a8-f0cc-46d9-850f-be10f0b32bc5',
  '8a4988c3-7994-4c75-b463-3b672caf5ddc');

DELETE FROM public.hostfully_room_types
WHERE id IN (
  '4ee01a54-9e12-40bc-9a4f-f6f637a805bd',
  '1d8e5b88-162f-4a55-9fd6-2e97fed32c7d',
  'b1904231-42e4-49ea-8577-e7b7d58e7c0b');

DELETE FROM public.rolos_room_types
WHERE property_id = '4b1e0a10-0000-4000-8000-000000000002'
  AND id <> 'b698d728-c991-40b5-a169-f98af6959a92';