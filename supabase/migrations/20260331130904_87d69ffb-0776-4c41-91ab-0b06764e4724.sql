
-- Phase 0: Experience Engine Foundation

-- 1. New table: rolos_policies
CREATE TABLE public.rolos_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  policy_type text NOT NULL,
  rule jsonb NOT NULL,
  is_ai_generated boolean DEFAULT false,
  last_evaluated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, policy_type)
);

ALTER TABLE public.rolos_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/devs full access to policies"
  ON public.rolos_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners read own property policies"
  ON public.rolos_policies FOR SELECT TO authenticated
  USING (public.is_property_owner(property_id, auth.uid()) OR public.is_linked_owner(property_id, auth.uid()));

CREATE TRIGGER set_rolos_policies_updated_at
  BEFORE UPDATE ON public.rolos_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. New table: rolos_experience_configs
CREATE TABLE public.rolos_experience_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  experience_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, experience_type)
);

ALTER TABLE public.rolos_experience_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/devs full access to experience configs"
  ON public.rolos_experience_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners read own property experience configs"
  ON public.rolos_experience_configs FOR SELECT TO authenticated
  USING (public.is_property_owner(property_id, auth.uid()) OR public.is_linked_owner(property_id, auth.uid()));

CREATE TRIGGER set_rolos_experience_configs_updated_at
  BEFORE UPDATE ON public.rolos_experience_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend rolos_ui_configs
ALTER TABLE public.rolos_ui_configs ADD COLUMN IF NOT EXISTS experience_engine_enabled boolean DEFAULT false;

-- 4. Extend pms_mappings
ALTER TABLE public.pms_mappings ADD COLUMN IF NOT EXISTS experience_mapping jsonb;

-- 5. Add guest role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'guest';
