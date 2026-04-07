
-- =============================================
-- FIX 1: Itineraries — scope session-based access
-- =============================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Users can view itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can update own itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can delete draft itineraries" ON public.itineraries;

-- Recreate SELECT: authenticated users see own rows; anonymous session users
-- can only see rows matching their session_id header; confirmed/completed visible to all
CREATE POLICY "Users can view itineraries" ON public.itineraries
FOR SELECT USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR (
    user_id IS NULL
    AND session_id IS NOT NULL
    AND session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  )
  OR (status IN ('confirmed', 'completed'))
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);

-- Recreate UPDATE: same session scoping
CREATE POLICY "Users can update own itineraries" ON public.itineraries
FOR UPDATE USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR (
    user_id IS NULL
    AND session_id IS NOT NULL
    AND session_id = coalesce(
      current_setting('request.headers', true)::json->>'x-session-id',
      ''
    )
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);

-- Recreate DELETE: same session scoping, draft only
CREATE POLICY "Users can delete draft itineraries" ON public.itineraries
FOR DELETE USING (
  status = 'draft'
  AND (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (
      user_id IS NULL
      AND session_id IS NOT NULL
      AND session_id = coalesce(
        current_setting('request.headers', true)::json->>'x-session-id',
        ''
      )
    )
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
);

-- =============================================
-- FIX 2: Property documents — ownership-based access
-- Documents stored as: property-documents/{property_id}/filename
-- =============================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Authenticated users can view property documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload property documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete property documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;

-- SELECT: owners, linked owners, and admins only
CREATE POLICY "Property owners can view documents" ON storage.objects
FOR SELECT USING (
  bucket_id = 'property-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.owner_email = auth.email()
          OR public.is_linked_owner(p.id, auth.uid())
        )
    )
  )
);

-- INSERT: owners and admins only
CREATE POLICY "Property owners can upload documents" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'property-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.owner_email = auth.email()
          OR public.is_linked_owner(p.id, auth.uid())
        )
    )
  )
);

-- UPDATE: owners and admins only
CREATE POLICY "Property owners can update documents" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'property-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.owner_email = auth.email()
          OR public.is_linked_owner(p.id, auth.uid())
        )
    )
  )
);

-- DELETE: owners and admins only
CREATE POLICY "Property owners can delete documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'property-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.owner_email = auth.email()
          OR public.is_linked_owner(p.id, auth.uid())
        )
    )
  )
);
