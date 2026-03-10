-- Fix priceType for Per Person rate
UPDATE properties 
SET amenities = jsonb_set(
  amenities,
  '{pms_rate_types}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN rt->>'id' = '3dc3e639-7f73-402b-9365-d3ecda118531'
        THEN jsonb_set(rt, '{priceType}', '"per_person"')
        ELSE rt
      END
    )
    FROM jsonb_array_elements(amenities->'pms_rate_types') AS rt
  )
)
WHERE id = 'ea9a019d-1299-46eb-b371-a0b25eb60350';