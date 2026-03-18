-- Cancel orphaned pending bookings for Latter Days
UPDATE bookings SET status = 'cancelled', cancellation_reason = 'Orphaned pending - duplicate from retry'
WHERE id IN ('f333b2c7-e913-45af-8717-b4cbb23ee509', '57cbb5b4-0c43-41a9-abe9-d39710d3f765');

-- Block dates for paid booking 1: Mar 18-20 (room 83d739d4)
INSERT INTO property_availability (property_id, date, available_units, is_stop_sell, room_type, external_system)
VALUES 
  ('ea9a019d-1299-46eb-b371-a0b25eb60350', '2026-03-18', 0, true, '83d739d4-4768-4c1f-878b-5425fab09bad', 'manual'),
  ('ea9a019d-1299-46eb-b371-a0b25eb60350', '2026-03-19', 0, true, '83d739d4-4768-4c1f-878b-5425fab09bad', 'manual')
ON CONFLICT (property_id, room_type, date, external_system) DO UPDATE SET available_units = 0, is_stop_sell = true;

-- Block dates for paid booking 2: Mar 25-27 (room c8253bc0)
INSERT INTO property_availability (property_id, date, available_units, is_stop_sell, room_type, external_system)
VALUES 
  ('ea9a019d-1299-46eb-b371-a0b25eb60350', '2026-03-25', 0, true, 'c8253bc0-4449-422a-bf7e-b215b7aef83e', 'manual'),
  ('ea9a019d-1299-46eb-b371-a0b25eb60350', '2026-03-26', 0, true, 'c8253bc0-4449-422a-bf7e-b215b7aef83e', 'manual')
ON CONFLICT (property_id, room_type, date, external_system) DO UPDATE SET available_units = 0, is_stop_sell = true;