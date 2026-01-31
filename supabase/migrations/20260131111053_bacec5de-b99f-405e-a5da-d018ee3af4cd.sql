-- Add metadata column to owner_contracts for intent-aware contract workflow
ALTER TABLE public.owner_contracts
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;