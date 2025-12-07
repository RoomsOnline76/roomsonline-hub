// Application configuration constants

// The admin domain for admin panel URLs
export const ADMIN_DOMAIN = "https://sleepinafrica.roomsonline.co.za";

// The public-facing domain for property and room showcase URLs
export const PUBLIC_DOMAIN = "https://book.sleepinafrica.roomsonline.co.za";

// Helper to generate full property URL
export const getPropertyUrl = (slugOrId: string) => `${PUBLIC_DOMAIN}/property/${slugOrId}`;

// Helper to generate full room URL
export const getRoomUrl = (propertySlugOrId: string, roomId: string) => 
  `${PUBLIC_DOMAIN}/property/${propertySlugOrId}/room/${roomId}`;

// Helper to generate booking URL
export const getBookingUrl = (slugOrId: string) => `${PUBLIC_DOMAIN}/booking/${slugOrId}`;

// NightsBridge booking URL generator
// Format: https://nightsbridge.co.za/bridge/book?bbid=######&source=AGENT_CODE&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
export const getNightsBridgeBookingUrl = (
  bbid: string,
  agentCode: string,
  checkIn?: string,
  checkOut?: string
) => {
  const params = new URLSearchParams({
    bbid,
    source: agentCode,
  });
  
  if (checkIn) params.append('checkin', checkIn);
  if (checkOut) params.append('checkout', checkOut);
  
  return `https://nightsbridge.co.za/bridge/book?${params.toString()}`;
};
