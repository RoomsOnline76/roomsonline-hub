CREATE TABLE public.ru_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_key text NOT NULL,
  action text NOT NULL,
  ru_owner_id text,
  property_id uuid,
  priority integer NOT NULL DEFAULT 100,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  not_before timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ru_call_queue TO service_role;
GRANT SELECT ON public.ru_call_queue TO authenticated;

ALTER TABLE public.ru_call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view the channel call queue"
ON public.ru_call_queue FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

-- One waiting row per method+params: a duplicate request inside the window collapses into it.
CREATE UNIQUE INDEX ru_call_queue_pending_key
  ON public.ru_call_queue (method_key)
  WHERE status IN ('pending', 'claimed');

CREATE INDEX ru_call_queue_ready ON public.ru_call_queue (status, not_before, priority);

CREATE TRIGGER ru_call_queue_touch
BEFORE UPDATE ON public.ru_call_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ru_enqueue_call(
  _method_key text,
  _action text,
  _payload jsonb,
  _ru_owner_id text DEFAULT NULL,
  _property_id uuid DEFAULT NULL,
  _priority integer DEFAULT 100,
  _delay_ms integer DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.ru_call_queue (method_key, action, payload, ru_owner_id, property_id, priority, not_before)
  VALUES (_method_key, _action, _payload, _ru_owner_id, _property_id, _priority,
          now() + make_interval(secs => GREATEST(_delay_ms, 0) / 1000.0))
  ON CONFLICT (method_key) WHERE status IN ('pending', 'claimed')
  DO UPDATE SET
    payload = EXCLUDED.payload,
    priority = LEAST(public.ru_call_queue.priority, EXCLUDED.priority),
    updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ru_claim_queued_call()
RETURNS SETOF public.ru_call_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ru_call_queue q
  SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1, updated_at = now()
  WHERE q.id = (
    SELECT c.id FROM public.ru_call_queue c
    WHERE c.status = 'pending' AND c.not_before <= now()
    ORDER BY c.priority ASC, c.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.ru_enqueue_call(text, text, jsonb, text, uuid, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ru_claim_queued_call() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ru_enqueue_call(text, text, jsonb, text, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ru_claim_queued_call() TO service_role;