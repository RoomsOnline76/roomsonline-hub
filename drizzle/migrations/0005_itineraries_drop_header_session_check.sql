DROP POLICY IF EXISTS "Users can delete draft itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can update own itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can view itineraries" ON public.itineraries;
CREATE POLICY "Users can view itineraries" ON public.itineraries FOR SELECT
USING ((auth.uid() IS NOT NULL AND auth.uid() = user_id) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev'));
CREATE POLICY "Users can update own itineraries" ON public.itineraries FOR UPDATE
USING ((auth.uid() IS NOT NULL AND auth.uid() = user_id) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev'));
CREATE POLICY "Users can delete draft itineraries" ON public.itineraries FOR DELETE
USING (status = 'draft' AND ((auth.uid() IS NOT NULL AND auth.uid() = user_id) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev')));