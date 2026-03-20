
-- UI Configurator table
CREATE TABLE public.rolos_ui_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, component_type)
);

ALTER TABLE public.rolos_ui_configs ENABLE ROW LEVEL SECURITY;

-- RLS: admin/dev/fearless_leader can read/write
CREATE POLICY "Admin/dev can manage UI configs" ON public.rolos_ui_configs
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Updated_at trigger
CREATE TRIGGER update_rolos_ui_configs_updated_at
  BEFORE UPDATE ON public.rolos_ui_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
