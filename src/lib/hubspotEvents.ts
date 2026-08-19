import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget HubSpot add-on events.
 *
 * The isolated `hubspot-api` function enforces the opt-in gate (enabled +
 * credentials present) and answers 409 with `skipped: true` when the owner has
 * not connected a portal, so these helpers are safe to call unconditionally.
 * They never block or fail the caller's own flow.
 */
async function fire(action: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await supabase.functions.invoke("hubspot-api", { body: { action, ...payload } });
  } catch (err) {
    console.debug("[hubspot] event skipped:", err);
  }
}

export interface HubSpotGuestEvent {
  bookingId: string;
  reference?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestCountry?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  checkOut?: string | null;
  propertyName?: string | null;
}

/** New or updated reservation → HubSpot contact + deal. */
export function syncBookingToHubSpot(event: HubSpotGuestEvent): void {
  const email = event.guestEmail?.trim();
  const name = (event.guestName || "").trim();
  const [firstname, ...rest] = name.split(/\s+/);

  void (async () => {
    if (email) {
      await fire("upsert_contact", {
        contact: {
          email,
          firstname: firstname || undefined,
          lastname: rest.join(" ") || undefined,
          phone: event.guestPhone || undefined,
          country: event.guestCountry || undefined,
        },
      });
    }

    const label = event.reference || event.bookingId;
    await fire("create_or_update_deal", {
      deal: {
        booking_id: label,
        dealname: `${label}${event.propertyName ? ` · ${event.propertyName}` : ""}${
          name ? ` · ${name}` : ""
        }`,
        amount: event.amount ?? undefined,
        currency: event.currency || undefined,
        status: event.status || undefined,
        closedate: event.checkOut ? new Date(event.checkOut).toISOString() : undefined,
        contact_email: email || undefined,
      },
    });
  })();
}

/** Owner / company detail changes → HubSpot company record. */
export function syncCompanyToHubSpot(company: {
  name: string;
  domain?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
}): void {
  if (!company.name?.trim()) return;
  void fire("upsert_company", {
    company: {
      name: company.name.trim(),
      domain: company.domain || undefined,
      phone: company.phone || undefined,
      city: company.city || undefined,
      country: company.country || undefined,
      description: company.description || undefined,
    },
  });
}
