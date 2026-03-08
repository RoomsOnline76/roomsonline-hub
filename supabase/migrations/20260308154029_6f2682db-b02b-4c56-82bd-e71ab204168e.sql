ALTER TABLE public.rolos_brand_config 
  ADD COLUMN is_vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN vat_rate numeric(5,2) DEFAULT 15.00;