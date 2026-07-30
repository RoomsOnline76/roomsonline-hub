CREATE OR REPLACE FUNCTION public.get_ru_cron_jobs()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.start_time,
    d.status::text
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname ILIKE '%ru%' OR j.jobname ILIKE '%rentals%';
END;
$$;

REVOKE ALL ON FUNCTION public.get_ru_cron_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ru_cron_jobs() TO authenticated;