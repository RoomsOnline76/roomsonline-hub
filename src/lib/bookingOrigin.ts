/**
 * Booking origin capture utilities.
 * Determines where a booking originated from (white-labelled property site
 * or shared portfolio link) so revenue can be attributed across portfolios.
 */
import { loadBrandFromSession } from "@/lib/brandOverride";

const ORIGIN_PORTFOLIO_KEY = "rol_origin_portfolio_id";
const ORIGIN_URL_KEY = "rol_origin_url";

export interface BookingOriginPayload {
  origin_property_id: string | null;
  origin_portfolio_id: string | null;
  origin_type: "portfolio_link" | "cross_property_site" | "direct" | null;
  origin_url: string | null;
}

/** Persist the portfolio id when a user lands via a portfolio share link. */
export function setOriginPortfolio(portfolioId: string | null): void {
  try {
    if (portfolioId) {
      sessionStorage.setItem(ORIGIN_PORTFOLIO_KEY, portfolioId);
      sessionStorage.setItem(ORIGIN_URL_KEY, window.location.href);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

/**
 * Hydrate portfolio origin from URL query params on app startup.
 * Supports `?ref_portfolio=<uuid>` (and optional `?ref_url=<encoded>`)
 * so external portfolio landing pages can attribute bookings via a plain link.
 */
export function hydrateOriginFromUrl(): void {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const portfolioId = params.get("ref_portfolio");
    if (portfolioId) {
      sessionStorage.setItem(ORIGIN_PORTFOLIO_KEY, portfolioId);
      const refUrl = params.get("ref_url");
      sessionStorage.setItem(
        ORIGIN_URL_KEY,
        refUrl || document.referrer || window.location.href,
      );
    }
  } catch {
    /* noop */
  }
}


/** Capture origin context to attach to a booking payload. */
export function captureBookingOrigin(targetPropertyId?: string | null): BookingOriginPayload {
  let origin_property_id: string | null = null;
  let origin_portfolio_id: string | null = null;
  let origin_url: string | null = null;

  try {
    const brand = loadBrandFromSession();
    if (brand?.propertyId && brand.propertyId !== targetPropertyId) {
      origin_property_id = brand.propertyId;
    }
    origin_portfolio_id = sessionStorage.getItem(ORIGIN_PORTFOLIO_KEY);
    origin_url =
      sessionStorage.getItem(ORIGIN_URL_KEY) ||
      document.referrer ||
      window.location.href;
  } catch {
    /* noop */
  }

  let origin_type: BookingOriginPayload["origin_type"] = null;
  if (origin_portfolio_id) origin_type = "portfolio_link";
  else if (origin_property_id) origin_type = "cross_property_site";
  else origin_type = "direct";

  return { origin_property_id, origin_portfolio_id, origin_type, origin_url };
}

/* ------------------------------------------------------------------ *
 * Commission origin capture
 * ------------------------------------------------------------------ *
 * Records WHERE a booking was made so the correct commission rate is
 * applied later:
 *   listing (10%) — ROL marketplace surfaces (book.sleepinafrica…, journey)
 *   pms      (2%) — white-label site, widget/embed, WordPress, direct
 *   external (0%) — reservations synced from an OTA/channel
 */

export type BookingCommissionType = "listing" | "pms" | "external";

export interface CommissionOriginPayload {
  commission_type: BookingCommissionType;
  integration_type: string;
  booking_channel: string;
  source_url: string | null;
}

/** Hostnames that are ROL-owned marketplace surfaces (charged listing rate). */
const ROL_MARKETPLACE_HOSTS = [
  "book.sleepinafrica.roomsonline.co.za",
  "sleepinafrica.roomsonline.co.za",
];

/** Paths on a ROL host that are still marketplace surfaces. */
const MARKETPLACE_PATH_HINTS = ["/journey", "/itinerary", "/explore", "/discover", "/properties"];

/** Paths that are always property-owned surfaces even on a ROL host. */
const PMS_PATH_HINTS = ["/embed", "/widget", "/book/", "/booking/"];

const inIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent → definitely embedded
  }
};

/**
 * Determine the commission-bearing origin of the current booking session.
 * Safe to call in any browser context; falls back to `pms` (the conservative,
 * property-favouring rate) when the surface cannot be identified.
 */
export function captureCommissionOrigin(): CommissionOriginPayload {
  if (typeof window === "undefined") {
    return {
      commission_type: "pms",
      integration_type: "rolos",
      booking_channel: "direct",
      source_url: null,
    };
  }

  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const source_url = window.location.href;

  const embedded = inIframe();
  const whiteLabel = params.get("wl") === "1";
  const viaWordPress = params.get("src") === "wordpress" || params.get("utm_source") === "wordpress";
  const isRolHost = ROL_MARKETPLACE_HOSTS.includes(host);

  // 1. Explicit property-owned surfaces always win.
  if (viaWordPress) {
    return { commission_type: "pms", integration_type: "wordpress", booking_channel: "wordpress", source_url };
  }
  if (embedded) {
    return { commission_type: "pms", integration_type: "widget", booking_channel: "widget", source_url };
  }
  if (PMS_PATH_HINTS.some((p) => path.startsWith(p))) {
    return { commission_type: "pms", integration_type: "embed", booking_channel: "embed", source_url };
  }
  if (whiteLabel) {
    return { commission_type: "pms", integration_type: "rolos", booking_channel: "white_label", source_url };
  }

  // 2. ROL-owned marketplace surface → listing rate.
  if (isRolHost && (path === "/" || MARKETPLACE_PATH_HINTS.some((p) => path.startsWith(p)))) {
    return { commission_type: "listing", integration_type: "rol_marketplace", booking_channel: "marketplace", source_url };
  }
  if (isRolHost) {
    return { commission_type: "listing", integration_type: "rol_marketplace", booking_channel: "marketplace", source_url };
  }

  // 3. Any other host is the property's own domain.
  return { commission_type: "pms", integration_type: "rolos", booking_channel: "direct", source_url };
}
