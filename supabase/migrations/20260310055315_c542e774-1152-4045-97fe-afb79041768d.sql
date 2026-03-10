-- Clean up duplicate Per Person rate types, keeping only 3dc3e639 as canonical
-- and update pricingModel values correctly
UPDATE properties 
SET amenities = jsonb_set(
  jsonb_set(
    amenities,
    '{pms_rate_types}',
    (
      SELECT jsonb_agg(
        CASE 
          WHEN rt->>'id' = 'e8420a3a-e79f-409a-8e18-d9e24e60a04a' 
          THEN jsonb_set(rt, '{pricingModel}', '"per_room"')
          WHEN rt->>'id' = '3dc3e639-7f73-402b-9365-d3ecda118531'
          THEN jsonb_set(jsonb_set(rt, '{pricingModel}', '"per_person"'), '{priceType}', '"per_person"')
          ELSE NULL
        END
      ) FILTER (WHERE rt->>'id' IN ('e8420a3a-e79f-409a-8e18-d9e24e60a04a', '3dc3e639-7f73-402b-9365-d3ecda118531'))
      FROM jsonb_array_elements(amenities->'pms_rate_types') AS rt
    )
  ),
  '{room_types}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN rt->>'name' = '3 Bedroomed Holiday House'
        THEN jsonb_set(rt, '{linkedRateTypes}', '["e8420a3a-e79f-409a-8e18-d9e24e60a04a"]')
        WHEN rt->>'name' = 'Dungeon'
        THEN jsonb_set(rt, '{linkedRateTypes}', '["3dc3e639-7f73-402b-9365-d3ecda118531"]')
        ELSE rt
      END
    )
    FROM jsonb_array_elements(amenities->'room_types') AS rt
  )
)
WHERE id = 'ea9a019d-1299-46eb-b371-a0b25eb60350';

-- Clean up duplicate rolos_rate_plans, keeping only the originals
DELETE FROM rolos_rate_plans 
WHERE property_id = 'ea9a019d-1299-46eb-b371-a0b25eb60350'
  AND name = 'Per Person'
  AND id NOT IN ('3dc3e639-7f73-402b-9365-d3ecda118531');
