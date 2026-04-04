
-- Seed the default Property Onboarding wizard
INSERT INTO public.onboarding_wizards (id, name, description, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Property Onboarding',
  'The standard onboarding wizard for accommodation properties — covers identity, location, rooms, media and more.',
  true
);

-- Seed the 9 steps
INSERT INTO public.onboarding_steps (wizard_id, step_key, title, description, order_index, is_required, is_active, icon, estimated_minutes, weight) VALUES
('a0000000-0000-0000-0000-000000000001', 'property_identity', 'Property Identity',   'Basic info, offerings & business details',      0, true, true, 'Building2',  5,  20),
('a0000000-0000-0000-0000-000000000001', 'contact_details',   'Contact & Team',       'Who can be reached at this property',            1, true, true, 'Phone',      3,   5),
('a0000000-0000-0000-0000-000000000001', 'location',          'Location',             'Property address and surroundings',              2, true, true, 'MapPin',     3,  15),
('a0000000-0000-0000-0000-000000000001', 'policies_pricing',  'Policies & Pricing',   'Rules, banking & terms',                         3, true, true, 'FileText',   6,  15),
('a0000000-0000-0000-0000-000000000001', 'guest_experience',  'Guest Experience',     'Description and meal options',                   4, true, true, 'PenLine',    5,  10),
('a0000000-0000-0000-0000-000000000001', 'facilities',        'Facilities',           'Available amenities and features',               5, true, true, 'Wifi',       8,  10),
('a0000000-0000-0000-0000-000000000001', 'rooms_overview',    'Rooms',                'Room types and configuration',                   6, true, true, 'Bed',        8,  10),
('a0000000-0000-0000-0000-000000000001', 'media_documents',   'Media & Documents',    'Photos, videos & rate sheets',                   7, true, true, 'Image',     10,  15),
('a0000000-0000-0000-0000-000000000001', 'review',            'Review & Submit',      'Final check before going live',                  8, true, true, 'CheckCircle',3,   0);
