-- Seed initial PMS notes from additional_info.notes into pms_dev_notes_log
-- Dated 2026-01-07 00:01:00 as the initial seed entries

INSERT INTO public.pms_dev_notes_log (system_type, note_content, created_at, created_by_name)
SELECT 
  t.system_type,
  (t.additional_info->>'notes')::text as note_content,
  '2026-01-07 00:01:00+00'::timestamptz as created_at,
  'System' as created_by_name
FROM public.pms_tracker_status t
WHERE t.additional_info->>'notes' IS NOT NULL
  AND t.additional_info->>'notes' != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pms_dev_notes_log n 
    WHERE n.system_type = t.system_type
  );