-- Allow owners to have multiple credentials of the same PMS type (different accounts)
-- Drop the existing unique constraint (it's a table constraint, not just an index)
ALTER TABLE owner_pms_credentials DROP CONSTRAINT IF EXISTS owner_pms_credentials_owner_id_system_type_key;

-- Create new unique constraint that allows multiple agencies per PMS type
-- Uses COALESCE to handle null external_account_id by falling back to the record's own id
CREATE UNIQUE INDEX owner_pms_credentials_owner_system_account_unique 
ON owner_pms_credentials (owner_id, system_type, COALESCE(external_account_id, id::text));