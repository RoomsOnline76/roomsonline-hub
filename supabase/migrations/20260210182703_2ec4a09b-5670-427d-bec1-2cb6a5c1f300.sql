
-- Add fearless_leader to ALL RLS policies that reference dev but not fearless_leader
-- Excluding api_keys (integrations)

-- ai_search_logs
DROP POLICY "Admins and devs can view AI search logs" ON public.ai_search_logs;
CREATE POLICY "Admins and devs can view AI search logs" ON public.ai_search_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- audit_logs
DROP POLICY "Admins and devs can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and devs can view audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- book_page_images
DROP POLICY "Admins and devs can manage book page images" ON public.book_page_images;
CREATE POLICY "Admins and devs can manage book page images" ON public.book_page_images FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- booking_sync_status
DROP POLICY "Admins and devs can view all booking sync status" ON public.booking_sync_status;
CREATE POLICY "Admins and devs can view all booking sync status" ON public.booking_sync_status FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- bookings
DROP POLICY "Admins and devs can view all bookings" ON public.bookings;
CREATE POLICY "Admins and devs can view all bookings" ON public.bookings FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- brochure_templates
DROP POLICY "Admins can manage templates" ON public.brochure_templates;
CREATE POLICY "Admins can manage templates" ON public.brochure_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- charge_presets
DROP POLICY "Admins and devs can manage charge presets" ON public.charge_presets;
CREATE POLICY "Admins and devs can manage charge presets" ON public.charge_presets FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- checkfront_connections
DROP POLICY "Admins and devs can manage checkfront connections" ON public.checkfront_connections;
CREATE POLICY "Admins and devs can manage checkfront connections" ON public.checkfront_connections FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- contract_template_versions
DROP POLICY "Admin/Dev can update contract versions" ON public.contract_template_versions;
CREATE POLICY "Admin/Dev can update contract versions" ON public.contract_template_versions FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can view contract versions" ON public.contract_template_versions;
CREATE POLICY "Admin/Dev can view contract versions" ON public.contract_template_versions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- Note: INSERT policy for contract_template_versions uses WITH CHECK
DROP POLICY IF EXISTS "Admin/Dev can insert contract versions" ON public.contract_template_versions;
CREATE POLICY "Admin/Dev can insert contract versions" ON public.contract_template_versions FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- contract_templates
DROP POLICY "Admin/Dev can delete contract templates" ON public.contract_templates;
CREATE POLICY "Admin/Dev can delete contract templates" ON public.contract_templates FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can update contract templates" ON public.contract_templates;
CREATE POLICY "Admin/Dev can update contract templates" ON public.contract_templates FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can view contract templates" ON public.contract_templates;
CREATE POLICY "Admin/Dev can view contract templates" ON public.contract_templates FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY IF EXISTS "Admin/Dev can insert contract templates" ON public.contract_templates;
CREATE POLICY "Admin/Dev can insert contract templates" ON public.contract_templates FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- field_registry
DROP POLICY "Admin/Dev can manage field registry" ON public.field_registry;
CREATE POLICY "Admin/Dev can manage field registry" ON public.field_registry FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- financial_metrics
DROP POLICY "Admins and devs can manage financial metrics" ON public.financial_metrics;
CREATE POLICY "Admins and devs can manage financial metrics" ON public.financial_metrics FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- help_articles
DROP POLICY "Admins can delete help articles" ON public.help_articles;
CREATE POLICY "Admins can delete help articles" ON public.help_articles FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins can update help articles" ON public.help_articles;
CREATE POLICY "Admins can update help articles" ON public.help_articles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Users can read matching help articles" ON public.help_articles;
CREATE POLICY "Users can read matching help articles" ON public.help_articles FOR SELECT USING ((is_published = true) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role) OR ('all'::text = ANY (role_target)) OR (get_user_help_role(auth.uid()) = ANY (role_target))));

