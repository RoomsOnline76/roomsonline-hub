
-- Create PMS staff role enum
CREATE TYPE public.pms_staff_role AS ENUM (
  'property_owner', 'general_manager', 'front_desk', 
  'housekeeping', 'maintenance', 'accountant', 'auditor'
);

-- Create property_staff table
CREATE TABLE public.property_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_role pms_staff_role NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id)
);

-- Enable RLS
ALTER TABLE public.property_staff ENABLE ROW LEVEL SECURITY;

-- Admins/devs can do everything
CREATE POLICY "Admins and devs can manage all staff"
  ON public.property_staff FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'dev'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'dev'::app_role)
  );

-- Property owners can manage staff for their properties
CREATE POLICY "Property owners can manage their staff"
  ON public.property_staff FOR ALL TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) OR 
    public.is_linked_owner(property_id, auth.uid())
  )
  WITH CHECK (
    public.is_property_owner(property_id, auth.uid()) OR 
    public.is_linked_owner(property_id, auth.uid())
  );

-- Staff can read their own record
CREATE POLICY "Staff can read own record"
  ON public.property_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_property_staff_updated_at
  BEFORE UPDATE ON public.property_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_property_staff_property_id ON public.property_staff(property_id);
CREATE INDEX idx_property_staff_user_id ON public.property_staff(user_id);
