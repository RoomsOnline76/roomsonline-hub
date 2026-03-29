
-- RLS policies for sales reps to view their own referrals and commission reports
CREATE POLICY "Rep views own referrals" ON public.property_referrals
  FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

CREATE POLICY "Rep views own commission reports" ON public.rep_commission_reports
  FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

-- Allow reps to view their own bank details
CREATE POLICY "Rep views own bank details" ON public.sales_rep_bank_details
  FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));
