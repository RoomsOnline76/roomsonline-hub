ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS is_reports_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reports_client_archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_properties_reports_client
  ON public.properties (is_reports_client)
  WHERE is_reports_client = true;

-- Reports users may see, create and edit ONLY reporting-only client records
CREATE POLICY "Reports users can view reporting clients"
ON public.properties
FOR SELECT
TO authenticated
USING (is_reports_client = true AND public.has_reports_access(auth.uid()));

CREATE POLICY "Reports users can insert reporting clients"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  is_reports_client = true
  AND is_active = false
  AND public.has_reports_access(auth.uid())
);

CREATE POLICY "Reports users can update reporting clients"
ON public.properties
FOR UPDATE
TO authenticated
USING (is_reports_client = true AND public.has_reports_access(auth.uid()))
WITH CHECK (is_reports_client = true AND is_active = false AND public.has_reports_access(auth.uid()));