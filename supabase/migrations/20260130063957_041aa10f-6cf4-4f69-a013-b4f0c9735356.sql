-- PayFast Integration Migration: Replace AddPay with PayFast

-- 1. Add payment_provider column to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT null;

COMMENT ON COLUMN properties.payment_provider IS 'Payment gateway provider: payfast or null';

-- 2. Update payment_transactions table for PayFast compatibility
-- Rename AddPay-specific column to generic name
ALTER TABLE payment_transactions 
RENAME COLUMN addpay_response TO gateway_response;

-- Add payment_provider column to track which gateway was used
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'payfast';

-- Add PayFast-specific fields
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS pf_payment_id text,
ADD COLUMN IF NOT EXISTS m_payment_id text,
ADD COLUMN IF NOT EXISTS signature_valid boolean DEFAULT null;

-- Rename psn to transaction_ref (generic)
ALTER TABLE payment_transactions 
RENAME COLUMN psn TO transaction_ref;

-- 3. Handle system_health_components transition
-- First, insert new PayFast component
INSERT INTO system_health_components (
  component_key, 
  component_name, 
  component_type, 
  is_active, 
  is_critical, 
  description,
  expected_latency_ms
)
VALUES (
  'payfast_gateway',
  'PayFast Payment Gateway',
  'external',
  true,
  false,
  'PayFast PayWeb v3 payment processing',
  3000
)
ON CONFLICT (component_key) DO NOTHING;

-- Delete old AddPay health check records (they reference addpay_gateway)
DELETE FROM system_health_checks 
WHERE component_key = 'addpay_gateway';

-- Now delete the old AddPay component
DELETE FROM system_health_components 
WHERE component_key = 'addpay_gateway';