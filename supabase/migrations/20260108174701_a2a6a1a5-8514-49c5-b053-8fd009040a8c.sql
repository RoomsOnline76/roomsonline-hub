-- Allow owners to delete their own PMS credentials
CREATE POLICY "Owners can delete their own pms credentials"
ON owner_pms_credentials
FOR DELETE
USING (owner_id = auth.uid());