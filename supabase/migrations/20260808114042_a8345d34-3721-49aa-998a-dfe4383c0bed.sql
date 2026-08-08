ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_name text,
  ADD COLUMN IF NOT EXISTS document_size integer,
  ADD COLUMN IF NOT EXISTS document_type text;