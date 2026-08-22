-- 1. Revoke public/anon execute on privileged internal functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.prorettype::regtype::text AS rettype
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'assign_portfolio_share_invoice_number','assign_rol_booking_reference',
        'assign_rol_itinerary_reference','assign_subscription_invoice_number',
        'enqueue_channel_booking_sync','mirror_rate_plan_season_rate_to_legacy',
        'raise_setup_invoice_on_contract_signed',
        'next_commission_statement_reference','next_payout_reference',
        'next_rol_booking_reference','next_rol_document_reference',
        'next_rol_itinerary_reference','rebuild_guest_stats',
        'resolve_property_owner_uuid','rol_party_code','ru_api_log_facets',
        'ru_push_gate_status','ru_queue_lnm_repull'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    IF r.rettype = 'trigger' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2. Lock down wizard_audit_log inserts
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.wizard_audit_log;

CREATE POLICY "Privileged users insert own audit logs"
ON public.wizard_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

GRANT SELECT, INSERT ON public.wizard_audit_log TO authenticated;
GRANT ALL ON public.wizard_audit_log TO service_role;