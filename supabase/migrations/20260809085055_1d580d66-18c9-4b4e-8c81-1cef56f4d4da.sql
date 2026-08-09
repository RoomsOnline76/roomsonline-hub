ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS is_trading boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.properties.is_trading IS 'Staff-set: property is genuinely live and blocker-free, so it counts in dashboards/metrics.';
COMMENT ON COLUMN public.properties.is_sandbox IS 'Staff-set: test/demo property. Fully usable everywhere but never included in counts or metrics.';

CREATE INDEX IF NOT EXISTS idx_properties_trading_scope
  ON public.properties (is_trading)
  WHERE is_trading = true AND is_sandbox = false;

-- Sandbox/test inventory: usable, never counted.
UPDATE public.properties
SET is_sandbox = true,
    is_trading = true
WHERE name ILIKE '[SANDBOX]%'
   OR name IN ('HyperGuest', 'Demo Hotel', 'Main Staging Hotel', 'Hostfully Test', 'hostfully');

-- Real trading properties named by the business.
UPDATE public.properties
SET is_trading = true
WHERE is_active = true
  AND name IN (
    'Fonteinhutte Self-Catering Chalets',
    'Dassiesingel Self-catering Units',
    'SEESIG Self Catering CHALETS',
    'Tidal Pools Self Catering Apartments',
    'Latter Days - STILBAAI'
  );