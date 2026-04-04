
-- Reactivate legitimate hostfully_room_types (ones with hostfully_room_id)
UPDATE hostfully_room_types 
SET is_active = true, updated_at = now()
WHERE property_id = '4758e121-d328-42b2-a3ca-c5fea9ff343e'
AND hostfully_room_id IS NOT NULL;

-- Reactivate linked rolos_room_types
UPDATE rolos_room_types 
SET is_active = true, updated_at = now()
WHERE property_id = '4758e121-d328-42b2-a3ca-c5fea9ff343e'
AND linked_overview_id IN (
  SELECT id FROM hostfully_room_types 
  WHERE property_id = '4758e121-d328-42b2-a3ca-c5fea9ff343e' 
  AND hostfully_room_id IS NOT NULL
);

-- Create missing rolos_room_type for 3BD (has no linked rolos record)
INSERT INTO rolos_room_types (property_id, name, is_active, linked_overview_id)
SELECT '4758e121-d328-42b2-a3ca-c5fea9ff343e', '3BD', true, 'f6fcb3d3-77fe-4d72-b4a7-867347d220a7'
WHERE NOT EXISTS (
  SELECT 1 FROM rolos_room_types WHERE linked_overview_id = 'f6fcb3d3-77fe-4d72-b4a7-867347d220a7'
);

-- Update the linked_rolos_id on the 3BD hostfully record
UPDATE hostfully_room_types 
SET linked_rolos_id = (SELECT id FROM rolos_room_types WHERE linked_overview_id = 'f6fcb3d3-77fe-4d72-b4a7-867347d220a7' LIMIT 1)
WHERE id = 'f6fcb3d3-77fe-4d72-b4a7-867347d220a7';
