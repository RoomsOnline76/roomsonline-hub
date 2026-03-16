
-- Create rolos_channel_api_config table for platform-level OTA API credentials
CREATE TABLE public.rolos_channel_api_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rolos_channel_api_config ENABLE ROW LEVEL SECURITY;

-- Only admin/dev can read
CREATE POLICY "Admin/dev can read channel api config"
  ON public.rolos_channel_api_config
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  );

-- Only admin/dev can insert
CREATE POLICY "Admin/dev can insert channel api config"
  ON public.rolos_channel_api_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  );

-- Only admin/dev can update
CREATE POLICY "Admin/dev can update channel api config"
  ON public.rolos_channel_api_config
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  );

-- Only admin/dev can delete
CREATE POLICY "Admin/dev can delete channel api config"
  ON public.rolos_channel_api_config
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  );
