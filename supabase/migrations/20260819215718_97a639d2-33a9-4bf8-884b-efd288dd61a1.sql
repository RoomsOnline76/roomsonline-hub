-- ============================================================================
-- NATIVE GUEST INTELLIGENCE LAYER
-- Inquiries · website intake keys · digital check-in · departure feedback
-- All native to ROL'OS. HubSpot remains an optional outward projection.
-- ============================================================================

CREATE TYPE public.inquiry_status AS ENUM (
  'new', 'contacted', 'quoted', 'provisional', 'confirmed', 'lost'
);

-- ── Inquiries ───────────────────────────────────────────────────────────────
CREATE TABLE public.rolos_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  owner_id uuid,
  guest_name text NOT NULL,
  guest_email text,
  guest_phone text,
  guest_country text,
  company_name text,
  check_in date,
  check_out date,
  adults integer NOT NULL DEFAULT 2,
  children integer NOT NULL DEFAULT 0,
  status public.inquiry_status NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'manual',
  notes text,
  assigned_to uuid,
  is_trade boolean NOT NULL DEFAULT false,
  lost_reason text,
  linked_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  estimated_value numeric,
  currency text NOT NULL DEFAULT 'ZAR',
  intake_key_id uuid,
  hubspot_synced_at timestamptz,
  first_response_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rolos_inquiries_scope_present
    CHECK (property_id IS NOT NULL OR portfolio_id IS NOT NULL)
);

CREATE INDEX idx_rolos_inquiries_property_status
  ON public.rolos_inquiries(property_id, status);
CREATE INDEX idx_rolos_inquiries_portfolio
  ON public.rolos_inquiries(portfolio_id);
CREATE INDEX idx_rolos_inquiries_created
  ON public.rolos_inquiries(created_at DESC);
CREATE INDEX idx_rolos_inquiries_email
  ON public.rolos_inquiries(lower(guest_email)) WHERE guest_email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_inquiries TO authenticated;
GRANT ALL ON public.rolos_inquiries TO service_role;
ALTER TABLE public.rolos_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped users manage inquiries"
  ON public.rolos_inquiries FOR ALL TO authenticated
  USING (
    (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
    OR (property_id IS NULL AND portfolio_id IS NOT NULL
        AND public.can_access_crm_scope(portfolio_id, NULL, auth.uid()))
  )
  WITH CHECK (
    (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
    OR (property_id IS NULL AND portfolio_id IS NOT NULL
        AND public.can_access_crm_scope(portfolio_id, NULL, auth.uid()))
  );

-- ── Inquiry event trail ─────────────────────────────────────────────────────
CREATE TABLE public.rolos_inquiry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.rolos_inquiries(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status public.inquiry_status,
  to_status public.inquiry_status,
  note text,
  actor_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rolos_inquiry_events_inquiry
  ON public.rolos_inquiry_events(inquiry_id, created_at DESC);

GRANT SELECT, INSERT ON public.rolos_inquiry_events TO authenticated;
GRANT ALL ON public.rolos_inquiry_events TO service_role;
ALTER TABLE public.rolos_inquiry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped users read inquiry events"
  ON public.rolos_inquiry_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rolos_inquiries i
    WHERE i.id = inquiry_id
      AND ((i.property_id IS NOT NULL AND public.can_access_property(i.property_id, auth.uid()))
        OR (i.property_id IS NULL AND i.portfolio_id IS NOT NULL
            AND public.can_access_crm_scope(i.portfolio_id, NULL, auth.uid())))
  ));

CREATE POLICY "Scoped users add inquiry events"
  ON public.rolos_inquiry_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rolos_inquiries i
    WHERE i.id = inquiry_id
      AND ((i.property_id IS NOT NULL AND public.can_access_property(i.property_id, auth.uid()))
        OR (i.property_id IS NULL AND i.portfolio_id IS NOT NULL
            AND public.can_access_crm_scope(i.portfolio_id, NULL, auth.uid())))
  ));

