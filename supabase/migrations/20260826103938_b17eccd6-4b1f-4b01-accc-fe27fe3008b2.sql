UPDATE public.properties
SET ru_archived = false,
    ru_archived_at = NULL,
    ru_hold_reason = NULL,
    ru_hold_set_at = NULL
WHERE id = '2f5d0f79-3763-42fd-87a9-5c20ab36cb32';

INSERT INTO public.ru_archive_events (property_id, property_name, direction, unit_count, listing_count, reason, ru_status, detail)
SELECT id, name, 'reactivated', 0, 0, 'Owner rebind repair — archive lifted so the property is visible for onboarding', 'updated', 'One-off repair after the owner rebind to julius@polka.co.za left the property archived'
FROM public.properties WHERE id = '2f5d0f79-3763-42fd-87a9-5c20ab36cb32';