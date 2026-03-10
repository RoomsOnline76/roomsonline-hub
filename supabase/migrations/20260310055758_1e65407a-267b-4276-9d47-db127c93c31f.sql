-- Add per-person rate fields to rolos_rate_plans
ALTER TABLE rolos_rate_plans 
  ADD COLUMN IF NOT EXISTS adult_1_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adult_2_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS teen_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS child_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS infant_rate numeric DEFAULT NULL;