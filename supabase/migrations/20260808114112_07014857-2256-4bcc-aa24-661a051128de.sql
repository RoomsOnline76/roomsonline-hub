CREATE POLICY "Finance staff can read accounting invoice documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'accounting-invoices'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
);

CREATE POLICY "Finance staff can upload accounting invoice documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'accounting-invoices'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
);

CREATE POLICY "Finance staff can update accounting invoice documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'accounting-invoices'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
);

CREATE POLICY "Finance staff can delete accounting invoice documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'accounting-invoices'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
);