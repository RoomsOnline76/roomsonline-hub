UPDATE public.bookings
SET commission_type = 'none',
    calculated_commission = 0,
    commission_rate_applied = 0
WHERE integration_type = 'nightsbridge'
  AND (commission_type IS DISTINCT FROM 'none' OR calculated_commission IS NULL);