
-- Add setup/teardown columns to rolos_events
ALTER TABLE public.rolos_events ADD COLUMN IF NOT EXISTS setup_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.rolos_events ADD COLUMN IF NOT EXISTS teardown_minutes integer NOT NULL DEFAULT 0;

-- Add release_date to rolos_group_room_blocks (for auto-release)
ALTER TABLE public.rolos_group_room_blocks ADD COLUMN IF NOT EXISTS release_date date;
ALTER TABLE public.rolos_group_room_blocks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'released', 'converted'));

-- Add attrition_rate and release_date to rolos_groups
ALTER TABLE public.rolos_groups ADD COLUMN IF NOT EXISTS attrition_rate numeric DEFAULT 0;
ALTER TABLE public.rolos_groups ADD COLUMN IF NOT EXISTS release_date date;

-- Add linked_group_id to rolos_events for event-group linkage
ALTER TABLE public.rolos_events ADD COLUMN IF NOT EXISTS linked_group_id uuid REFERENCES public.rolos_groups(id) ON DELETE SET NULL;
