
-- ══════════════════════════════════════════════════════════════════
-- Data Warehouse Views — Phase 8
-- ══════════════════════════════════════════════════════════════════

-- 1. Daily Revenue Summary per Property
CREATE OR REPLACE VIEW public.dw_daily_revenue AS
SELECT
  b.property_id,
  b.check_in_date::date AS stay_date,
  COUNT(*) AS booking_count,
  SUM(b.total_price) AS gross_revenue,
  SUM(COALESCE(b.calculated_commission, 0)) AS total_commission,
  SUM(b.total_price) - SUM(COALESCE(b.calculated_commission, 0)) AS net_revenue,
  AVG(b.total_price) AS avg_booking_value,
  COUNT(DISTINCT b.guest_email) AS unique_guests
FROM public.bookings b
WHERE b.status NOT IN ('cancelled')
GROUP BY b.property_id, b.check_in_date::date;

-- 2. Monthly Occupancy Summary
CREATE OR REPLACE VIEW public.dw_monthly_occupancy AS
SELECT
  m.property_id,
  date_trunc('month', m.date)::date AS month,
  ROUND(AVG(m.occupancy_rate)::numeric, 2) AS avg_occupancy_pct,
  ROUND(AVG(m.adr)::numeric, 2) AS avg_adr,
  ROUND(AVG(m.revpar)::numeric, 2) AS avg_revpar,
  SUM(m.occupied_rooms) AS total_rooms_sold,
  SUM(m.revenue) AS total_revenue,
  COUNT(*) AS days_in_period
FROM public.rolos_daily_metrics m
GROUP BY m.property_id, date_trunc('month', m.date);

-- 3. Booking Pipeline (forward-looking)
CREATE OR REPLACE VIEW public.dw_booking_pipeline AS
SELECT
  b.property_id,
  b.status,
  COUNT(*) AS booking_count,
  SUM(b.total_price) AS total_value,
  MIN(b.check_in_date) AS earliest_arrival,
  MAX(b.check_out_date) AS latest_departure,
  AVG(b.total_price) AS avg_value
FROM public.bookings b
WHERE b.check_in_date >= CURRENT_DATE
GROUP BY b.property_id, b.status;

-- 4. Channel Performance Summary (last 90 days)
CREATE OR REPLACE VIEW public.dw_channel_performance AS
SELECT
  b.property_id,
  COALESCE(b.booking_channel, 'direct') AS channel,
  COUNT(*) AS booking_count,
  SUM(b.total_price) AS gross_revenue,
  SUM(COALESCE(b.calculated_commission, 0)) AS total_commission,
  ROUND(AVG(b.total_price)::numeric, 2) AS avg_booking_value,
  COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancellations,
  ROUND(
    (COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1
  ) AS cancellation_rate_pct
FROM public.bookings b
WHERE b.created_at >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY b.property_id, COALESCE(b.booking_channel, 'direct');

-- 5. Guest Lifetime Value
CREATE OR REPLACE VIEW public.dw_guest_ltv AS
SELECT
  b.property_id,
  b.guest_email,
  b.guest_name,
  COUNT(*) AS total_stays,
  SUM(b.total_price) AS lifetime_value,
  MIN(b.check_in_date) AS first_stay,
  MAX(b.check_in_date) AS last_stay,
  ROUND(AVG(b.total_price)::numeric, 2) AS avg_stay_value
FROM public.bookings b
WHERE b.status NOT IN ('cancelled')
  AND b.guest_email IS NOT NULL
GROUP BY b.property_id, b.guest_email, b.guest_name;

-- 6. Property Portfolio KPIs
CREATE OR REPLACE VIEW public.dw_portfolio_kpis AS
SELECT
  p.id AS property_id,
  p.name AS property_name,
  p.city,
  p.country,
  COALESCE(rev.last_30d_revenue, 0) AS last_30d_revenue,
  COALESCE(rev.last_30d_bookings, 0) AS last_30d_bookings,
  COALESCE(occ.avg_occupancy_30d, 0) AS avg_occupancy_30d,
  COALESCE(occ.avg_adr_30d, 0) AS avg_adr_30d,
  COALESCE(pipe.upcoming_arrivals, 0) AS upcoming_arrivals,
  COALESCE(pipe.upcoming_value, 0) AS upcoming_value
FROM public.properties p
LEFT JOIN LATERAL (
  SELECT SUM(b.total_price) AS last_30d_revenue, COUNT(*) AS last_30d_bookings
  FROM public.bookings b
  WHERE b.property_id = p.id AND b.status NOT IN ('cancelled') AND b.created_at >= (CURRENT_DATE - INTERVAL '30 days')
) rev ON true
LEFT JOIN LATERAL (
  SELECT ROUND(AVG(m.occupancy_rate)::numeric, 2) AS avg_occupancy_30d, ROUND(AVG(m.adr)::numeric, 2) AS avg_adr_30d
  FROM public.rolos_daily_metrics m
  WHERE m.property_id = p.id AND m.date >= (CURRENT_DATE - INTERVAL '30 days')
) occ ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS upcoming_arrivals, SUM(b2.total_price) AS upcoming_value
  FROM public.bookings b2
  WHERE b2.property_id = p.id AND b2.status NOT IN ('cancelled') AND b2.check_in_date >= CURRENT_DATE AND b2.check_in_date <= (CURRENT_DATE + INTERVAL '30 days')
) pipe ON true
WHERE p.is_active = true;
