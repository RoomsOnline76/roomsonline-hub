-- =============================================
-- SECURITY HARDENING MIGRATION
-- =============================================

-- Part 1: Remove public exposure of API keys
-- These should only be accessed via the get-feature-flags edge function
DROP POLICY IF EXISTS "Public can view google maps api key" ON public.api_keys;
DROP POLICY IF EXISTS "Public can view nightsbridge agent code" ON public.api_keys;

-- Part 2: Enable pgcrypto extension in the extensions schema (Supabase standard)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Part 3: Add encrypted columns to bookings table
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS guest_name_encrypted bytea,
  ADD COLUMN IF NOT EXISTS guest_email_encrypted bytea,
  ADD COLUMN IF NOT EXISTS guest_phone_encrypted bytea;

-- Part 4: Create encryption key function
CREATE OR REPLACE FUNCTION public.get_booking_encryption_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5('rol_booking_encryption_v1_secure_salt_2024')
$$;

-- Part 5: Create encryption function using extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_text(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF plaintext IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN extensions.pgp_sym_encrypt(plaintext, public.get_booking_encryption_key());
END;
$$;

-- Part 6: Create decryption function (only callable by authorized roles)
CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Only allow decryption for admins/devs
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev')) THEN
    RETURN '[ENCRYPTED]';
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(encrypted_data, public.get_booking_encryption_key());
EXCEPTION
  WHEN OTHERS THEN
    RETURN '[DECRYPTION_ERROR]';
END;
$$;

-- Part 7: Create trigger function to auto-encrypt on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_booking_guest_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Encrypt guest name
  IF NEW.guest_name IS NOT NULL AND NEW.guest_name != '' THEN
    NEW.guest_name_encrypted := public.encrypt_sensitive_text(NEW.guest_name);
  END IF;
  
  -- Encrypt guest email
  IF NEW.guest_email IS NOT NULL AND NEW.guest_email != '' THEN
    NEW.guest_email_encrypted := public.encrypt_sensitive_text(NEW.guest_email);
  END IF;
  
  -- Encrypt guest phone
  IF NEW.guest_phone IS NOT NULL AND NEW.guest_phone != '' THEN
    NEW.guest_phone_encrypted := public.encrypt_sensitive_text(NEW.guest_phone);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Part 8: Create trigger on bookings table
DROP TRIGGER IF EXISTS encrypt_booking_data_trigger ON public.bookings;
CREATE TRIGGER encrypt_booking_data_trigger
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_booking_guest_data();

-- Part 9: Create secure view for admins with decrypted data
DROP VIEW IF EXISTS public.bookings_decrypted;
CREATE VIEW public.bookings_decrypted AS
SELECT 
  id,
  user_id,
  property_id,
  check_in_date,
  check_out_date,
  adults,
  children,
  teens,
  infants,
  total_price,
  status,
  rooms,
  special_requests,
  payment_intent_id,
  room_type_id,
  rate_type_id,
  voucher,
  external_reservation_id,
  payment_status,
  payment_reference,
  payment_method,
  paid_at,
  created_at,
  updated_at,
  -- Show plaintext for authorized users, encrypted marker for others
  CASE 
    WHEN has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') 
    THEN guest_name 
    ELSE '[ENCRYPTED]' 
  END as guest_name,
  CASE 
    WHEN has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') 
    THEN guest_email 
    ELSE '[ENCRYPTED]' 
  END as guest_email,
  CASE 
    WHEN has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') 
    THEN guest_phone 
    ELSE '[ENCRYPTED]' 
  END as guest_phone,
  guest_name_encrypted,
  guest_email_encrypted,
  guest_phone_encrypted
FROM public.bookings;

-- Part 10: Encrypt existing booking data
UPDATE public.bookings 
SET 
  guest_name_encrypted = public.encrypt_sensitive_text(guest_name),
  guest_email_encrypted = public.encrypt_sensitive_text(guest_email),
  guest_phone_encrypted = public.encrypt_sensitive_text(guest_phone)
WHERE guest_name_encrypted IS NULL 
  AND (guest_name IS NOT NULL OR guest_email IS NOT NULL OR guest_phone IS NOT NULL);