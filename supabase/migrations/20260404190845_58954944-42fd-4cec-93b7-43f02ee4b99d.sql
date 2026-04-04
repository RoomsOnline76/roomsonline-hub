ALTER TABLE public.property_specials
  ADD COLUMN IF NOT EXISTS book_from date,
  ADD COLUMN IF NOT EXISTS book_until date;