-- ── Publishable website intake keys ─────────────────────────────────────────
CREATE TABLE public.rolos_inquiry_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_public text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Website form',
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  allowed_origins text[] NOT NULL DEFAULT ARRAY[]::text[],
  request_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rolos_inquiry_keys_scope_present
    CHECK (property_id IS NOT NULL OR portfolio_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_inquiry_keys TO authenticated;
GRANT ALL ON public.rolos_inquiry_keys TO service_role;
ALTER TABLE public.rolos_inquiry_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped users manage intake keys"
  ON public.rolos_inquiry_keys FOR ALL TO authenticated
  USING (
    (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
    OR (property_id IS NULL AND portfolio_id IS NOT NULL
        AND public.can_access_crm_scope(portfolio_id, NULL, auth.uid()))
  )
  WITH CHECK (
    (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
    OR (property_id IS NULL AND portfolio_id IS NOT NULL
        AND public.can_access_crm_scope(portfolio_id, NULL, auth.uid()))
  );

ALTER TABLE public.rolos_inquiries
  ADD CONSTRAINT rolos_inquiries_intake_key_fkey
  FOREIGN KEY (intake_key_id) REFERENCES public.rolos_inquiry_keys(id) ON DELETE SET NULL;

-- ── Digital check-in / preference capture ───────────────────────────────────
CREATE TABLE public.rolos_guest_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  guest_profile_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE SET NULL,
  full_name text,
  email text,
  phone text,
  address text,
  nationality text,
  identity_number_encrypted bytea,
  date_of_birth_encrypted bytea,
  arrival_time text,
  travelling_party jsonb NOT NULL DEFAULT '[]'::jsonb,
  dietary_requirements text,
  accessibility_needs text,
  preferences text,
  special_occasion text,
  marketing_consent boolean NOT NULL DEFAULT false,
  vehicle_registration text,
  emergency_contact_name text,
  emergency_contact_phone text,
  submitted_by text NOT NULL DEFAULT 'guest',
  submitted_by_user_id uuid,
  token text,
  token_expires_at timestamptz,
  completed_at timestamptz,
  hubspot_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE UNIQUE INDEX idx_rolos_guest_checkins_token
  ON public.rolos_guest_checkins(token) WHERE token IS NOT NULL;
CREATE INDEX idx_rolos_guest_checkins_property
  ON public.rolos_guest_checkins(property_id);

GRANT SELECT, INSERT, UPDATE ON public.rolos_guest_checkins TO authenticated;
GRANT ALL ON public.rolos_guest_checkins TO service_role;
ALTER TABLE public.rolos_guest_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped users manage guest check-ins"
  ON public.rolos_guest_checkins FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
  WITH CHECK (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()));

-- ── Post-departure feedback ─────────────────────────────────────────────────
CREATE TABLE public.rolos_feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  guest_profile_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE SET NULL,
  guest_name text,
  guest_email text,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  email_sent_at timestamptz,
  email_error text,
  rating integer,
  would_recommend boolean,
  comment text,
  responded_at timestamptz,
  assigned_to uuid,
  resolved_at timestamptz,
  hubspot_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE UNIQUE INDEX idx_rolos_feedback_requests_token
  ON public.rolos_feedback_requests(token);
CREATE INDEX idx_rolos_feedback_requests_property_status
  ON public.rolos_feedback_requests(property_id, status);

GRANT SELECT, INSERT, UPDATE ON public.rolos_feedback_requests TO authenticated;
GRANT ALL ON public.rolos_feedback_requests TO service_role;
ALTER TABLE public.rolos_feedback_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped users manage feedback requests"
  ON public.rolos_feedback_requests FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
  WITH CHECK (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()));

-- ── Per-property survey opt-in (data column only) ───────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS post_stay_survey_enabled boolean NOT NULL DEFAULT false;

-- ── updated_at triggers ─────────────────────────────────────────────────────
CREATE TRIGGER trg_rolos_inquiries_updated_at
  BEFORE UPDATE ON public.rolos_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_rolos_inquiry_keys_updated_at
  BEFORE UPDATE ON public.rolos_inquiry_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_rolos_guest_checkins_updated_at
  BEFORE UPDATE ON public.rolos_guest_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_rolos_feedback_requests_updated_at
  BEFORE UPDATE ON public.rolos_feedback_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Inquiry stage trail + first-response stamp ───────────────────────────────
CREATE OR REPLACE FUNCTION public.log_inquiry_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.first_response_at IS NULL AND NEW.status <> 'new' THEN
      NEW.first_response_at := now();
    END IF;
    INSERT INTO public.rolos_inquiry_events (inquiry_id, event_type, from_status, to_status, actor_id)
    VALUES (NEW.id, 'stage_change', OLD.status, NEW.status, auth.uid());
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.rolos_inquiry_events (inquiry_id, event_type, note, actor_id)
    VALUES (NEW.id, 'assignment', COALESCE(NEW.assigned_to::text, 'unassigned'), auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_inquiry_stage_change
  BEFORE UPDATE ON public.rolos_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.log_inquiry_stage_change();