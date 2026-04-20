-- Clear RU property IDs for Fonteinhutte units so re-push creates fresh RUIDs in ZAR location
UPDATE public.hostfully_room_types
SET rentalsunited_property_id = NULL,
    updated_at = now()
WHERE rentalsunited_property_id IN ('4692654','4692655','4692656','4692657','4692658','4692659','4692660','4692661','4692662');

-- Also clear the building-level RU ID on the parent property if set
UPDATE public.properties
SET rentalsunited_property_id = NULL,
    updated_at = now()
WHERE id IN (
  SELECT DISTINCT property_id FROM public.hostfully_room_types
  WHERE id IN (
    'b03b031a-9218-45a0-97c3-8a94abb0f658',
    'c2184bdd-ea88-4fba-8bdf-be2536d68a70',
    'a05002bb-0909-4090-aaa8-cd4e1cdf490a',
    '2a136ee4-fd20-4807-8012-2fe2c3b35416',
    'd6ca395e-7615-4eb1-a023-450894fca796',
    '99c8da69-9812-47a7-bf16-ba07d8d446c8',
    'b3c86848-a493-44d3-a802-b0b39129a087',
    '0a4d6054-c1e1-4e39-8b1d-565e4a227478',
    '891de6c5-dd5c-4047-bb8d-dd768f713110'
  )
);