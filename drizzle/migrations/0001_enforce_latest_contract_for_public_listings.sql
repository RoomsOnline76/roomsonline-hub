CREATE OR REPLACE FUNCTION public.property_has_valid_contract(
  _property_id uuid,
  _owner_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH applicable_emails AS (
    SELECT lower(btrim(email)) AS email
    FROM (
      SELECT COALESCE(_owner_email, p.owner_email) AS email
      FROM public.properties p
      WHERE p.id = _property_id
      UNION
      SELECT po.owner_email
      FROM public.property_owners po
      WHERE po.property_id = _property_id
    ) owners
    WHERE email IS NOT NULL AND btrim(email) <> ''
  ),
  latest_owner_contracts AS (
    SELECT DISTINCT ON (lower(btrim(oc.owner_email))) oc.status
    FROM public.owner_contracts oc
    JOIN applicable_emails ae
      ON ae.email = lower(btrim(oc.owner_email))
    ORDER BY lower(btrim(oc.owner_email)), oc.version DESC, oc.created_at DESC, oc.id DESC
  ),
  latest_legacy_contract AS (
    SELECT pc.status
    FROM public.property_contracts pc
    WHERE pc.property_id = _property_id
    ORDER BY pc.version DESC, pc.created_at DESC, pc.id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM latest_owner_contracts)
      THEN EXISTS (
        SELECT 1 FROM latest_owner_contracts
        WHERE status IN ('signed', 'overridden')
      )
    ELSE COALESCE(
      (SELECT status IN ('signed', 'overridden') FROM latest_legacy_contract),
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.property_has_valid_contract(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.property_has_valid_contract(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_contract_before_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.show_on_website = true
     AND (OLD.show_on_website IS DISTINCT FROM true)
     AND NOT public.property_has_valid_contract(NEW.id, NEW.owner_email) THEN
    RAISE EXCEPTION 'Property cannot be shown on website until its latest contract is signed or overridden.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlist_properties_for_revoked_owner_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'revoked' THEN
    UPDATE public.properties p
       SET show_on_website = false,
           listing_status = CASE WHEN p.listing_status = 'live' THEN 'contract_sent' ELSE p.listing_status END,
           updated_at = now()
     WHERE lower(btrim(COALESCE(p.owner_email, ''))) = lower(btrim(NEW.owner_email))
        OR EXISTS (
          SELECT 1
          FROM public.property_owners po
          WHERE po.property_id = p.id
            AND lower(btrim(po.owner_email)) = lower(btrim(NEW.owner_email))
        );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_unlist_properties_on_owner_contract_revocation ON public.owner_contracts;
CREATE TRIGGER tr_unlist_properties_on_owner_contract_revocation
AFTER INSERT OR UPDATE OF status ON public.owner_contracts
FOR EACH ROW
WHEN (NEW.status = 'revoked')
EXECUTE FUNCTION public.unlist_properties_for_revoked_owner_contract();

CREATE OR REPLACE FUNCTION public.revoke_owner_contract(
  _owner_email text,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_contract public.owner_contracts%ROWTYPE;
  revoked_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to revoke owner contracts.';
  END IF;

  IF btrim(COALESCE(_reason, '')) = '' THEN
    RAISE EXCEPTION 'A revocation reason is required.';
  END IF;

  SELECT * INTO latest_contract
  FROM public.owner_contracts
  WHERE lower(btrim(owner_email)) = lower(btrim(_owner_email))
  ORDER BY version DESC, created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF latest_contract.id IS NULL THEN
    RAISE EXCEPTION 'No contract found for this owner.';
  END IF;

  IF latest_contract.status = 'revoked' THEN
    RETURN latest_contract.id;
  END IF;

  INSERT INTO public.owner_contracts (
    owner_email,
    owner_name,
    status,
    version,
    template_version,
    template_version_id,
    override_at,
    override_by,
    override_reason,
    metadata
  ) VALUES (
    latest_contract.owner_email,
    latest_contract.owner_name,
    'revoked',
    latest_contract.version + 1,
    latest_contract.template_version,
    latest_contract.template_version_id,
    now(),
    auth.uid(),
    btrim(_reason),
    COALESCE(latest_contract.metadata, '{}'::jsonb)
  )
  RETURNING id INTO revoked_id;

  RETURN revoked_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_owner_contract(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_owner_contract(text, text) TO authenticated;

CREATE OR REPLACE VIEW public.public_properties AS
SELECT
  p.id,
  p.name,
  p.description,
  p.property_type,
  p.address,
  p.city,
  p.country,
  p.latitude,
  p.longitude,
  p.max_guests,
  p.bedrooms,
  p.bathrooms,
  p.price_per_night,
  p.images,
  p.amenities,
  p.is_active,
  p.slug,
  p.property_url,
  p.navigation_tags,
  p.hero_listing,
  p.external_system,
  p.external_id,
  p.brand_override_enabled,
  p.brand_primary_color,
  p.brand_secondary_color,
  p.brand_font_color,
  p.brand_logo_url,
  p.collections,
  p.created_at,
  p.updated_at
FROM public.properties p
WHERE p.is_active = true
  AND p.show_on_website = true
  AND p.permanently_deleted_at IS NULL
  AND public.property_has_valid_contract(p.id, p.owner_email);

GRANT SELECT ON public.public_properties TO anon, authenticated, service_role;