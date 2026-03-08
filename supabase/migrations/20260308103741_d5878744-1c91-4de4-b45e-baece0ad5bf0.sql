
-- Task status enum
CREATE TYPE public.dev_task_status AS ENUM ('new', 'started', 'testing', 'completed');

-- Priority enum
CREATE TYPE public.dev_task_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Dev tasks table
CREATE TABLE public.dev_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status public.dev_task_status NOT NULL DEFAULT 'new',
  priority public.dev_task_priority NOT NULL DEFAULT 'medium',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.dev_tasks ENABLE ROW LEVEL SECURITY;

-- Only dev/admin/fearless_leader can see tasks
CREATE POLICY "Authorized users can view dev_tasks"
  ON public.dev_tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Authorized users can insert dev_tasks"
  ON public.dev_tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Authorized users can update dev_tasks"
  ON public.dev_tasks FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Authorized users can delete dev_tasks"
  ON public.dev_tasks FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Auto-update updated_at
CREATE TRIGGER update_dev_tasks_updated_at
  BEFORE UPDATE ON public.dev_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
