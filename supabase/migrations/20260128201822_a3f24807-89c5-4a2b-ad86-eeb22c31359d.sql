-- Test runs table (stores test execution sessions)
CREATE TABLE public.test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  feature_target TEXT NOT NULL,
  scenarios JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  summary JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test logs table (stores individual test results)
CREATE TABLE public.test_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.test_runs(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'skip', 'error')),
  duration_ms INTEGER,
  assertions JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  error_stack TEXT,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_test_runs_status ON public.test_runs(status);
CREATE INDEX idx_test_runs_created_at ON public.test_runs(created_at DESC);
CREATE INDEX idx_test_logs_run_id ON public.test_logs(run_id);
CREATE INDEX idx_test_logs_status ON public.test_logs(status);

-- RLS Policies (dev-only access)
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dev users can select test runs"
  ON public.test_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can insert test runs"
  ON public.test_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can update test runs"
  ON public.test_runs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can delete test runs"
  ON public.test_runs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can select test logs"
  ON public.test_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can insert test logs"
  ON public.test_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can update test logs"
  ON public.test_logs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Dev users can delete test logs"
  ON public.test_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'dev'));