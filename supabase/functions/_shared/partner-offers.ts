/**
 * Partner / affiliate perks attached to a property.
 *
 * These are NOT discounts on the stay and never appear at checkout — they are
 * revealed once a booking is paid (journey brochure, confirmation email, guest portal).
 * Codes are only ever the real code the partner supplied; nothing is generated here.
 */

export interface PartnerOffer {
  id: string;
  property_id: string;
  partner_name: string;
  title: string;
  description: string | null;
  redemption_instructions: string | null;
  redemption_code: string | null;
  partner_url: string | null;
  partner_contact: string | null;
  image_url: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  current_redemptions: number | null;
  min_nights: number | null;
}

/**
 * Active offers for the given properties that qualify for a stay of `nights` nights.
 * Returns [] when nothing qualifies so render sites collapse cleanly.
 */
export async function fetchQualifyingPartnerOffers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  propertyIds: string[],
  nights?: number,
  referenceDate?: string,
): Promise<PartnerOffer[]> {
  const ids = (propertyIds || []).filter(Boolean);
  if (ids.length === 0) return [];

  try {
    const today = (referenceDate || new Date().toISOString()).split("T")[0];
    const { data, error } = await supabase
      .from("property_partner_offers")
      .select("*")
      .in("property_id", ids)
      .eq("is_active", true);

    if (error) {
      console.error("[PartnerOffers] query error:", error.message);
      return [];
    }

    return (data || []).filter((o: PartnerOffer) => {
      if (o.valid_from && today < o.valid_from) return false;
      if (o.valid_until && today > o.valid_until) return false;
      if (o.max_redemptions !== null && (o.current_redemptions || 0) >= o.max_redemptions) return false;
      if (o.min_nights && typeof nights === "number" && nights < o.min_nights) return false;
      return true;
    }) as PartnerOffer[];
  } catch (err) {
    console.error("[PartnerOffers] lookup failed:", err);
    return [];
  }
}

/** Escape guest-authored text before embedding in HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared HTML block used by the brochure PDF and the confirmation email. */
export function renderPartnerOffersHTML(
  offers: PartnerOffer[],
  opts: { accent?: string; heading?: string } = {},
): string {
  if (!offers || offers.length === 0) return "";
  const accent = opts.accent || "#E91E8C";
  const heading = opts.heading || "With compliments";

  const cards = offers
    .map((o) => {
      const bits: string[] = [];
      bits.push(
        `<div style="font-size:13px;font-weight:600;color:#1A1A2E;">${esc(o.title)}</div>`,
        `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${accent};margin-top:2px;">${esc(o.partner_name)}</div>`,
      );
      if (o.description) {
        bits.push(`<div style="font-size:12px;color:#4A4A5A;margin-top:6px;">${esc(o.description)}</div>`);
      }
      if (o.redemption_instructions) {
        bits.push(
          `<div style="font-size:11px;color:#6A6A7A;margin-top:6px;"><strong>How to redeem:</strong> ${esc(o.redemption_instructions)}</div>`,
        );
      }
      if (o.redemption_code) {
        bits.push(
          `<div style="margin-top:8px;font-family:monospace;font-size:13px;letter-spacing:.12em;color:#1A1A2E;border:1px dashed ${accent};display:inline-block;padding:4px 10px;border-radius:4px;">${esc(o.redemption_code)}</div>`,
        );
      }
      if (o.partner_contact) {
        bits.push(`<div style="font-size:11px;color:#6A6A7A;margin-top:6px;">${esc(o.partner_contact)}</div>`);
      }
      if (o.valid_until) {
        bits.push(`<div style="font-size:10px;color:#9A9AA8;margin-top:6px;">Valid until ${esc(o.valid_until)}</div>`);
      }
      return `<div style="border:1px solid #EFE7EC;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#FFFDFB;">${bits.join("")}</div>`;
    })
    .join("");

  return `
    <div style="margin-top:20px;">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:10px;">${esc(heading)}</div>
      ${cards}
    </div>
  `;
}
