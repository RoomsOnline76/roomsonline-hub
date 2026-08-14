import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { z } from "npm:zod@3.23.8";
import { resolvePropertySender, platformSender } from "../_shared/email-sender.ts";
import { appendContactFooterHtml } from "../_shared/email-footer.ts";
import { fetchQualifyingPartnerOffers, renderPartnerOffersHTML } from "../_shared/partner-offers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  booking_id: z.string().uuid({ message: "Invalid booking ID format" }),
  status: z.enum(["success", "failed", "admin_alert", "property_notification"]).default("success"),
  email_type: z.enum(["reservation_only"]).optional(),
  error_message: z.string().optional(),
  sync_warning: z.string().optional(),
  recipient_email: z.string().email().optional(), // For property notifications
  document_kind: z.enum(["pro_forma", "tax_invoice"]).optional(), // Attach/send a specific account document
});

// Format currency
function formatCurrency(amount: number, currency: string = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Guest-facing reference: the compact ROL code (ROL-JON-1042), then the legacy long
 * code, then the channel's own reference. Never the internal record id.
 */
function guestReference(booking: any): string {
  return booking?.rol_reference
    || booking?.rol_reference_legacy
    || booking?.external_reservation_id
    || "—";
}

// Calculate nights
function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// Replace template variables with actual booking data
function replaceTemplateVariables(template: string, booking: any, property: any): string {
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  const bookingRef = guestReference(booking);
  
  // Get room/rate type names from booking
  const bookedRooms: any[] = Array.isArray(booking.rooms) ? booking.rooms : [];
  const roomTypeName = bookedRooms[0]?.roomTypeName || booking.room_type_id || "Standard Room";
  const rateTypeName = bookedRooms[0]?.rateTypeName || booking.rate_type_id || "Standard Rate";

  // Human list of every unit/room reserved, e.g. "ANEMOON, SWARTMOSSEL"
  const roomNames = bookedRooms.length
    ? bookedRooms.map((r: any) => r.roomTypeName || r.roomName || "Room").join(", ")
    : roomTypeName;

  // Ready-made HTML block describing each reserved unit (dates, basis, occupancy)
  const roomsBookedHtml = (bookedRooms.length ? bookedRooms : [{ roomTypeName }])
    .map((r: any) => {
      const rCheckIn = r.checkIn || booking.check_in_date;
      const rCheckOut = r.checkOut || booking.check_out_date;
      const rNights = calculateNights(rCheckIn, rCheckOut);
      const occ = [
        r.numberOfAdults ? `${r.numberOfAdults} adult${r.numberOfAdults > 1 ? "s" : ""}` : "",
        r.numberOfTeens ? `${r.numberOfTeens} teen${r.numberOfTeens > 1 ? "s" : ""}` : "",
        r.numberOfChildren ? `${r.numberOfChildren} child${r.numberOfChildren > 1 ? "ren" : ""}` : "",
        r.numberOfInfants ? `${r.numberOfInfants} infant${r.numberOfInfants > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(", ");
      const lineAmount = Number(r.lineTotal);
      const meta = [
        r.rateTypeName || r.mealPlan || "",
        occ,
        Number.isFinite(lineAmount) && lineAmount > 0 ? formatCurrency(lineAmount, booking.currency) : "",
        `${formatDate(rCheckIn)} – ${formatDate(rCheckOut)}${rNights > 0 ? ` (${rNights} night${rNights > 1 ? "s" : ""})` : ""}`,
      ].filter(Boolean).join(" · ");
      return `<li style="margin: 0 0 8px;"><strong>${r.roomTypeName || r.roomName || "Room"}</strong>${meta ? `<br/><span style="color:#666;font-size:13px;">${meta}</span>` : ""}</li>`;
    })
    .join("");

  
  // Build property location string
  const propertyLocation = [property.city, property.country].filter(Boolean).join(", ");
  
  // Payment details
  const paymentRef = booking.payment_reference || "N/A";
  const paymentStatus = booking.payment_status === "paid" ? "Paid" : booking.payment_status === "pending" ? "Pending" : "Not Paid";
  const paymentMethod = booking.payment_method || "N/A";
  const paidAt = booking.paid_at ? formatDate(booking.paid_at) : "N/A";
  
  const guestFirstName = (booking.guest_name || "").trim().split(/\s+/)[0] || "Guest";
  const totalAmountFormatted = formatCurrency(booking.total_price);
  const totalAmountNumber = totalAmountFormatted.replace(/^R\s*/, "");

  const replacements: Record<string, string> = {
    // Reservation
    "{{reservation_reference}}": bookingRef,
    "{{confirmation_number}}": bookingRef, // alias used by ROL'OS Experience Engine templates
    "{{total_amount}}": totalAmountFormatted,
    "{{total_price}}": totalAmountFormatted,  // Alias for total_amount
    "{{total_amount_num}}": totalAmountNumber, // bare number, no currency symbol
    "{{check_in_date}}": formatDate(booking.check_in_date),
    "{{check_out_date}}": formatDate(booking.check_out_date),
    "{{check_in}}": formatDate(booking.check_in_date),   // alias
    "{{check_out}}": formatDate(booking.check_out_date), // alias
    "{{nights}}": `${nights} night${nights > 1 ? "s" : ""}`,
    "{{total_guests}}": `${totalGuests} guest${totalGuests > 1 ? "s" : ""}`,
    
    // Guest Details
    "{{guest_name}}": booking.guest_name || "",
    "{{guest_first_name}}": guestFirstName,
    "{{guest_email}}": booking.guest_email || "",
    "{{guest_phone}}": booking.guest_phone || "",
    "{{special_requests}}": booking.special_requests || "",
    
    // Property Details
    "{{property_name}}": property.name || "",
    "{{property_city}}": property.city || "",
    "{{property_country}}": property.country || "",
    "{{property_address}}": property.address || "",
    "{{property_email}}": property.email || "",
    "{{property_phone}}": property.phone || "",
    "{{property_location}}": propertyLocation,  // City, Country format
    
    // Room Details
    "{{room_type_name}}": roomTypeName,
    "{{room_names}}": roomNames,
    "{{unit_name}}": roomNames,
    "{{rooms_booked}}": `<ul style="margin: 0; padding-left: 18px;">${roomsBookedHtml}</ul>`,

    "{{rate_type_name}}": rateTypeName,
    "{{adults}}": String(booking.adults || 0),
    "{{teens}}": String(booking.teens || 0),
    "{{children}}": String(booking.children || 0),
    "{{infants}}": String(booking.infants || 0),
    
    // Payment Details
    "{{payment_reference}}": paymentRef,
    "{{payment_status}}": paymentStatus,
    "{{payment_method}}": paymentMethod,
    "{{paid_at}}": paidAt,
  };
  
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  
  return result;
}

// Strip any hardcoded ROL footer/branding from custom template content
function stripRolBrandingFromCustomContent(content: string): string {
  const footerPatterns = [
    // Full footer div block with ROL logo
    /<div[^>]*style="[^"]*background-color:\s*#fafafa[^"]*"[^>]*>[\s\S]*?RoomsOnline[\s\S]*?<\/div>\s*$/i,
    // Trailing div that contains "on behalf of" and ROL logo
    /<div[^>]*>[\s\S]*?RoomsOnline on behalf of[\s\S]*?rol-logo[\s\S]*?<\/div>\s*$/i,
    // Any trailing section with the ROL logo image
    /<div[^>]*style="[^"]*padding:\s*30px[^"]*background-color:\s*#fafafa[^"]*"[^>]*>[\s\S]*?<img[^>]*rol-logo[^>]*>[\s\S]*?<\/div>\s*$/i,
    // ROL logo image tags
    /<img[^>]*rol-logo[^>]*>/gi,
    // "Kind regards" standalone paragraphs (not inside property footer)
    /<p[^>]*>[\s]*Kind regards[\s]*<\/p>/gi,
    // "RoomsOnline on behalf of" paragraphs
    /<p[^>]*>[\s\S]*?RoomsOnline on behalf of[\s\S]*?<\/p>/gi,
  ];
  
  let cleaned = content;
  for (const pattern of footerPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned;
}

// Wrap custom template content in email wrapper, applying property branding when enabled
function wrapCustomTemplate(customContent: string, property: any): string {
  const brand = resolveBranding(property);
  
  // If property has branding enabled, strip any hardcoded ROL elements from custom content
  let processedContent = customContent;
  if (brand.isBranded) {
    processedContent = stripRolBrandingFromCustomContent(customContent);
    // Replace hardcoded ROL pink with property brand color
    processedContent = processedContent.replace(/#e91e8c/gi, brand.accentColor);
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          ${generateEmailHeader(brand, property)}

          <!-- Custom Content -->
          <tr>
            <td style="padding: ${brand.isBranded ? '20px 40px' : '0'};">
              <div style="color: #333; line-height: 1.6;">
                ${processedContent}
              </div>
            </td>
          </tr>
          
          ${generateEmailFooter(brand, property)}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Helper: resolve branding for a property
// ROL'OS properties (is_rol_property) get branded automatically when colours exist — no toggle needed.
// Other properties require brand_override_enabled to be true.
interface EmailBrand {
  accentColor: string;
  logoUrl: string;
  senderName: string;
  isBranded: boolean;
  secondaryColor: string;
  fontColor: string;
  darkColor: string;
  mutedColor: string;
  pageBg: string;
  headingFont: string;
  bodyFont: string;
}

function resolveBranding(property: any): EmailBrand {
  const isRol = !!property.is_rol_property;
  const hasColors = !!property.brand_primary_color;
  const isBranded = isRol ? hasColors : (!!property.brand_override_enabled && hasColors);
  const headingFont = (isBranded && property.brand_heading_font)
    ? `'${property.brand_heading_font}', Georgia, 'Times New Roman', serif`
    : `Georgia, 'Times New Roman', serif`;
  return {
    isBranded,
    accentColor: (isBranded && property.brand_primary_color) ? property.brand_primary_color : "#e91e8c",
    secondaryColor: (isBranded && property.brand_secondary_color) ? property.brand_secondary_color : "#ffffff",
    fontColor: (isBranded && property.brand_font_color) ? property.brand_font_color : "#2b2b33",
    darkColor: (isBranded && property.brand_dark_bg_color) ? property.brand_dark_bg_color : "#1a1a2e",
    mutedColor: (isBranded && property.brand_muted_text_color) ? property.brand_muted_text_color : "#6b6b78",
    pageBg: (isBranded && property.brand_light_bg_color) ? property.brand_light_bg_color : "#f6f3ee",
    logoUrl: (isBranded && property.brand_logo_url) ? property.brand_logo_url : "https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png",
    senderName: isBranded ? property.name : "Sleep in Africa by RoomsOnline",
    headingFont,
    bodyFont: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`,
  };
}

/** Escape user/property supplied text before it lands in the HTML email. */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
}

/** A branded content section: display-serif heading with a thin accent rule. */
function section(brand: EmailBrand, title: string, inner: string, opts: { last?: boolean } = {}): string {
  if (!inner) return "";
  return `
          <tr>
            <td style="padding: 0 32px ${opts.last ? "8px" : "26px"};">
              <div style="border-top: 1px solid #e7e1d8; padding-top: 22px;">
                <p style="margin: 0 0 14px; font-family: ${brand.headingFont}; font-size: 12px; letter-spacing: 2.4px; text-transform: uppercase; color: ${brand.accentColor};">${esc(title)}</p>
                ${inner}
              </div>
            </td>
          </tr>`;
}

/** Two-column label/value rows used across the booking information blocks. */
function kvRows(brand: EmailBrand, rows: Array<[string, string | null | undefined]>): string {
  const visible = rows.filter(([, v]) => !!v && String(v).trim() !== "");
  if (!visible.length) return "";
  return `
                <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse;">
                  ${visible
                    .map(
                      ([label, value]) => `
                  <tr>
                    <td style="padding: 7px 0; color: ${brand.mutedColor}; font-size: 14px; vertical-align: top;">${esc(label)}</td>
                    <td style="padding: 7px 0; color: ${brand.fontColor}; font-size: 14px; font-weight: 600; text-align: right; vertical-align: top;">${value}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>`;
}

/** A soft callout panel (payment, notes, warnings). */
function panel(brand: EmailBrand, inner: string, tone: "accent" | "success" | "warn" | "quiet" = "quiet"): string {
  const tones: Record<string, { bg: string; border: string }> = {
    accent: { bg: "#fdf4f9", border: brand.accentColor },
    success: { bg: "#f0fdf4", border: "#22c55e" },
    warn: { bg: "#fffbeb", border: "#f59e0b" },
    quiet: { bg: "#faf8f5", border: "#e7e1d8" },
  };
  const t = tones[tone];
  return `<div style="background-color: ${t.bg}; border-left: 3px solid ${t.border}; border-radius: 4px; padding: 16px 18px;">${inner}</div>`;
}

/** Convert plain text (possibly newline separated) into a readable list/paragraphs. */
function textToHtmlLines(brand: EmailBrand, text: string): string {
  const lines = String(text)
    .split(/\r?\n|(?<=\.)\s{2,}/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return `<p style="margin: 0; color: ${brand.fontColor}; font-size: 14px; line-height: 1.65;">${esc(text.trim())}</p>`;
  }
  return `<ul style="margin: 0; padding-left: 18px; color: ${brand.fontColor}; font-size: 14px; line-height: 1.7;">${lines
    .map((l) => `<li style="margin: 0 0 4px;">${esc(l.replace(/^[-•*]\s*/, ""))}</li>`)
    .join("")}</ul>`;
}

// Helper: generate the email header row with logo
function generateEmailHeader(brand: ReturnType<typeof resolveBranding>, property: any): string {
  const logo = brand.isBranded
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(property.name)}" style="max-width: 190px; max-height: 74px; height: auto; display: block; margin: 0 auto 10px;" />`
    : "";
  const location = [property.city, property.country].filter(Boolean).join(", ");
  return `
      <tr>
        <td style="padding: 30px 32px 26px; text-align: center; background-color: ${brand.darkColor}; border-radius: 10px 10px 0 0;">
          ${logo}
          <p style="margin: 0; font-family: ${brand.headingFont}; font-size: 26px; line-height: 1.2; color: #ffffff; letter-spacing: 0.4px;">${esc(property.name || "")}</p>
          ${location ? `<p style="margin: 8px 0 0; color: rgba(255,255,255,0.68); font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">${esc(location)}</p>` : ""}
        </td>
      </tr>
    `;
}

// Helper: generate the email footer row
function generateEmailFooter(brand: ReturnType<typeof resolveBranding>, property: any): string {
  // True white-label (own brand, not a ROL'OS-hosted property): never surface RoomsOnline.
  const isWhiteLabel = brand.isBranded && !property.is_rol_property;
  if (isWhiteLabel) {
    const contactBits = [property.contact_phone || property.phone, property.contact_email || property.email]
      .filter(Boolean)
      .map((v: string) => esc(v))
      .join(" · ");
    return `
      <tr>
        <td style="padding: 24px 32px 28px; background-color: #faf8f5; border-radius: 0 0 10px 10px; text-align: center;">
          <p style="margin: 0 0 6px; font-family: ${brand.headingFont}; color: ${brand.fontColor}; font-size: 15px;">${esc(property.name)}</p>
          ${contactBits ? `<p style="margin: 0; color: ${brand.mutedColor}; font-size: 12px;">${contactBits}</p>` : ""}
        </td>
      </tr>
    `;
  }
  if (brand.isBranded) {
    // ROL'OS-hosted branded property: subtle "Powered by" line only — no ROL logo, no "Kind regards"
    return `
      <tr>
        <td style="padding: 24px 32px 28px; background-color: #faf8f5; border-radius: 0 0 10px 10px; text-align: center;">
          <p style="margin: 0; color: ${brand.mutedColor}; font-size: 11px;">Powered by <a href="https://roomsonline.co.za" style="color: ${brand.mutedColor}; text-decoration: none;">RoomsOnline</a> · Rooms Done Right</p>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td style="padding: 28px 32px; background-color: #faf8f5; border-radius: 0 0 10px 10px; text-align: center;">
        <p style="margin: 0 0 10px; font-family: ${brand.headingFont}; font-style: italic; color: ${brand.mutedColor}; font-size: 15px;">Sleep in Africa like never before</p>
        <p style="margin: 0 0 14px; color: ${brand.mutedColor}; font-size: 13px;">
          Sleep in Africa by RoomsOnline on behalf of <strong style="color: ${brand.fontColor};">${esc(property.name)}</strong>
        </p>
        <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 160px; height: auto;" />
      </td>
    </tr>
  `;
}


// Generate inline invoice breakdown from ai_metadata or fallback to simple total
function generateInvoiceSection(booking: any, accentColor: string): string {
  const meta = booking.ai_metadata || {};
  const charges = booking.charges_breakdown || [];
  const hasBreakdown = meta.cost_breakdown?.length > 0;

  let rows = "";

  // Accommodation line items
  if (hasBreakdown) {
    for (const item of meta.cost_breakdown) {
      const desc = item.description || "Accommodation";
      const nightsLabel = item.nights > 0 ? ` (${item.nights} night${item.nights > 1 ? "s" : ""})` : "";
      rows += `<tr>
        <td style="padding: 6px 0; color: #333; font-size: 13px;">${desc}${nightsLabel}</td>
        <td style="padding: 6px 0; color: #333; font-size: 13px; text-align: right;">${formatCurrency(item.total)}</td>
      </tr>`;
    }
  } else {
    // Fallback: just show total as a single line
    const accommodationTotal = booking.total_price - charges.reduce((s: number, c: any) => s + (c.amount || 0), 0);
    rows += `<tr>
      <td style="padding: 6px 0; color: #333; font-size: 13px;">Accommodation</td>
      <td style="padding: 6px 0; color: #333; font-size: 13px; text-align: right;">${formatCurrency(Math.max(0, accommodationTotal))}</td>
    </tr>`;
  }

  // Applied packages
  if (meta.applied_packages?.length > 0) {
    for (const pkg of meta.applied_packages) {
      rows += `<tr>
        <td style="padding: 6px 0; color: #22c55e; font-size: 13px;">📦 ${pkg.name}</td>
        <td style="padding: 6px 0; color: #22c55e; font-size: 13px; text-align: right;">-${formatCurrency(pkg.discount)}</td>
      </tr>`;
    }
  }

  // Applied specials
  if (meta.applied_specials?.length > 0) {
    for (const special of meta.applied_specials) {
      rows += `<tr>
        <td style="padding: 6px 0; color: #22c55e; font-size: 13px;">⭐ ${special.name}</td>
        <td style="padding: 6px 0; color: #22c55e; font-size: 13px; text-align: right;">-${formatCurrency(special.discount)}</td>
      </tr>`;
    }
  }

  // Charges (fees & deposits)
  if (charges.length > 0) {
    for (const charge of charges) {
      const refundNote = charge.is_refundable ? " (refundable)" : "";
      rows += `<tr>
        <td style="padding: 6px 0; color: #666; font-size: 13px;">${charge.name}${refundNote}</td>
        <td style="padding: 6px 0; color: #333; font-size: 13px; text-align: right;">${formatCurrency(charge.amount)}</td>
      </tr>`;
    }
  }

  // Add-ons
  if (meta.selected_addons?.length > 0) {
    for (const addon of meta.selected_addons) {
      const qtyLabel = addon.quantity > 1 ? ` x${addon.quantity}` : "";
      rows += `<tr>
        <td style="padding: 6px 0; color: #666; font-size: 13px;">🎁 ${addon.name}${qtyLabel}</td>
        <td style="padding: 6px 0; color: #333; font-size: 13px; text-align: right;">${formatCurrency(addon.total)}</td>
      </tr>`;
    }
  }

  // Voucher discount
  if (meta.voucher_discount > 0) {
    rows += `<tr>
      <td style="padding: 6px 0; color: #22c55e; font-size: 13px;">🎟️ Voucher Discount</td>
      <td style="padding: 6px 0; color: #22c55e; font-size: 13px; text-align: right;">-${formatCurrency(meta.voucher_discount)}</td>
    </tr>`;
  }

  // VAT breakdown (inclusive)
  let vatRow = "";
  if (meta.vat?.rate) {
    const refundableDeposits = charges.filter((c: any) => c.is_refundable).reduce((s: number, c: any) => s + (c.amount || 0), 0);
    const vatableAmount = Math.max(0, booking.total_price - refundableDeposits);
    const vatRate = meta.vat.rate / 100;
    const exclAmount = vatableAmount / (1 + vatRate);
    const vatAmount = vatableAmount - exclAmount;
    vatRow = `
      <tr><td colspan="2" style="border-top: 1px solid #eee;"></td></tr>
      <tr>
        <td style="padding: 4px 0; color: #999; font-size: 12px;">Excl. VAT</td>
        <td style="padding: 4px 0; color: #999; font-size: 12px; text-align: right;">${formatCurrency(exclAmount)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #999; font-size: 12px;">VAT (${meta.vat.rate}%)</td>
        <td style="padding: 4px 0; color: #999; font-size: 12px; text-align: right;">${formatCurrency(vatAmount)}</td>
      </tr>`;
  }

  return `
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      ${rows}
      <tr><td colspan="2" style="border-top: 2px solid #333; padding-top: 8px;"></td></tr>
      <tr>
        <td style="padding: 4px 0; color: #333; font-size: 18px; font-weight: 700;">Total</td>
        <td style="padding: 4px 0; color: ${accentColor}; font-size: 20px; font-weight: 700; text-align: right;">${formatCurrency(booking.total_price)}</td>
      </tr>
      ${vatRow}
    </table>`;
}

/**
 * Reservation-only bookings are never charged online. The guest gets the
 * property's banking details, what is due now (deposit or full prepayment),
 * when it is due, and the cancellation terms — unobtrusive but noticeable.
 */
function isReservationOnlyBooking(booking: any, property: any): boolean {
  return (
    booking?.payment_status === "awaiting_eft" ||
    (property?.payment_mode === "reservation_only" && booking?.payment_status !== "paid")
  );
}

function resolveBankingBlock(property: any): Record<string, string | null> | null {
  const banking = property?.amenities?.banking || property?.__banking || null;
  if (!banking) return null;
  const hasAny = banking.bank_name || banking.account_number || banking.account_number_masked || banking.account_holder;
  return hasAny ? banking : null;
}

function resolveCancellationText(booking: any, property: any): string | null {
  return (
    booking?.cancellation_policy_text ||
    property?.__cancellation_text ||
    property?.amenities?.policies?.cancellation_policy ||
    property?.amenities?.house_rules?.cancellation_policy ||
    property?.cancellation_policy ||
    null
  );
}

/** Property-facing contact set, hydrated by the handler from public contact rows. */
interface PropertyContact {
  hostName?: string | null;
  phone?: string | null;
  cell?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
}

function resolvePropertyContact(property: any): PropertyContact {
  const c = property?.__contact || {};
  const amenityContact = property?.amenities?.contact || {};
  const addressParts = [
    property?.address,
    property?.city,
    property?.postal_code,
  ].filter(Boolean);
  const website = property?.property_url || amenityContact.website || null;
  return {
    hostName: c.hostName || amenityContact.main_contact_name || property?.amenities?.key_representative || null,
    phone: c.phone || amenityContact.telephone || property?.amenities?.telephone || null,
    cell: c.cell || amenityContact.mobile_number || property?.amenities?.mobile_number || null,
    email: c.email || amenityContact.email || amenityContact.contact_email || property?.owner_email || null,
    website: website ? String(website) : null,
    address: addressParts.length ? addressParts.join(", ") : null,
  };
}

function mapsUrl(property: any): string | null {
  const lat = Number(property?.latitude);
  const lng = Number(property?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const q = [property?.name, property?.address, property?.city, property?.country].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Payment confirmed / deposit instructions panel — one block for every payment state. */
function generatePaymentBlock(brand: EmailBrand, booking: any, property: any): string {
  const currency = booking.currency || "ZAR";
  if (booking.payment_status === "paid") {
    return panel(
      brand,
      `
        <p style="margin: 0 0 10px; font-family: ${brand.headingFont}; font-size: 16px; color: #166534;">Payment received — thank you</p>
        ${kvRows(brand, [
          ["Amount paid", esc(formatCurrency(Number(booking.total_price || 0), currency))],
          ["Transaction reference", esc(booking.payment_reference || "—")],
          ["Payment method", esc(booking.payment_method === "payfast" ? "PayFast" : booking.payment_method || "Card")],
          ["Paid on", booking.paid_at ? esc(formatDate(booking.paid_at)) : null],
        ])}
      `,
      "success",
    );
  }

  const banking = resolveBankingBlock(property);
  const total = Number(booking.total_price || 0);
  const dueNow = Number(booking.deposit_amount || 0) > 0 ? Number(booking.deposit_amount) : total;
  const balance = Math.max(0, Math.round((total - dueNow) * 100) / 100);
  const dueDate = booking.deposit_due_date ? formatDate(booking.deposit_due_date) : null;
  const reference = guestReference(booking);
  const contact = resolvePropertyContact(property);
  const proofEmail = contact.email;

  const bankRows: Array<[string, string | null]> = banking
    ? [
        ["Account holder", banking.account_holder ? esc(banking.account_holder) : null],
        ["Bank", banking.bank_name ? esc(banking.bank_name) : null],
        [
          "Account number",
          banking.account_number || banking.account_number_masked
            ? esc(banking.account_number || banking.account_number_masked)
            : null,
        ],
        ["Account type", banking.account_type ? esc(banking.account_type) : null],
        ["Branch code", banking.branch_code ? esc(banking.branch_code) : null],
        ["SWIFT / BIC", banking.swift_code ? esc(banking.swift_code) : null],
        ["Payment reference", esc(reference)],
      ]
    : [];

  const bankHtml = banking
    ? kvRows(brand, bankRows)
    : `<p style="margin: 10px 0 0; color: ${brand.mutedColor}; font-size: 13px;">${esc(property?.name || "The property")} will send you their banking details shortly.</p>`;

  return panel(
    brand,
    `
      <p style="margin: 0 0 8px; font-family: ${brand.headingFont}; font-size: 16px; color: ${brand.fontColor};">Deposit instructions</p>
      <p style="margin: 0; color: ${brand.fontColor}; font-size: 14px; line-height: 1.65;">
        Please pay <strong>${esc(formatCurrency(dueNow, currency))}</strong>${dueDate ? ` by <strong>${esc(dueDate)}</strong>` : ""} into the following bank account to secure your booking.${
          balance > 0.01
            ? ` The remaining balance of <strong>${esc(formatCurrency(balance, currency))}</strong> is payable ${
                booking.balance_due_date ? `by ${esc(formatDate(booking.balance_due_date))}` : "before arrival"
              }.`
            : ""
        }
      </p>
      ${bankHtml}
      ${
        proofEmail
          ? `<p style="margin: 12px 0 0; color: ${brand.mutedColor}; font-size: 12px;">Proof of payment email: <a href="mailto:${esc(proofEmail)}" style="color: ${brand.accentColor}; text-decoration: none;">${esc(proofEmail)}</a></p>`
          : ""
      }
    `,
    "accent",
  );
}

/** Accommodation lines: room type, basis, occupancy, per-night rate and line total. */
function generateAccommodationSection(brand: EmailBrand, booking: any): string {
  const currency = booking.currency || "ZAR";
  const meta = booking.ai_metadata || {};
  const rooms: any[] = Array.isArray(booking.rooms) ? booking.rooms : [];
  const breakdown: any[] = Array.isArray(meta.cost_breakdown) ? meta.cost_breakdown : [];

  const lines: string[] = [];

  const describeOccupancy = (r: any): string =>
    [
      `${r.numberOfAdults || 1} adult${(r.numberOfAdults || 1) > 1 ? "s" : ""}`,
      r.numberOfTeens ? `${r.numberOfTeens} teen${r.numberOfTeens > 1 ? "s" : ""}` : "",
      r.numberOfChildren ? `${r.numberOfChildren} child${r.numberOfChildren > 1 ? "ren" : ""}` : "",
      r.numberOfInfants ? `${r.numberOfInfants} infant${r.numberOfInfants > 1 ? "s" : ""}` : "",
    ]
      .filter(Boolean)
      .join(", ");

  if (rooms.length > 0) {
    rooms.forEach((room, i) => {
      const checkIn = room.checkIn || booking.check_in_date;
      const checkOut = room.checkOut || booking.check_out_date;
      const nights = calculateNights(checkIn, checkOut);
      const match = breakdown[i] || breakdown.find((b: any) => (b.description || "").includes(room.roomTypeName || "~~"));
      const lineTotal = Number(match?.total ?? room.totalPrice ?? room.total ?? 0);
      const perNight = nights > 0 && lineTotal > 0 ? lineTotal / nights : Number(room.pricePerNight || 0);
      const basis = room.rateTypeName || room.mealPlan || match?.rate_plan_name || null;
      lines.push(`
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #efe9e0;">
                      <p style="margin: 0 0 3px; color: ${brand.fontColor}; font-size: 14px; font-weight: 600;">${esc(room.roomTypeName || "Room")}</p>
                      <p style="margin: 0; color: ${brand.mutedColor}; font-size: 13px; line-height: 1.55;">
                        ${basis ? `${esc(basis)} · ` : ""}${esc(describeOccupancy(room))}${perNight > 0 ? ` · ${esc(formatCurrency(perNight, currency))} per night` : ""}<br />
                        ${esc(formatDate(checkIn))} – ${esc(formatDate(checkOut))} (${nights} night${nights > 1 ? "s" : ""})
                      </p>
                    </td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #efe9e0; text-align: right; vertical-align: top; color: ${brand.fontColor}; font-size: 14px; font-weight: 600; white-space: nowrap;">
                      ${lineTotal > 0 ? esc(formatCurrency(lineTotal, currency)) : ""}
                    </td>
                  </tr>`);
    });
  } else if (breakdown.length > 0) {
    for (const item of breakdown) {
      lines.push(`
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #efe9e0; color: ${brand.fontColor}; font-size: 14px;">${esc(item.description || "Accommodation")}</td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #efe9e0; text-align: right; color: ${brand.fontColor}; font-size: 14px; font-weight: 600;">${esc(formatCurrency(Number(item.total || 0), currency))}</td>
                  </tr>`);
    }
  }

  if (!lines.length) return "";

  return `
                <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse;">
                  ${lines.join("")}
                </table>`;
}

/** Property details block: host, address, contact channels and the map link. */
function generatePropertyDetailsSection(brand: EmailBrand, property: any): string {
  const c = resolvePropertyContact(property);
  const maps = mapsUrl(property);
  const rows: Array<[string, string | null]> = [
    ["Address", c.address ? esc(c.address) : null],
    ["Email", c.email ? `<a href="mailto:${esc(c.email)}" style="color: ${brand.accentColor}; text-decoration: none;">${esc(c.email)}</a>` : null],
    [
      "Website",
      c.website
        ? `<a href="${esc(c.website)}" style="color: ${brand.accentColor}; text-decoration: none;">${esc(String(c.website).replace(/^https?:\/\//, ""))}</a>`
        : null,
    ],
    ["Cell", c.cell ? `<a href="tel:${esc(c.cell)}" style="color: ${brand.fontColor}; text-decoration: none;">${esc(c.cell)}</a>` : null],
    ["Tel", c.phone ? `<a href="tel:${esc(c.phone)}" style="color: ${brand.fontColor}; text-decoration: none;">${esc(c.phone)}</a>` : null],
  ];
  const inner = kvRows(brand, rows);
  if (!inner && !maps && !c.hostName) return "";
  return `
                ${c.hostName ? `<p style="margin: 0 0 12px; color: ${brand.fontColor}; font-size: 14px;">${esc(c.hostName)} will welcome you.</p>` : ""}
                ${inner}
                ${
                  maps
                    ? `<p style="margin: 14px 0 0;"><a href="${esc(maps)}" style="display: inline-block; border: 1px solid ${brand.accentColor}; color: ${brand.accentColor}; text-decoration: none; padding: 9px 18px; border-radius: 4px; font-size: 13px; letter-spacing: 0.4px;">View on Google Maps</a></p>`
                    : ""
                }`;
}

/** How to get here: directions copy plus coordinates. */
function generateDirectionsSection(brand: EmailBrand, property: any): string {
  const hr = property?.amenities?.house_rules || {};
  const text = String(hr.directions || hr.check_in_instructions || property?.__arrival_instructions || "").trim();
  const lat = Number(property?.latitude);
  const lng = Number(property?.longitude);
  const coords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    ? `<p style="margin: 0 0 10px; color: ${brand.mutedColor}; font-size: 13px;">Lat: ${lat} / Lng: ${lng}</p>`
    : "";
  if (!text && !coords) return "";
  return `${coords}${text ? textToHtmlLines(brand, text) : ""}`;
}

/** Cancellation policy and other terms. */
function generatePolicySections(brand: EmailBrand, booking: any, property: any): string {
  const cancellation = resolveCancellationText(booking, property);
  const hr = property?.amenities?.house_rules || {};
  const termsBits: string[] = [];
  if (hr.deposit_percentage) {
    termsBits.push(
      `${hr.deposit_percentage}% deposit confirms the booking${hr.deposit_days ? `, balance is due ${hr.deposit_days} days before arrival` : ""}.`,
    );
  }
  if (hr.pets_allowed === false) termsBits.push("No pets allowed.");
  if (hr.smoking_allowed === false) termsBits.push("No smoking in the building.");
  if (hr.parties_allowed === false) termsBits.push("No parties or events.");
  if (hr.children_policy) termsBits.push(String(hr.children_policy));
  if (hr.fine_print) termsBits.push(String(hr.fine_print));

  return `
      ${section(brand, "Cancellation policy", cancellation ? textToHtmlLines(brand, cancellation) : "")}
      ${section(brand, "Other terms and conditions", termsBits.length ? textToHtmlLines(brand, termsBits.join("\n")) : "")}`;
}

function generateSuccessEmail(booking: any, property: any, syncWarning?: string): string {
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  const brand = resolveBranding(property);
  const currency = booking.currency || "ZAR";
  const contact = resolvePropertyContact(property);
  const guestFirstName = (booking.guest_name || "").trim() || "Guest";
  const queryPhone = contact.phone || contact.cell;
  const total = Number(booking.total_price || 0);
  const depositAmount = Number(booking.deposit_amount || 0);

  const bookingInfo = kvRows(brand, [
    ["Arriving", esc(formatDate(booking.check_in_date))],
    ["Leaving", esc(formatDate(booking.check_out_date))],
    ["Staying", `${nights} night${nights > 1 ? "s" : ""}`],
    ["Guests", `${totalGuests} guest${totalGuests > 1 ? "s" : ""}`],
    ["Booking reference", `<span style="font-family: 'Courier New', monospace;">${esc(guestReference(booking))}</span>`],
  ]);

  const totals = kvRows(brand, [
    ["Total amount", esc(formatCurrency(total, currency))],
    depositAmount > 0 ? ["Deposit amount", esc(formatCurrency(depositAmount, currency))] : ["", null],
    booking.payment_status === "paid"
      ? ["Amount outstanding", esc(formatCurrency(0, currency))]
      : ["", null],
  ]);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking confirmation with ${esc(property.name || "")}</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${brand.bodyFont}; background-color: ${brand.pageBg};">
  <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse; background-color: ${brand.pageBg};">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" width="600" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 10px; overflow: hidden;">

          ${generateEmailHeader(brand, property)}

          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 32px 22px;">
              <p style="margin: 0 0 6px; font-family: ${brand.headingFont}; font-size: 22px; line-height: 1.3; color: ${brand.fontColor};">Thank you for booking with ${esc(property.name || "us")}</p>
              <p style="margin: 0 0 4px; color: ${brand.fontColor}; font-size: 15px;">Dear ${esc(guestFirstName)}</p>
              <p style="margin: 12px 0 0; color: ${brand.mutedColor}; font-size: 13px;">
                ${
                  queryPhone
                    ? `For queries please call: <a href="tel:${esc(queryPhone)}" style="color: ${brand.accentColor}; text-decoration: none;">${esc(queryPhone)}</a>`
                    : booking.payment_status === "paid"
                      ? "Your booking is confirmed and paid."
                      : "Your booking has been received."
                }
              </p>
            </td>
          </tr>

          ${section(brand, "Booking information", bookingInfo)}

          ${section(brand, "Accommodation", generateAccommodationSection(brand, booking))}

          ${section(brand, "Invoice", generateInvoiceSection(booking, brand.accentColor) + totals)}

          ${section(brand, booking.payment_status === "paid" ? "Payment" : "Payment", generatePaymentBlock(brand, booking, property))}

          ${
            booking.special_requests
              ? section(
                  brand,
                  "Booking notes",
                  `<p style="margin: 0; color: ${brand.fontColor}; font-size: 14px; line-height: 1.65;">Special requests: ${esc(booking.special_requests)}</p>`,
                )
              : ""
          }

          ${section(brand, `${property.name ? property.name + " details" : "Property details"}`, generatePropertyDetailsSection(brand, property))}

          ${section(brand, "How to get here", generateDirectionsSection(brand, property))}

          ${generatePolicySections(brand, booking, property)}

          ${
            syncWarning
              ? section(brand, "Please note", panel(brand, `<p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">${esc(syncWarning)}</p>`, "warn"))
              : ""
          }

          <!-- Sign off -->
          <tr>
            <td style="padding: 6px 32px 28px; text-align: center;">
              <p style="margin: 0; font-family: ${brand.headingFont}; font-size: 20px; color: ${brand.accentColor};">Enjoy your stay!</p>
            </td>
          </tr>

          ${generateEmailFooter(brand, property)}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}


// Generate failure email HTML
function generateFailureEmail(booking: any, property: any, errorMessage?: string): string {
  const brand = resolveBranding(property);
  const accentColor = brand.accentColor;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Issue</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          ${generateEmailHeader(brand, property)}

          <!-- Issue Icon -->
          <tr>
            <td style="padding: ${brand.isBranded ? '25px' : '40px'} 40px 20px; text-align: center;">
              <div style="font-size: 32px; color: #ef4444; margin-bottom: 10px;">⚠</div>
              <h1 style="margin: 0; font-size: 24px; color: #333; font-weight: 600;">Booking Issue</h1>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px;">We encountered a problem with your reservation</p>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                Dear <strong>${booking.guest_name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                We regret to inform you that there was an issue processing your booking at <strong>${property.name}</strong>.
              </p>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  ${errorMessage || "An unexpected error occurred while processing your reservation. Please try again or contact our support team."}
                </p>
              </div>
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                If you would like to proceed with your booking, please try again or contact us directly for assistance.
              </p>
            </td>
          </tr>

          <!-- Booking Details Summary -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid ${accentColor}; padding-bottom: 10px;">Your Attempted Booking</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Property</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${property.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-in</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${formatDate(booking.check_in_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-out</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${formatDate(booking.check_out_date)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contact Support -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Need help? Contact our support team</p>
                <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: ${accentColor}; font-weight: 600; text-decoration: none;">sleepinafrica@roomsonline.co.za</a>
              </div>
            </td>
          </tr>

          ${generateEmailFooter(brand, property)}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate property owner notification email for non-PMS properties
function generatePropertyNotificationEmail(booking: any, property: any): string {
  const brand = resolveBranding(property);
  const accentColor = brand.accentColor;
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  const bookingRef = guestReference(booking);
  
  // Build room info
  let roomInfo = "";
  if (booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0) {
    roomInfo = booking.rooms.map((room: any, idx: number) => {
      const guestSummary = [
        `${room.numberOfAdults || 1} Adult${(room.numberOfAdults || 1) > 1 ? "s" : ""}`,
        room.numberOfTeens ? `${room.numberOfTeens} Teen${room.numberOfTeens > 1 ? "s" : ""}` : "",
        room.numberOfChildren ? `${room.numberOfChildren} Child${room.numberOfChildren > 1 ? "ren" : ""}` : "",
        room.numberOfInfants ? `${room.numberOfInfants} Infant${room.numberOfInfants > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(", ");
      
      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <div style="background-color: #f0fdf4; border-radius: 6px; padding: 12px; border-left: 3px solid #22c55e;">
              <p style="margin: 0 0 6px; font-weight: 600; color: #333;">Room ${idx + 1}: ${room.roomTypeName || "Standard Room"}</p>
              <p style="margin: 0; color: #666; font-size: 13px;"><strong>Guests:</strong> ${guestSummary}</p>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking Received</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #f0fdf4; border-radius: 8px 8px 0 0;">
              <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
              <h1 style="margin: 0; font-size: 24px; color: #166534; font-weight: 600;">NEW BOOKING RECEIVED</h1>
              <p style="margin: 10px 0 0; color: #15803d; font-size: 14px;">A guest has booked a stay at ${property.name}</p>
            </td>
          </tr>

          <!-- Booking Reference -->
          <tr>
            <td style="padding: 20px 40px 0;">
              <div style="background-color: #dcfce7; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 5px; color: #166534; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</p>
                <p style="margin: 0; color: #14532d; font-size: 24px; font-weight: 700; font-family: monospace;">${bookingRef}</p>
              </div>
            </td>
          </tr>

          <!-- Stay Details -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Stay Details</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-in</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_in_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-out</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_out_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Duration</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${nights} night${nights > 1 ? "s" : ""}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Total Guests</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${totalGuests} guest${totalGuests > 1 ? "s" : ""}</td>
                </tr>
                ${roomInfo}
              </table>
            </td>
          </tr>

          <!-- Guest Information -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Guest Information</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Name</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600; text-align: right;">${booking.guest_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">
                    <a href="mailto:${booking.guest_email}" style="color: ${accentColor}; text-decoration: none;">${booking.guest_email}</a>
                  </td>
                </tr>
                ${booking.guest_phone ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Phone</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">
                    <a href="tel:${booking.guest_phone}" style="color: ${accentColor}; text-decoration: none;">${booking.guest_phone}</a>
                  </td>
                </tr>
                ` : ""}
              </table>
            </td>
          </tr>

          <!-- Payment Confirmation -->
          ${booking.payment_status === "paid" ? `
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 10px; font-size: 16px; color: #166534;">✓ Payment Confirmed</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 4px 0; color: #166534; font-size: 14px; font-weight: 600;">Amount Paid</td>
                    <td style="padding: 4px 0; color: #166534; font-size: 18px; font-weight: 700; text-align: right;">${formatCurrency(booking.total_price)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #166534; font-size: 13px;">Transaction Reference</td>
                    <td style="padding: 4px 0; color: #166534; font-size: 13px; text-align: right; font-family: monospace;">${booking.payment_reference || "N/A"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #166534; font-size: 13px;">Payment Method</td>
                    <td style="padding: 4px 0; color: #166534; font-size: 13px; text-align: right;">${booking.payment_method === "payfast" ? "PayFast" : booking.payment_method || "Card"}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          ` : `
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #333; font-size: 18px; font-weight: 600;">Total Amount</td>
                    <td style="color: ${accentColor}; font-size: 24px; font-weight: 700; text-align: right;">${formatCurrency(booking.total_price)}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          `}

          <!-- Special Requests -->
          ${booking.special_requests ? `
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Special Requests</h2>
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-style: italic;">"${booking.special_requests}"</p>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- Action Required (only when the property has no PMS to receive the booking) -->
          ${(() => {
            const sys = String(property.external_system || "").toLowerCase();
            const hasPms = !!property.is_rol_property || (!!sys && sys !== "manual" && sys !== "none" && sys !== "native");
            if (hasPms) return "";
            return `
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 10px; font-size: 16px; color: #1e40af;">📋 Action Required</h3>
                <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.6;">
                  Please ensure this room is reserved for the guest. As this property is not connected to a PMS, 
                  you'll need to manually record this booking in your property management system or calendar.
                </p>
              </div>
            </td>
          </tr>`;
          })()}


          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 15px; color: #666; font-size: 14px;">
                This notification was sent on behalf of your guests.
              </p>
              ${(brand.isBranded && !property.is_rol_property) ? `
              <div style="border-top: 1px solid #e5e5e5; padding-top: 15px; margin-top: 10px;">
                <p style="margin: 0; color: #888; font-size: 11px;"><strong>${property.name}</strong></p>
              </div>` : `
              <div style="border-top: 1px solid #e5e5e5; padding-top: 15px; margin-top: 10px;">
                <p style="margin: 0; color: #aaa; font-size: 11px;">Powered by <a href="https://roomsonline.co.za" style="color: #aaa; text-decoration: none;">RoomsOnline</a> · Rooms Done Right</p>
              </div>`}
            </td>
          </tr>

          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate admin alert email HTML for failed sync on paid bookings
function generateAdminAlertEmail(booking: any, property: any, errorMessage?: string): string {
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  const bookingRef = guestReference(booking);
  const dashboardUrl = "https://sleepinafrica.roomsonline.co.za/dashboard/bookings";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ACTION REQUIRED: Booking Sync Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #fef2f2; border-radius: 8px 8px 0 0;">
              <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
              <h1 style="margin: 0; font-size: 24px; color: #991b1b; font-weight: 600;">MANUAL ACTION REQUIRED</h1>
              <p style="margin: 10px 0 0; color: #dc2626; font-size: 14px; font-weight: 500;">A guest has paid but the booking failed to sync to the PMS</p>
            </td>
          </tr>

          <!-- Booking Reference -->
          <tr>
            <td style="padding: 20px 40px 0;">
              <div style="background-color: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 5px; color: #991b1b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</p>
                <p style="margin: 0; color: #7f1d1d; font-size: 24px; font-weight: 700; font-family: monospace;">${bookingRef}</p>
              </div>
            </td>
          </tr>

          <!-- Sync Error -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Sync Error Details</h2>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; font-family: monospace; word-break: break-word;">
                  ${errorMessage || "Unknown sync error - check sync_logs for details"}
                </p>
              </div>
            </td>
          </tr>

          <!-- Booking Details -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid ${accentColor}; padding-bottom: 10px;">Booking Details</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Property</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 600; text-align: right;">${property.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">PMS System</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${property.external_system || "Unknown"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-in</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_in_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-out</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_out_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Duration</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${nights} night${nights > 1 ? "s" : ""}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Guests</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${totalGuests} guest${totalGuests > 1 ? "s" : ""}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Guest Details -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid ${accentColor}; padding-bottom: 10px;">Guest Information</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Name</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${booking.guest_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${booking.guest_email}</td>
                </tr>
                ${booking.guest_phone ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Phone</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${booking.guest_phone}</td>
                </tr>
                ` : ""}
              </table>
            </td>
          </tr>

          <!-- Payment Confirmation -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #dcfce7; border: 2px solid #22c55e; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 15px; font-size: 16px; color: #166534;">✓ Payment Confirmed</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #166534; font-size: 14px; font-weight: 600;">Amount Paid</td>
                    <td style="color: #166534; font-size: 20px; font-weight: 700; text-align: right;">${formatCurrency(booking.total_price)}</td>
                  </tr>
                  ${booking.payment_reference ? `
                  <tr>
                    <td style="padding-top: 8px; color: #166534; font-size: 13px;">Payment Reference</td>
                    <td style="padding-top: 8px; color: #166534; font-size: 13px; text-align: right; font-family: monospace;">${booking.payment_reference}</td>
                  </tr>
                  ` : ""}
                  ${booking.paid_at ? `
                  <tr>
                    <td style="padding-top: 4px; color: #166534; font-size: 13px;">Paid At</td>
                    <td style="padding-top: 4px; color: #166534; font-size: 13px; text-align: right;">${formatDate(booking.paid_at)}</td>
                  </tr>
                  ` : ""}
                </table>
              </div>
            </td>
          </tr>

          <!-- Required Action -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 10px; font-size: 16px; color: #92400e;">📋 Required Action</h3>
                <p style="margin: 0 0 15px; color: #78350f; font-size: 14px; line-height: 1.6;">
                  Please <strong>manually enter this booking</strong> in the PMS for <strong>${property.name}</strong>.
                </p>
                <p style="margin: 0; color: #78350f; font-size: 13px;">
                  Once complete, mark the booking as resolved in the dashboard.
                </p>
              </div>
            </td>
          </tr>

          <!-- Dashboard Link -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center;">
              <a href="${dashboardUrl}" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Booking in Dashboard</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 10px; color: #666; font-size: 12px;">This is an automated alert from RoomsOnline</p>
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 120px; height: auto;" />
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, status, error_message, sync_warning, recipient_email, document_kind } = validationResult.data;

    console.log(`Sending ${status} booking email for booking ${booking_id}${sync_warning ? ' (with sync warning)' : ''}`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, property:properties!bookings_property_id_fkey(*)")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("Booking lookup failed:", bookingError);
      return new Response(JSON.stringify({ error: "Unable to find booking" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const property = booking.property;

    // Reservation-only properties collect payment manually — hydrate their
    // banking block so the guest email can carry EFT instructions.
    if (isReservationOnlyBooking(booking, property)) {
      try {
        const { data: bank } = await supabaseClient
          .from("property_bank_details")
          .select("bank_name, branch_code, account_holder, account_number_masked, account_type, swift_code")
          .eq("property_id", property.id)
          .maybeSingle();
        if (bank) (property as any).__banking = bank;
      } catch (e) {
        console.warn("[send-booking-email] Bank detail lookup failed:", e);
      }
    }

    // Public contact details for the branded "property details" block.
    try {
      const { data: contacts } = await supabaseClient
        .from("property_contact_details")
        .select("name, email, phone, role, is_public, sort_order")
        .eq("property_id", property.id)
        .eq("is_public", true)
        .order("sort_order", { ascending: true })
        .limit(5);
      if (Array.isArray(contacts) && contacts.length) {
        (property as any).__contact = {
          hostName: contacts.find((c: any) => c.name)?.name || null,
          email: contacts.find((c: any) => c.email)?.email || null,
          phone: contacts.find((c: any) => c.phone)?.phone || null,
          cell: null,
        };
      }
    } catch (e) {
      console.warn("[send-booking-email] Contact lookup failed:", e);
    }

    // Guest-facing emails must always name the unit/room that was booked.
    // Some booking paths (PMS/native, channel pushes) leave `bookings.rooms` empty and
    // only store `rolos_room_ids` / `room_type_id`, so hydrate a rooms array from those.
    if (!Array.isArray(booking.rooms) || booking.rooms.length === 0) {
      const hydrated: Array<Record<string, unknown>> = [];
      try {
        // PRIMARY source: the booking's own room lines. Multi-unit stays (one booking,
        // several units) live here — the booking row only carries the FIRST room type.
        const { data: lines } = await supabaseClient
          .from("rolos_booking_rooms")
          .select(
            "id, room_type_id, room_id, adults, teens, children, infants, rate_charged, nightly_rate, rolos_room_types(name), rolos_rooms(room_name, room_number)",
          )
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: true });
        for (const line of lines || []) {
          const typeName = (line as any)?.rolos_room_types?.name as string | undefined;
          const unit = (line as any)?.rolos_rooms as { room_name?: string; room_number?: string } | null;
          const unitLabel = unit
            ? [unit.room_name || typeName, unit.room_number ? `#${unit.room_number}` : ""].filter(Boolean).join(" ")
            : "";
          hydrated.push({
            roomTypeId: line.room_type_id,
            roomTypeName: unitLabel || typeName || "Room",
            checkIn: booking.check_in_date,
            checkOut: booking.check_out_date,
            numberOfAdults: line.adults ?? 0,
            numberOfTeens: line.teens ?? 0,
            numberOfChildren: line.children ?? 0,
            numberOfInfants: line.infants ?? 0,
            lineTotal: line.rate_charged ?? null,
            nightlyRate: line.nightly_rate ?? null,
          });
        }

        const roomIds: string[] = Array.isArray(booking.rolos_room_ids) ? booking.rolos_room_ids : [];
        if (hydrated.length === 0 && roomIds.length > 0) {
          const { data: rows } = await supabaseClient
            .from("rolos_rooms")
            .select("id, room_name, room_number, room_type_id, rolos_room_types(name)")
            .in("id", roomIds);
          for (const r of rows || []) {
            const typeName = (r as any)?.rolos_room_types?.name as string | undefined;
            const label = [r.room_name || typeName, r.room_number ? `#${r.room_number}` : ""]
              .filter(Boolean)
              .join(" ");
            hydrated.push({
              roomTypeId: r.room_type_id,
              roomTypeName: label || typeName || "Room",
              checkIn: booking.check_in_date,
              checkOut: booking.check_out_date,
              numberOfAdults: booking.adults || 1,
              numberOfTeens: booking.teens || 0,
              numberOfChildren: booking.children || 0,
              numberOfInfants: booking.infants || 0,
            });
          }
        }

        if (hydrated.length === 0 && booking.room_type_id) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(booking.room_type_id),
          );
          if (isUuid) {
            const { data: rt } = await supabaseClient
              .from("rolos_room_types")
              .select("id, name")
              .eq("id", booking.room_type_id)
              .maybeSingle();
            if (rt?.name) {
              hydrated.push({
                roomTypeId: rt.id,
                roomTypeName: rt.name,
                checkIn: booking.check_in_date,
                checkOut: booking.check_out_date,
                numberOfAdults: booking.adults || 1,
                numberOfTeens: booking.teens || 0,
                numberOfChildren: booking.children || 0,
                numberOfInfants: booking.infants || 0,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[send-booking-email] Room hydration failed:", e);
      }

      if (hydrated.length > 0) {
        booking.rooms = hydrated;
        console.log(
          `[send-booking-email] Hydrated ${hydrated.length} room(s) for booking ${booking.id}: ${hydrated
            .map((r) => r.roomTypeName)
            .join(", ")}`,
        );
      }
    }


    // Handle admin_alert status - send to admin team, not guest
    if (status === "admin_alert") {
      console.log(`[Admin Alert] Sending sync failure notification for booking ${booking_id}`);
      
      const identity = await resolvePropertySender(supabaseClient, property.id);
      const adminFromEmail = identity.from || platformSender();
      const bookingRef = guestReference(booking);

      const adminEmailHtml = appendContactFooterHtml(
        generateAdminAlertEmail(booking, property, error_message),
        identity,
      );

      const { data: emailData, error: emailError } = await resend.emails.send({
        from: adminFromEmail,
        to: ["admin@roomsonline.co.za"],
        reply_to: identity.replyTo,
        subject: `⚠️ ACTION REQUIRED: Paid booking sync failed - ${property.name} - ${booking.guest_name}`,
        html: adminEmailHtml,
      });

      if (emailError) {
        console.error("[Admin Alert] Email send error:", emailError);
        throw new Error(emailError.message || "Failed to send admin alert email");
      }

      console.log("[Admin Alert] Email sent successfully:", emailData);

      // Log the admin alert email
      await supabaseClient.from("sync_logs").insert({
        booking_id,
        property_id: property.id,
        external_system: "resend",
        sync_type: "admin_alert_email",
        status: "success",
        message: `Admin alert sent for failed sync on paid booking`,
        response_data: emailData,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Admin alert email sent successfully",
          email_id: emailData?.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Handle property_notification status - send to property owner for non-PMS properties
    if (status === "property_notification") {
      console.log(`[Property Notification] Sending owner notification for booking ${booking_id}`);
      
      const identity = await resolvePropertySender(supabaseClient, property.id);
      const notifyFromEmail = identity.from || platformSender();
      const bookingRef = guestReference(booking);

      // Use recipient_email from request body, or fall back to property owner_email
      const ownerEmail = recipient_email || property.owner_email;

      if (!ownerEmail) {
        console.warn(`[Property Notification] No owner email found for property ${property.id}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "No owner email configured for property",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const ownerEmailHtml = appendContactFooterHtml(
        generatePropertyNotificationEmail(booking, property),
        identity,
      );

      const { data: emailData, error: emailError } = await resend.emails.send({
        from: notifyFromEmail,
        to: [ownerEmail],
        reply_to: identity.replyTo,
        subject: `🎉 New Booking Received - ${booking.guest_name} - ${formatDate(booking.check_in_date)} to ${formatDate(booking.check_out_date)}`,
        html: ownerEmailHtml,
      });

      if (emailError) {
        console.error("[Property Notification] Email send error:", emailError);
        throw new Error(emailError.message || "Failed to send property notification email");
      }

      console.log("[Property Notification] Email sent successfully to:", ownerEmail, emailData);

      // Log the property notification email
      await supabaseClient.from("sync_logs").insert({
        booking_id,
        property_id: property.id,
        external_system: "resend",
        sync_type: "property_notification_email",
        status: "success",
        message: `Property owner notification sent to ${ownerEmail}`,
        response_data: emailData,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Property notification email sent successfully",
          email_id: emailData?.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve property-scoped sender identity (friendly-from + reply-to).
    const identity = await resolvePropertySender(supabaseClient, property.id);
    const brand = resolveBranding(property);
    const fromEmail = identity.from || platformSender();

    // ─── Experience Engine template resolution (priority 1) ───
    let experienceEngineTemplate: string | null = null;
    try {
      const { data: uiConfig } = await supabaseClient
        .from('rolos_ui_configs')
        .select('experience_engine_enabled')
        .eq('property_id', property.id)
        .maybeSingle();

      if (uiConfig?.experience_engine_enabled) {
        const triggerMap: Record<string, string> = {
          success: 'booking_confirmed',
          failed: 'cancellation',
        };
        const trigger = triggerMap[status] || status;

        const { data: eeTpl } = await supabaseClient
          .from('rolos_message_templates')
          .select('body')
          .eq('property_id', property.id)
          .eq('trigger_event', trigger)
          .eq('is_active', true)
          .eq('channel', 'email')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (eeTpl?.body) {
          experienceEngineTemplate = eeTpl.body;
          console.log(`Property ${property.id} using Experience Engine template for trigger: ${trigger}`);
        }
      }
    } catch (eeErr) {
      console.warn('Experience Engine template lookup failed, falling back:', eeErr);
    }

    // ─── Legacy custom template check (priority 2) ───
    const amenities = property.amenities || {};
    const templates = amenities.templates || {};
    const customTemplateContent = experienceEngineTemplate || templates.template_content;
    const hasCustomTemplate = customTemplateContent && customTemplateContent.trim().length > 0;

    console.log(`Property ${property.id} has custom template: ${hasCustomTemplate}${experienceEngineTemplate ? ' (via Experience Engine)' : ''}`);

    // Generate email HTML based on status and custom template availability
    let html: string;
    // Reservation-only bookings must use the standard template so the banking
    // details, amount due and cancellation terms are always present.
    if (status === "success" && hasCustomTemplate && !isReservationOnlyBooking(booking, property)) {
      // Use custom template with variable replacement
      let processedContent = replaceTemplateVariables(customTemplateContent, booking, property);
      
      // If booking is paid, strip hardcoded "not yet paid" text and inject payment confirmation
      if (booking.payment_status === "paid") {
        // Remove common hardcoded payment-pending notes from custom templates
        processedContent = processedContent.replace(
          /Payment\s*Note\s*[:.]?\s*This\s+reservation\s+has\s+not\s+yet\s+been\s+paid[^<]*/gi,
          ''
        );
        processedContent = processedContent.replace(
          /An\s+invoice\s+with\s+deposit\s+and\s+settlement\s+amounts\s+will\s+be\s+issued\s+by\s+the\s+property\s+in\s+due\s+course\.?/gi,
          ''
        );
        // Inject payment confirmation block before closing tags
        const paidAt = booking.paid_at ? formatDate(booking.paid_at) : "Confirmed";
        const paymentRef = booking.payment_reference || "N/A";
        const paymentMethod = booking.payment_method || "Online Payment";
        const paymentBlock = `
          <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <p style="margin: 0 0 5px 0; color: #065f46; font-weight: bold; font-size: 14px;">✅ Payment Confirmed</p>
            <p style="margin: 0; color: #065f46; font-size: 13px; line-height: 1.5;">
              Method: ${paymentMethod}<br/>
              Reference: ${paymentRef}<br/>
              Date: ${paidAt}
            </p>
          </div>`;
        processedContent = processedContent + paymentBlock;
      }
      
      html = wrapCustomTemplate(processedContent, property);
      console.log("Using custom confirmation template");
      // If there's a sync warning, append it to custom template
      if (sync_warning) {
        html = html.replace('</body>', `
          <table role="presentation" style="max-width: 600px; width: 100%; margin: 0 auto; border-collapse: collapse;">
            <tr>
              <td style="padding: 20px 40px;">
                <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px;">
                  <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                    <strong>ℹ️ Note:</strong> ${sync_warning}
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </body>`);
      }
    } else if (status === "success") {
      // Fall back to default template - pass sync_warning to include warning box
      html = generateSuccessEmail(booking, property, sync_warning);
      console.log("Using default confirmation template");
    } else {
      // Failure emails always use default template
      html = generateFailureEmail(booking, property, error_message);
    }

    // Partner / affiliate perks — surprise reveal, only once the stay is paid/confirmed
    if (status === "success" && (booking.payment_status === "paid" || booking.status === "confirmed")) {
      const perkNights = calculateNights(booking.check_in_date, booking.check_out_date);
      const partnerOffers = await fetchQualifyingPartnerOffers(
        supabaseClient,
        [property.id],
        perkNights,
      );
      const perksHtml = renderPartnerOffersHTML(partnerOffers, {
        accent: resolveBranding(property).accentColor,
      });
      if (perksHtml) {
        const block = `
          <table role="presentation" style="max-width: 600px; width: 100%; margin: 0 auto; border-collapse: collapse;">
            <tr><td style="padding: 0 40px 20px;">${perksHtml}</td></tr>
          </table>
        </body>`;
        html = html.includes('</body>') ? html.replace('</body>', block) : html + perksHtml;
      }
      console.log(`[Email] Partner perks attached: ${partnerOffers.length}`);
    }

    const bookingRef = guestReference(booking);
    const subject =
      status === "success"
        ? `Booking Confirmed #${bookingRef} - ${property.name}`
        : `Booking Issue #${bookingRef} - ${property.name}`;

    console.log(`Sending email to ${booking.guest_email} from ${fromEmail}`);

    // Generate journey brochure attachment if booking has an itinerary
    let attachments: Array<{ filename: string; content: string; content_type: string }> = [];
    
    try {
      // Check if this booking has an associated itinerary
      const { data: itineraryBooking } = await supabaseClient
        .from("itinerary_bookings")
        .select("itinerary_id")
        .eq("booking_id", booking_id)
        .maybeSingle();
      
      if (itineraryBooking?.itinerary_id) {
        console.log(`[Email] Booking has itinerary: ${itineraryBooking.itinerary_id}`);
        
        // Generate brochure HTML via edge function
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        
        const brochureResponse = await fetch(
          `${supabaseUrl}/functions/v1/generate-itinerary-pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ itinerary_id: itineraryBooking.itinerary_id }),
          }
        );
        
        if (brochureResponse.ok) {
          const brochureData = await brochureResponse.json();
          if (brochureData.html) {
            // Convert HTML to base64 for attachment
            const encoder = new TextEncoder();
            const htmlBytes = encoder.encode(brochureData.html);
            const base64Content = btoa(String.fromCharCode(...htmlBytes));
            
            attachments.push({
              filename: `Journey-Brochure-${bookingRef}.html`,
              content: base64Content,
              content_type: "text/html",
            });
            
            console.log(`[Email] Journey brochure attached (${htmlBytes.length} bytes)`);
          }
        } else {
          console.warn(`[Email] Failed to generate brochure: ${brochureResponse.status}`);
        }
      }
    } catch (brochureError) {
      console.error("[Email] Failed to generate brochure attachment:", brochureError);
      // Continue without attachment - email is still valuable
    }

    // ── Account documents: pro forma with unpaid confirmations, or an explicitly requested document ──
    // Unpaid confirmations carry a pro forma invoice so the guest can settle before arrival.
    const paidStatuses = ["paid", "completed", "success", "succeeded"];
    const isPaid = paidStatuses.includes(String(booking.payment_status || "").toLowerCase());
    const wantedDoc: "pro_forma" | "tax_invoice" | null =
      document_kind || (status === "success" && !isPaid ? "pro_forma" : null);

    let accountDocBlock = "";
    if (wantedDoc) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const docRes = await fetch(`${supabaseUrl}/functions/v1/pms-financial`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            action: "generate_invoice",
            booking_id,
            property_id: booking.property_id,
            document_kind: wantedDoc,
            invoice_to: booking.guest_name,
          }),
        });
        const docData = await docRes.json().catch(() => null);
        const invoice = docData?.invoice;
        if (invoice?.pdf_url) {
          const label = wantedDoc === "pro_forma" ? "Pro Forma Invoice" : "Tax Invoice";
          accountDocBlock = `
          <div style="margin:20px 40px;padding:15px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#1e293b;">${label} ${invoice.invoice_number}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.5;">
              ${wantedDoc === "pro_forma"
                ? "Your pro forma invoice for this reservation is ready. It sets out the charges for your stay so you can arrange payment before arrival."
                : "Your final invoice for this stay is attached below."}
            </p>
            <a href="${invoice.pdf_url}" style="display:inline-block;padding:10px 16px;background-color:#1e293b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;">Download ${label}</a>
          </div>`;

          // Attach the document itself so it travels with the email
          try {
            const docHtmlRes = await fetch(invoice.pdf_url);
            if (docHtmlRes.ok) {
              const docHtml = await docHtmlRes.text();
              const bytes = new TextEncoder().encode(docHtml);
              let binary = "";
              bytes.forEach(b => { binary += String.fromCharCode(b); });
              attachments.push({
                filename: `${label.replace(/\s+/g, "-")}-${invoice.invoice_number}.html`,
                content: btoa(binary),
                content_type: "text/html",
              });
            }
          } catch (attachErr) {
            console.warn("[Email] Could not attach account document:", attachErr);
          }
        }
      } catch (docErr) {
        console.error("[Email] Failed to prepare account document:", docErr);
      }
    }

    // Send email with optional attachments
    let htmlWithDoc = html;
    if (accountDocBlock) {
      htmlWithDoc = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `${accountDocBlock}</body>`)
        : html + accountDocBlock;
    }
    const htmlWithContact = appendContactFooterHtml(htmlWithDoc, identity);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [booking.guest_email],
      reply_to: identity.replyTo,
      subject,
      html: htmlWithContact,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      // Return structured non-2xx-free response so callers can surface the reason
      // without supabase.functions.invoke turning it into a generic FunctionsHttpError.
      return new Response(
        JSON.stringify({
          ok: false,
          reason: emailError.message || "Email provider rejected the send",
          provider: "resend",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Email sent successfully:", emailData);

    // Log the email send
    await supabaseClient.from("sync_logs").insert({
      booking_id,
      property_id: property.id,
      external_system: "resend",
      sync_type: "email_send",
      status: "success",
      message: `Booking ${status} email sent to ${booking.guest_email}`,
      response_data: emailData,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        success: true,
        message: `Booking ${status} email sent successfully`,
        email_id: emailData?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Send booking email error:", error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, reason, error: reason }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

