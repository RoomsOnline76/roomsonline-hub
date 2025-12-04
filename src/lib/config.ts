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
