# Fix Revenue Report Settings Image Uploads

## Confirmed issue
The report logo and cover controls upload to the public `property-images` bucket under `reports/{propertyId}/...`. The backend logged a storage `objects` row-level-security rejection for the attempted upload. The settings page can be opened by report-access users, but this upload path currently relies on older broad image policies instead of a policy dedicated to report assets.

## Implementation
1. Add explicit authenticated storage policies for the `reports/` folder in `property-images`.
2. Authorize uploads, replacement, and deletion through the existing server-side `has_reports_access(auth.uid())` check, which includes admin, dev, and fearless-leader roles.
3. Keep all non-report image paths and existing owner/staff policies unchanged.
4. Verify with the active DEV session by uploading a small logo from Revenue Reports property settings, then confirm the object is created and the preview URL renders.

## Technical details
- Restrict the new policy with both `bucket_id = 'property-images'` and `(storage.foldername(name))[1] = 'reports'`.
- Apply `WITH CHECK` to inserts and updates; apply `USING` to updates and deletes.
- No public write access and no widening of permissions outside the reports asset prefix.
