CREATE TABLE public.rolos_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  base_rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE SET NULL,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sell_standalone boolean NOT NULL DEFAULT false,
  min_nights integer NOT NULL DEFAULT 0,
  max_nights integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_packages TO authenticated;
GRANT ALL ON public.rolos_packages TO service_role;

ALTER TABLE public.rolos_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rolos_packages_select" ON public.rolos_packages FOR SELECT TO authenticated USING (
  is_active
  OR is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_packages_insert" ON public.rolos_packages FOR INSERT TO authenticated WITH CHECK (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_packages_update" ON public.rolos_packages FOR UPDATE TO authenticated USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
CREATE POLICY "rolos_packages_delete" ON public.rolos_packages FOR DELETE TO authenticated USING (
  is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE TABLE public.rolos_package_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.rolos_packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_type text NOT NULL DEFAULT 'other'
    CHECK (component_type IN ('accommodation','breakfast','lunch','dinner','activity','transfer','spa','other')),
  value_type text NOT NULL DEFAULT 'amount' CHECK (value_type IN ('amount','percentage')),
  amount numeric NOT NULL DEFAULT 0,
  revenue_stream text NOT NULL DEFAULT 'other' CHECK (revenue_stream IN ('accommodation','fnb','other')),
  quantity_basis text NOT NULL DEFAULT 'per_stay'
    CHECK (quantity_basis IN ('per_stay','per_night','per_person','per_person_per_night','per_room_per_night')),
  quantity numeric NOT NULL DEFAULT 1,
  is_included_in_rate boolean NOT NULL DEFAULT true,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_package_components TO authenticated;
GRANT ALL ON public.rolos_package_components TO service_role;

ALTER TABLE public.rolos_package_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rolos_package_components_select" ON public.rolos_package_components FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rolos_packages p WHERE p.id = package_id AND (
    p.is_active
    OR is_property_owner(p.property_id, auth.uid()) OR is_linked_owner(p.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_package_components_insert" ON public.rolos_package_components FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.rolos_packages p WHERE p.id = package_id AND (
    is_property_owner(p.property_id, auth.uid()) OR is_linked_owner(p.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_package_components_update" ON public.rolos_package_components FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rolos_packages p WHERE p.id = package_id AND (
    is_property_owner(p.property_id, auth.uid()) OR is_linked_owner(p.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);
CREATE POLICY "rolos_package_components_delete" ON public.rolos_package_components FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rolos_packages p WHERE p.id = package_id AND (
    is_property_owner(p.property_id, auth.uid()) OR is_linked_owner(p.property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)))
);

CREATE INDEX idx_rolos_packages_property ON public.rolos_packages(property_id, is_active);
CREATE INDEX idx_rolos_package_components_package ON public.rolos_package_components(package_id);

CREATE TRIGGER trg_rolos_packages_updated_at BEFORE UPDATE ON public.rolos_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_package_components_updated_at BEFORE UPDATE ON public.rolos_package_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rolos_group_room_blocks ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.rolos_packages(id) ON DELETE SET NULL;
ALTER TABLE public.rolos_group_reservations ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.rolos_packages(id) ON DELETE SET NULL;