
-- Create deposit schedules table
CREATE TABLE IF NOT EXISTS rolos_deposit_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  rate_plan_id uuid REFERENCES rolos_rate_plans(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Standard Deposit',
  deposit_type text NOT NULL DEFAULT 'percentage',
  deposit_value numeric(12,2) NOT NULL DEFAULT 50,
  due_days_before integer NOT NULL DEFAULT 14,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rolos_deposit_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deposit_schedules_select" ON rolos_deposit_schedules
  FOR SELECT TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "deposit_schedules_manage" ON rolos_deposit_schedules
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

-- Add property_id to rolos_folios if missing (needed for property scoping)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rolos_folios' AND column_name = 'property_id') THEN
    ALTER TABLE rolos_folios ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add guest_name to rolos_folios for display
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rolos_folios' AND column_name = 'guest_name') THEN
    ALTER TABLE rolos_folios ADD COLUMN guest_name text;
  END IF;
END $$;

-- Create invoices storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for invoices bucket
CREATE POLICY "invoices_read_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "invoices_insert_service" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');
