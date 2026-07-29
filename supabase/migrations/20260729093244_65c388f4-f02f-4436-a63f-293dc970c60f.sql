UPDATE public.pms_tracker_status
SET
  status = 'In Development',
  integration_status = 'in_development',
  active_environment = 'sandbox',
  contact_email = 'sleepinafrica@roomsonline.co.za',
  has_account = true,
  has_docs = true,
  has_edge = true,
  has_health = false,
  has_get = false,
  has_post = false,
  has_modify = false,
  has_cancel = false,
  has_soft_test = false,
  is_certified = false,
  is_production = false,
  notes = 'Account migrated to sleepinafrica@roomsonline.co.za. XML API + GC (Global Connect) API access granted. Sandbox / pre-certification, development phase. Milestone markers reset on new account.',
  additional_info = COALESCE(additional_info, '{}'::jsonb) || jsonb_build_object(
    'user', 'sleepinafrica@roomsonline.co.za',
    'api_access', 'XML API + GC API',
    'phase', 'Sandbox — pre-certification (development)'
  ),
  updated_at = now()
WHERE system_type = 'rentalsunited';