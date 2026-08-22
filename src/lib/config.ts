// Application configuration constants
// GLOBAL RULE: All generated/shared links MUST use production domains, never preview/sandbox hosts.

import { supabase } from "@/integrations/supabase/client";

// The admin domain for admin panel URLs (ROLOS PMS, staff login, contracts, onboarding)
export const ADMIN_DOMAIN = "https://sleepinafrica.roomsonline.co.za";

// The public-facing domain for property and room showcase URLs.
// NOTE: The `book.` subdomain is not provisioned on the deployment. The
// canonical host for all shareable embed/booking links is the same domain
// that serves the app (sleepinafrica.roomsonline.co.za).
export const PUBLIC_DOMAIN = "https://sleepinafrica.roomsonline.co.za";

// The survey domain for project discovery questionnaire
export const SURVEY_DOMAIN = "https://survey.roomsonline.co.za";

// The connect portal domain for ROL'OS API documentation & sales
export const CONNECT_DOMAIN = "https://connect.roomsonline.co.za";

// The internal Revenue Reports domain (admin / dev / fearless_leader only)
export const REPORTS_DOMAIN = "https://reports.roomsonline.co.za";

// Check if we're on the connect domain
export const isConnectDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'connect.roomsonline.co.za'
);

// Check if we're on the Revenue Reports domain
export const isReportsDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'reports.roomsonline.co.za'
);


// Path helper: on connect domain, strip /connect prefix; on main domain, keep it
export const connectPath = (path: string) =>
  isConnectDomain ? (path === "/connect" ? "/" : path.replace(/^\/connect/, "")) : path;

// Path helper for the Revenue Reports app. On reports.roomsonline.co.za the app
// lives at the root; everywhere else (preview, admin domain) it is mounted under
// /reports so the pages remain reachable without the subdomain.
export const reportsPath = (path: string): string => {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (isReportsDomain) return clean;
  return clean === "/" ? "/reports" : `/reports${clean}`;
};


// Helper to generate branded staff login URL (never use window.location.origin)
export const getStaffLoginUrl = (propertySlug: string) =>
  `${ADMIN_DOMAIN}/staff-login?property=${propertySlug}`;

// Helper to generate portfolio staff login URL
export const getPortfolioStaffLoginUrl = (portfolioSlug: string) =>
  `${ADMIN_DOMAIN}/staff-login?portfolio=${portfolioSlug}`;

// Helper to generate contract signing URL
export const getContractSigningUrl = (signingToken: string) =>
  `${ADMIN_DOMAIN}/contract/sign/${signingToken}`;

// Helper to generate onboarding URL
export const getOnboardingUrl = (token: string) =>
  `${ADMIN_DOMAIN}/onboarding/${token}`;

// Helper to generate full property URL
export const getPropertyUrl = (slugOrId: string) => `${PUBLIC_DOMAIN}/property/${slugOrId}`;

// Helper to generate full room URL
export const getRoomUrl = (propertySlugOrId: string, roomId: string) => 
  `${PUBLIC_DOMAIN}/property/${propertySlugOrId}/room/${roomId}`;

// Helper to generate booking URL
export const getBookingUrl = (slugOrId: string) => `${PUBLIC_DOMAIN}/booking/${slugOrId}`;

// NightsBridge booking URL generator
// Format: https://nightsbridge.co.za/bridge/book?bbid=######&source=AGENT_CODE&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&currency=USD&ref=TRACKING_REF
export const getNightsBridgeBookingUrl = (
  bbid: string,
  agentCode: string,
  checkIn?: string,
  checkOut?: string,
  currency?: string,
  trackingRef?: string
) => {
  const params = new URLSearchParams({
    bbid,
    source: agentCode,
  });
  
  if (checkIn) params.append('checkin', checkIn);
  if (checkOut) params.append('checkout', checkOut);
  if (currency && currency !== 'ZAR') params.append('currency', currency);
  if (trackingRef) params.append('ref', trackingRef);
  
  return `https://nightsbridge.co.za/bridge/book?${params.toString()}`;
};

/**
 * Resolves the white-label host for a property (server-side callers / emails).
 * Returns the property's custom subdomain when Active, otherwise PUBLIC_DOMAIN.
 * Client components should prefer the `useWhitelabel` hook for reactive reads.
 */
export const getWhitelabelHost = async (propertyId: string): Promise<string> => {
  try {
    const { data } = await supabase
      .from("property_billing_configs")
      .select("white_label_domain, white_label_domain_status")
      .eq("property_id", propertyId)
      .maybeSingle();
    const status = (data as any)?.white_label_domain_status;
    const domain = ((data as any)?.white_label_domain || "").trim();
    if (status === "active" && domain) return `https://${domain}`;
  } catch {
    /* fall through */
  }
  return PUBLIC_DOMAIN;
};

