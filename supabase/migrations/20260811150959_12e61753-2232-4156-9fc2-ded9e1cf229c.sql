CREATE OR REPLACE FUNCTION public.seed_default_message_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_rol_property = true AND (TG_OP = 'INSERT' OR OLD.is_rol_property IS DISTINCT FROM true) THEN
    IF NOT EXISTS (SELECT 1 FROM rolos_message_templates WHERE property_id = NEW.id LIMIT 1) THEN
      INSERT INTO rolos_message_templates (property_id, name, trigger_event, subject, body, channel, is_active, send_offset_hours)
      VALUES
        (NEW.id, 'Booking Confirmation', 'booking_confirmed',
         'Your Booking at {{property_name}} is Confirmed',
         '<h2>Booking Confirmed!</h2><p>Dear {{guest_first_name}},</p><p>Thank you for your reservation at <strong>{{property_name}}</strong>.</p><h3>Reservation Details</h3><ul><li><strong>Confirmation #:</strong> {{confirmation_number}}</li><li><strong>Reserved:</strong> {{room_names}}</li><li><strong>Check-in:</strong> {{check_in}}</li><li><strong>Check-out:</strong> {{check_out}}</li><li><strong>Nights:</strong> {{nights}}</li><li><strong>Total:</strong> {{total_amount}}</li></ul><h3>Accommodation Reserved</h3>{{rooms_booked}}<p>We look forward to welcoming you!</p><p>Warm regards,<br/>{{property_name}}</p>',
         'email', true, 0),
        (NEW.id, 'Pre-Arrival', 'pre_arrival',
         'Getting Ready for Your Stay at {{property_name}}',
         '<h2>Your Stay is Almost Here!</h2><p>Dear {{guest_first_name}},</p><p>We are excited that your stay at <strong>{{property_name}}</strong> is just around the corner.</p><h3>Quick Reminder</h3><ul><li><strong>Check-in:</strong> {{check_in}}</li><li><strong>Check-out:</strong> {{check_out}}</li><li><strong>Reserved:</strong> {{room_names}}</li><li><strong>Confirmation #:</strong> {{confirmation_number}}</li></ul><p>If you have any special requests or questions about your arrival, please do not hesitate to reach out.</p><p>See you soon!<br/>{{property_name}}</p>',
         'email', true, -24),
        (NEW.id, 'Check-In Welcome', 'check_in',
         'Welcome to {{property_name}}!',
         '<h2>Welcome, {{guest_first_name}}!</h2><p>We hope you have a wonderful stay at <strong>{{property_name}}</strong> in {{room_names}}.</p><p>If there is anything you need during your visit, please let us know — we are here to help.</p><p>Enjoy your stay!<br/>{{property_name}}</p>',
         'email', true, 0),
        (NEW.id, 'Check-Out Thank You', 'check_out',
         'Thank You for Staying at {{property_name}}',
         '<h2>Thank You, {{guest_first_name}}!</h2><p>We hope you enjoyed your stay at <strong>{{property_name}}</strong>.</p><p>It was a pleasure hosting you. We would love to welcome you back in the future.</p><p>If you have a moment, we would appreciate a review of your experience — it helps us improve and helps other travellers discover us.</p><p>Safe travels!<br/>{{property_name}}</p>',
         'email', true, 0),
        (NEW.id, 'Payment Request', 'payment_request',
         'Payment Due for Your Reservation at {{property_name}}',
         '<h2>Payment Reminder</h2><p>Dear {{guest_first_name}},</p><p>This is a friendly reminder regarding the outstanding payment for your reservation.</p><h3>Details</h3><ul><li><strong>Confirmation #:</strong> {{confirmation_number}}</li><li><strong>Reserved:</strong> {{room_names}}</li><li><strong>Check-in:</strong> {{check_in}}</li><li><strong>Check-out:</strong> {{check_out}}</li><li><strong>Amount Due:</strong> {{total_amount}}</li></ul><p>Please arrange payment at your earliest convenience. If you have already made payment, please disregard this message.</p><p>Thank you,<br/>{{property_name}}</p>',
         'email', true, 0),
        (NEW.id, 'Cancellation Confirmation', 'cancellation',
         'Reservation Cancelled - {{property_name}}',
         '<h2>Reservation Cancelled</h2><p>Dear {{guest_first_name}},</p><p>We confirm that your reservation at <strong>{{property_name}}</strong> ({{room_names}}, Confirmation #{{confirmation_number}}) has been cancelled.</p><p>If this was done in error or you would like to rebook, please get in touch and we will be happy to assist.</p><p>We hope to welcome you another time.<br/>{{property_name}}</p>',
         'email', true, 0),
        (NEW.id, 'Manual / Custom Message', 'manual',
         'Message from {{property_name}}',
         '<p>Dear {{guest_first_name}},</p><p>[Your custom message here]</p><p>Kind regards,<br/>{{property_name}}</p>',
         'email', true, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Confirmation templates: inject reserved unit + accommodation block
UPDATE rolos_message_templates
SET body = replace(
      body,
      '<li><strong>Check-in:</strong> {{check_in}}</li>',
      '<li><strong>Reserved:</strong> {{room_names}}</li><li><strong>Check-in:</strong> {{check_in}}</li>'
    )
WHERE channel = 'email'
  AND body LIKE '%<li><strong>Check-in:</strong> {{check_in}}</li>%'
  AND body NOT LIKE '%{{room_names}}%';

UPDATE rolos_message_templates
SET body = replace(
      body,
      '<p>We look forward to welcoming you!</p>',
      '<h3>Accommodation Reserved</h3>{{rooms_booked}}<p>We look forward to welcoming you!</p>'
    )
WHERE trigger_event = 'booking_confirmed'
  AND body LIKE '%We look forward to welcoming you!%'
  AND body NOT LIKE '%{{rooms_booked}}%';