-- help_search_logs
DROP POLICY "Admins can view search logs" ON public.help_search_logs;
CREATE POLICY "Admins can view search logs" ON public.help_search_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- hostfully_room_types
DROP POLICY "Admins and devs can manage all hostfully room types" ON public.hostfully_room_types;
CREATE POLICY "Admins and devs can manage all hostfully room types" ON public.hostfully_room_types FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- invoices
DROP POLICY "Admins and devs can manage invoices" ON public.invoices;
CREATE POLICY "Admins and devs can manage invoices" ON public.invoices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- itinerary_bookings
DROP POLICY "Users can delete own itinerary bookings" ON public.itinerary_bookings;
CREATE POLICY "Users can delete own itinerary bookings" ON public.itinerary_bookings FOR DELETE USING ((EXISTS (SELECT 1 FROM itineraries i WHERE i.id = itinerary_bookings.itinerary_id AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Users can update own itinerary bookings" ON public.itinerary_bookings;
CREATE POLICY "Users can update own itinerary bookings" ON public.itinerary_bookings FOR UPDATE USING ((EXISTS (SELECT 1 FROM itineraries i WHERE i.id = itinerary_bookings.itinerary_id AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Users can view own itinerary bookings" ON public.itinerary_bookings;
CREATE POLICY "Users can view own itinerary bookings" ON public.itinerary_bookings FOR SELECT USING ((EXISTS (SELECT 1 FROM itineraries i WHERE i.id = itinerary_bookings.itinerary_id AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- journals
DROP POLICY "Admins and devs can manage journals" ON public.journals;
CREATE POLICY "Admins and devs can manage journals" ON public.journals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- local_experiences
DROP POLICY "Admins can manage all experiences" ON public.local_experiences;
CREATE POLICY "Admins can manage all experiences" ON public.local_experiences FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- navigation_tag_categories
DROP POLICY "Admins and devs can manage tag categories" ON public.navigation_tag_categories;
CREATE POLICY "Admins and devs can manage tag categories" ON public.navigation_tag_categories FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- nightsbridge_booking_sessions
DROP POLICY "Admins can update booking sessions" ON public.nightsbridge_booking_sessions;
CREATE POLICY "Admins can update booking sessions" ON public.nightsbridge_booking_sessions FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins can view all booking sessions" ON public.nightsbridge_booking_sessions;
CREATE POLICY "Admins can view all booking sessions" ON public.nightsbridge_booking_sessions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- onboarding_fields
DROP POLICY "Admin/Dev can manage fields" ON public.onboarding_fields;
CREATE POLICY "Admin/Dev can manage fields" ON public.onboarding_fields FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can view fields" ON public.onboarding_fields;
CREATE POLICY "Admin/Dev can view fields" ON public.onboarding_fields FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- onboarding_steps
DROP POLICY "Admin/Dev can manage steps" ON public.onboarding_steps;
CREATE POLICY "Admin/Dev can manage steps" ON public.onboarding_steps FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can view steps" ON public.onboarding_steps;
CREATE POLICY "Admin/Dev can view steps" ON public.onboarding_steps FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- onboarding_wizards
DROP POLICY "Admin/Dev can delete wizards" ON public.onboarding_wizards;
CREATE POLICY "Admin/Dev can delete wizards" ON public.onboarding_wizards FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can update wizards" ON public.onboarding_wizards;
CREATE POLICY "Admin/Dev can update wizards" ON public.onboarding_wizards FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admin/Dev can view wizards" ON public.onboarding_wizards;
CREATE POLICY "Admin/Dev can view wizards" ON public.onboarding_wizards FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- owner_contracts (THE KEY ONE for this issue)
DROP POLICY "Admins and devs full access to owner_contracts" ON public.owner_contracts;
CREATE POLICY "Admins and devs full access to owner_contracts" ON public.owner_contracts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- payment_transactions
DROP POLICY "Admins and devs can manage payment transactions" ON public.payment_transactions;
CREATE POLICY "Admins and devs can manage payment transactions" ON public.payment_transactions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_availability_cache
DROP POLICY "Admins and devs can manage availability cache" ON public.pms_availability_cache;
CREATE POLICY "Admins and devs can manage availability cache" ON public.pms_availability_cache FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_credentials
DROP POLICY "Admins and devs can delete pms credentials" ON public.pms_credentials;
CREATE POLICY "Admins and devs can delete pms credentials" ON public.pms_credentials FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can update pms credentials" ON public.pms_credentials;
CREATE POLICY "Admins and devs can update pms credentials" ON public.pms_credentials FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can view pms credentials" ON public.pms_credentials;
CREATE POLICY "Admins and devs can view pms credentials" ON public.pms_credentials FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_dev_notes_log
DROP POLICY "Devs can manage dev notes log" ON public.pms_dev_notes_log;
CREATE POLICY "Devs can manage dev notes log" ON public.pms_dev_notes_log FOR ALL USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_mappings
DROP POLICY "Admins and devs can manage pms mappings" ON public.pms_mappings;
CREATE POLICY "Admins and devs can manage pms mappings" ON public.pms_mappings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_rate_types_cache
DROP POLICY "Admins and devs can manage rate types cache" ON public.pms_rate_types_cache;
CREATE POLICY "Admins and devs can manage rate types cache" ON public.pms_rate_types_cache FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_reservations
DROP POLICY "Admins and devs can manage pms reservations" ON public.pms_reservations;
CREATE POLICY "Admins and devs can manage pms reservations" ON public.pms_reservations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_room_types_cache
DROP POLICY "Admins and devs can manage room types cache" ON public.pms_room_types_cache;
CREATE POLICY "Admins and devs can manage room types cache" ON public.pms_room_types_cache FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- pms_tracker_status
DROP POLICY "Admins can update tracker status" ON public.pms_tracker_status;
CREATE POLICY "Admins can update tracker status" ON public.pms_tracker_status FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins can view tracker status" ON public.pms_tracker_status;
CREATE POLICY "Admins can view tracker status" ON public.pms_tracker_status FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- properties
DROP POLICY "Admins and devs can delete properties" ON public.properties;
CREATE POLICY "Admins and devs can delete properties" ON public.properties FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can update properties" ON public.properties;
CREATE POLICY "Admins and devs can update properties" ON public.properties FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can view all properties" ON public.properties;
CREATE POLICY "Admins and devs can view all properties" ON public.properties FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- property_availability
DROP POLICY "Admins and devs can manage all availability" ON public.property_availability;
CREATE POLICY "Admins and devs can manage all availability" ON public.property_availability FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Owners can delete availability for their properties" ON public.property_availability;
CREATE POLICY "Owners can delete availability for their properties" ON public.property_availability FOR DELETE USING ((auth.uid() IS NOT NULL) AND ((EXISTS (SELECT 1 FROM properties p WHERE p.id = property_availability.property_id AND p.owner_email = auth.email())) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)));

DROP POLICY "Owners can update availability for their properties" ON public.property_availability;
CREATE POLICY "Owners can update availability for their properties" ON public.property_availability FOR UPDATE USING ((auth.uid() IS NOT NULL) AND ((EXISTS (SELECT 1 FROM properties p WHERE p.id = property_availability.property_id AND p.owner_email = auth.email())) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)));

DROP POLICY "Users can view availability for accessible properties" ON public.property_availability;
CREATE POLICY "Users can view availability for accessible properties" ON public.property_availability FOR SELECT USING ((auth.uid() IS NOT NULL) AND ((EXISTS (SELECT 1 FROM properties p WHERE p.id = property_availability.property_id AND p.owner_email = auth.email())) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)));

-- property_charges
DROP POLICY "Admins and devs can manage all charges" ON public.property_charges;
CREATE POLICY "Admins and devs can manage all charges" ON public.property_charges FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- property_commercial_terms (uses different pattern with EXISTS)
DROP POLICY "Admin/dev delete commercial terms" ON public.property_commercial_terms;
CREATE POLICY "Admin/dev delete commercial terms" ON public.property_commercial_terms FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'dev'::app_role, 'fearless_leader'::app_role])));

DROP POLICY "Admin/dev read commercial terms" ON public.property_commercial_terms;
CREATE POLICY "Admin/dev read commercial terms" ON public.property_commercial_terms FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'dev'::app_role, 'fearless_leader'::app_role])));

