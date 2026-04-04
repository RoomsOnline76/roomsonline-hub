
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS brand_heading_text_color text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS brand_body_text_color text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS brand_muted_text_color text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS brand_light_bg_color text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS brand_dark_bg_color text;
