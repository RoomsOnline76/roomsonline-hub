// Application configuration constants
// GLOBAL RULE: All generated/shared links MUST use production domains, never lovable.* domains.

// The admin domain for admin panel URLs (ROLOS PMS, staff login, contracts, onboarding)
export const ADMIN_DOMAIN = "https://sleepinafrica.roomsonline.co.za";

// The public-facing domain for property and room showcase URLs
export const PUBLIC_DOMAIN = "https://book.sleepinafrica.roomsonline.co.za";

// The survey domain for project discovery questionnaire
export const SURVEY_DOMAIN = "https://survey.roomsonline.co.za";

// The connect portal domain for ROL'OS API documentation & sales
export const CONNECT_DOMAIN = "https://connect.roomsonline.co.za";

// Check if we're on the connect domain
export const isConnectDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'connect.roomsonline.co.za'
);

// Path helper: on connect domain, strip /connect prefix; on main domain, keep it
export const connectPath = (path: string) =>
  isConnectDomain ? (path === "/connect" ? "/" : path.replace(/^\/connect/, "")) : path;

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