DROP POLICY "Admin/dev update commercial terms" ON public.property_commercial_terms;
CREATE POLICY "Admin/dev update commercial terms" ON public.property_commercial_terms FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'dev'::app_role, 'fearless_leader'::app_role])));

-- property_contracts
DROP POLICY "Admins and devs can manage contracts" ON public.property_contracts;
CREATE POLICY "Admins and devs can manage contracts" ON public.property_contracts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- property_onboarding_tokens
DROP POLICY "Admins can manage onboarding tokens" ON public.property_onboarding_tokens;
CREATE POLICY "Admins can manage onboarding tokens" ON public.property_onboarding_tokens FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- property_rates
DROP POLICY "Admins and devs can manage all rates" ON public.property_rates;
CREATE POLICY "Admins and devs can manage all rates" ON public.property_rates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- supporting_systems
DROP POLICY "Admins and devs can manage supporting systems" ON public.supporting_systems;
CREATE POLICY "Admins and devs can manage supporting systems" ON public.supporting_systems FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- sync_logs
DROP POLICY "Admins and devs can view all sync logs" ON public.sync_logs;
CREATE POLICY "Admins and devs can view all sync logs" ON public.sync_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- system_alerts
DROP POLICY "Admins and devs can manage alerts" ON public.system_alerts;
CREATE POLICY "Admins and devs can manage alerts" ON public.system_alerts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can view all alerts" ON public.system_alerts;
CREATE POLICY "Admins and devs can view all alerts" ON public.system_alerts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- system_health_aggregates
DROP POLICY "Admins and devs can view health aggregates" ON public.system_health_aggregates;
CREATE POLICY "Admins and devs can view health aggregates" ON public.system_health_aggregates FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- system_health_checks
DROP POLICY "Admins and devs can view health checks" ON public.system_health_checks;
CREATE POLICY "Admins and devs can view health checks" ON public.system_health_checks FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- system_health_components
DROP POLICY "Admins and devs can manage health components" ON public.system_health_components;
CREATE POLICY "Admins and devs can manage health components" ON public.system_health_components FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Admins and devs can view health components" ON public.system_health_components;
CREATE POLICY "Admins and devs can view health components" ON public.system_health_components FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- test_logs
DROP POLICY "Dev users can delete test logs" ON public.test_logs;
CREATE POLICY "Dev users can delete test logs" ON public.test_logs FOR DELETE USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Dev users can select test logs" ON public.test_logs;
CREATE POLICY "Dev users can select test logs" ON public.test_logs FOR SELECT USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Dev users can update test logs" ON public.test_logs;
CREATE POLICY "Dev users can update test logs" ON public.test_logs FOR UPDATE USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- test_runs
DROP POLICY "Dev users can delete test runs" ON public.test_runs;
CREATE POLICY "Dev users can delete test runs" ON public.test_runs FOR DELETE USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Dev users can select test runs" ON public.test_runs;
CREATE POLICY "Dev users can select test runs" ON public.test_runs FOR SELECT USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY "Dev users can update test runs" ON public.test_runs;
CREATE POLICY "Dev users can update test runs" ON public.test_runs FOR UPDATE USING (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)) WITH CHECK (has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

-- wizard_audit_log
DROP POLICY "Admin/Dev can view audit logs" ON public.wizard_audit_log;
CREATE POLICY "Admin/Dev can view audit logs" ON public.wizard_audit_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));
