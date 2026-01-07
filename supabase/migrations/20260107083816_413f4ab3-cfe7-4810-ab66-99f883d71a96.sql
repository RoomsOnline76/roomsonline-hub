-- Create pms_dev_notes_log table for tracking note history
CREATE TABLE public.pms_dev_notes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_type TEXT NOT NULL,
  note_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_by_email TEXT
);

-- Enable RLS
ALTER TABLE public.pms_dev_notes_log ENABLE ROW LEVEL SECURITY;

-- Dev users can manage all notes (they're the only ones with page access)
CREATE POLICY "Devs can manage dev notes log"
ON public.pms_dev_notes_log FOR ALL
USING (public.has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

-- Migrate existing notes to the log table
INSERT INTO public.pms_dev_notes_log (system_type, note_content, created_at, created_by_name)
SELECT 
  system_type, 
  notes, 
  COALESCE(updated_at, now()),
  'System Migration'
FROM public.pms_tracker_status 
WHERE notes IS NOT NULL AND notes != '';