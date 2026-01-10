-- Add account_owner column to supporting_systems table
ALTER TABLE public.supporting_systems 
ADD COLUMN account_owner TEXT;