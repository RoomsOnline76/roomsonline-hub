
-- Seed onboarding_fields for the Property Onboarding wizard
-- Step: property_identity (f50da661-aadc-40fc-8a80-62bf9bf831ce)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'name', 'Property Name', true, false, 10, 0, true),
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'property_type', 'Property Type', true, false, 5, 1, true),
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'property_url', 'Website URL', false, true, 3, 2, true),
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'amenities.registered_business_name', 'Registered Business Name', false, false, 1, 3, true),
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'amenities.registration_number', 'Registration Number', false, false, 1, 4, true),
('f50da661-aadc-40fc-8a80-62bf9bf831ce', 'amenities.vat_number', 'VAT Number', false, false, 0, 5, true);

-- Step: contact_details (dc0b4c6e-6683-4baa-af5d-8d49fe322ca6)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('dc0b4c6e-6683-4baa-af5d-8d49fe322ca6', 'amenities.telephone', 'Contact Phone', true, false, 3, 0, true),
('dc0b4c6e-6683-4baa-af5d-8d49fe322ca6', 'amenities.contact_email', 'Contact Email', true, false, 3, 1, true),
('dc0b4c6e-6683-4baa-af5d-8d49fe322ca6', 'amenities.mobile_number', 'Mobile Number', false, false, 1, 2, true),
('dc0b4c6e-6683-4baa-af5d-8d49fe322ca6', 'amenities.key_representative', 'Key Representative', false, false, 1, 3, true);

-- Step: location (d540da3d-8842-406c-9ea6-d487be82cbc6)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('d540da3d-8842-406c-9ea6-d487be82cbc6', 'address', 'Street Address', true, true, 5, 0, true),
('d540da3d-8842-406c-9ea6-d487be82cbc6', 'city', 'City', true, true, 3, 1, true),
('d540da3d-8842-406c-9ea6-d487be82cbc6', 'country', 'Country', true, true, 3, 2, true),
('d540da3d-8842-406c-9ea6-d487be82cbc6', 'latitude', 'Latitude', false, true, 2, 3, true),
('d540da3d-8842-406c-9ea6-d487be82cbc6', 'longitude', 'Longitude', false, true, 2, 4, true);

-- Step: policies_pricing (c0347dc8-713b-42e8-a683-547adceae5af)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('c0347dc8-713b-42e8-a683-547adceae5af', 'amenities.check_in_time', 'Check-in Time', true, false, 3, 0, true),
('c0347dc8-713b-42e8-a683-547adceae5af', 'amenities.check_out_time', 'Check-out Time', true, false, 3, 1, true),
('c0347dc8-713b-42e8-a683-547adceae5af', 'amenities.cancellation_policy', 'Cancellation Policy', false, false, 2, 2, true),
('c0347dc8-713b-42e8-a683-547adceae5af', 'amenities.banking', 'Banking Details', false, false, 1, 3, true),
('c0347dc8-713b-42e8-a683-547adceae5af', 'amenities.deposit_policy', 'Deposit Policy', false, false, 1, 4, true);

-- Step: guest_experience (0e7e4975-aa8b-4ad5-a966-bb3bc9fb4174)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('0e7e4975-aa8b-4ad5-a966-bb3bc9fb4174', 'description', 'Property Description', true, true, 5, 0, true),
('0e7e4975-aa8b-4ad5-a966-bb3bc9fb4174', 'short_description', 'Short Description', true, false, 3, 1, true),
('0e7e4975-aa8b-4ad5-a966-bb3bc9fb4174', 'amenities.meal_plan', 'Meal Options', false, false, 2, 2, true);

-- Step: facilities (f12ed698-fe08-47e1-b100-9ba87119f590)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('f12ed698-fe08-47e1-b100-9ba87119f590', 'amenities.facilities', 'Facilities & Amenities', false, false, 5, 0, true),
('f12ed698-fe08-47e1-b100-9ba87119f590', 'amenities.accessibility', 'Accessibility Features', false, false, 1, 1, true);

-- Step: rooms_overview (74389c79-1bd2-449b-838e-aba6b77b013f)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('74389c79-1bd2-449b-838e-aba6b77b013f', 'amenities.room_types', 'Room Types', true, false, 5, 0, true);

-- Step: media_documents (a12786a3-9941-4c29-81cb-f2ebb9c2299a)
INSERT INTO public.onboarding_fields (step_id, field_key, label_override, is_required, is_pms_lockable, score_weight, order_index, is_active) VALUES
('a12786a3-9941-4c29-81cb-f2ebb9c2299a', 'images', 'Property Images', true, false, 8, 0, true),
('a12786a3-9941-4c29-81cb-f2ebb9c2299a', 'amenities.hero_video', 'Hero Video', false, false, 2, 1, true),
('a12786a3-9941-4c29-81cb-f2ebb9c2299a', 'amenities.documents', 'Documents & Rate Sheets', false, false, 2, 2, true);
