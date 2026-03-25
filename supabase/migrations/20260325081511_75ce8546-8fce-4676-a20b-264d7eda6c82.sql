
-- Payment gateway registry table
CREATE TABLE public.payment_gateway_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  payment_method text NOT NULL DEFAULT 'redirect' CHECK (payment_method IN ('redirect', 'inline', 'modal', 'qr')),
  supported_currencies text[] NOT NULL DEFAULT '{ZAR}',
  supported_countries text[] NOT NULL DEFAULT '{ZA}',
  edge_function_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_international boolean NOT NULL DEFAULT false,
  docs_url text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_gateway_registry ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read gateway registry"
  ON public.payment_gateway_registry FOR SELECT
  USING (true);

-- Admin write
CREATE POLICY "Admins can manage gateway registry"
  ON public.payment_gateway_registry FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed all gateways
INSERT INTO public.payment_gateway_registry (gateway_key, display_name, payment_method, supported_currencies, supported_countries, edge_function_name, is_active, is_international, docs_url, website_url) VALUES
  ('payfast', 'PayFast', 'modal', '{ZAR}', '{ZA}', 'payfast-api', true, false, 'https://developers.payfast.co.za/', 'https://payfast.io'),
  ('paygate', 'PayGate', 'redirect', '{ZAR}', '{ZA}', 'paygate-api', true, false, 'https://developer.paygate.co.za/', 'https://www.paygate.co.za'),
  ('peach', 'Peach Payments', 'redirect', '{ZAR}', '{ZA}', 'peach-gateway', false, false, 'https://developer.peachpayments.com/', 'https://www.peachpayments.com'),
  ('yoco', 'Yoco', 'inline', '{ZAR}', '{ZA}', 'yoco-gateway', false, false, 'https://developer.yoco.com/', 'https://www.yoco.com'),
  ('ozow', 'Ozow', 'redirect', '{ZAR}', '{ZA}', 'ozow-gateway', false, false, 'https://hub.ozow.com/docs/', 'https://ozow.com'),
  ('dpo', 'DPO Pay', 'redirect', '{ZAR,USD,EUR,GBP,KES,NGN}', '{ZA,KE,NG,TZ,UG,GH}', 'dpo-gateway', false, false, 'https://docs.dpopay.com/', 'https://dpogroup.com'),
  ('addpay', 'AddPay', 'redirect', '{ZAR}', '{ZA}', 'addpay-gateway', false, false, 'https://cnp-developer.addpay.cloud/', 'https://www.addpay.africa'),
  ('payflex', 'Payflex (BNPL)', 'redirect', '{ZAR}', '{ZA}', 'payflex-gateway', false, false, 'https://docs.payflex.co.za/', 'https://payflex.co.za'),
  ('stitch', 'Stitch', 'redirect', '{ZAR}', '{ZA}', 'stitch-gateway', false, false, 'https://stitch.money/docs/', 'https://www.stitch.money'),
  ('ikhokha', 'iKhokha (iK Pay)', 'redirect', '{ZAR}', '{ZA}', 'ikhokha-gateway', false, false, 'https://developer.ikhokha.com/', 'https://www.ikhokha.com'),
  ('snapscan', 'SnapScan', 'qr', '{ZAR}', '{ZA}', 'snapscan-gateway', false, false, 'https://developer.getsnapscan.com/', 'https://www.snapscan.co.za'),
  ('zapper', 'Zapper', 'qr', '{ZAR}', '{ZA}', 'zapper-gateway', false, false, null, 'https://www.zapper.com'),
  ('flutterwave', 'Flutterwave', 'redirect', '{ZAR,NGN,KES,GHS,UGX,TZS,USD,EUR,GBP}', '{ZA,NG,KE,GH,UG,TZ,RW,CM,CI}', 'flutterwave-gateway', true, true, 'https://developer.flutterwave.com/', 'https://flutterwave.com'),
  ('stripe', 'Stripe', 'redirect', '{USD,EUR,GBP,ZAR,AUD,CAD,CHF,JPY,CNY,INR,BRL,MXN,SGD,HKD,NZD,SEK,NOK,DKK,PLN,CZK}', '{US,GB,DE,FR,AU,CA,JP,SG,HK,NZ,ZA,IE,NL,AT,BE,CH,DK,FI,IT,LU,NO,PT,SE,ES}', 'stripe-gateway', true, true, 'https://docs.stripe.com/api', 'https://stripe.com'),
  ('paypal', 'PayPal', 'redirect', '{USD,EUR,GBP,AUD,CAD,CHF,JPY,SGD,HKD,NZD,MXN,BRL,INR,ZAR}', '{US,GB,DE,FR,AU,CA,JP,SG,HK,NZ,MX,BR,IN,ZA,IT,ES,NL,BE,AT,CH,SE,NO,DK,FI,IE,PT,PL,CZ}', 'paypal-gateway', true, true, 'https://developer.paypal.com/docs/api/orders/v2/', 'https://www.paypal.com'),
  ('klarna', 'Klarna (BNPL)', 'redirect', '{USD,EUR,GBP,SEK,NOK,DKK,CHF,AUD,NZD,CAD}', '{US,GB,DE,FR,SE,NO,DK,FI,NL,BE,AT,CH,AU,NZ,CA,IE,IT,ES,PT,PL,CZ}', 'klarna-gateway', false, true, 'https://docs.klarna.com/', 'https://www.klarna.com'),
  ('affirm', 'Affirm (BNPL)', 'redirect', '{USD,CAD}', '{US,CA}', 'affirm-gateway', false, true, 'https://docs.affirm.com/', 'https://www.affirm.com');
