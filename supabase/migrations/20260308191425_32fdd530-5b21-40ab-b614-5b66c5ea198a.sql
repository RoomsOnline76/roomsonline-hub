
-- Fix dw_ views to use SECURITY INVOKER (inherit caller's RLS)
ALTER VIEW public.dw_daily_revenue SET (security_invoker = on);
ALTER VIEW public.dw_monthly_occupancy SET (security_invoker = on);
ALTER VIEW public.dw_booking_pipeline SET (security_invoker = on);
ALTER VIEW public.dw_channel_performance SET (security_invoker = on);
ALTER VIEW public.dw_guest_ltv SET (security_invoker = on);
ALTER VIEW public.dw_portfolio_kpis SET (security_invoker = on);
