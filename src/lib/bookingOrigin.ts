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
