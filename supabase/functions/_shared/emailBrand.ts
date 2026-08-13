/**
 * Shared email branding.
 *
 * Money emails (balance requests, credit notices, confirmations) must look like they come from the
 * property when branding is switched on or the property is white-label: its colours, its logo, its
 * sign-off, its domain. This module is the single source of truth for those tokens so no email
 * hardcodes the platform palette again.
 */

// deno-lint-disable-next-line no-explicit-any
type Db = any;

const PLATFORM_SITE = "https://sleepinafrica.roomsonline.co.za";
const ROL_LOGO = "https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png";

export interface EmailBrand {
  /** Branding on: ROL'OS property with colours, explicit override, or white-label. */
  isBranded: boolean;
  isWhiteLabel: boolean;
  propertyName: string;
  accent: string;
  secondary: string;
  fontColor: string;
  dark: string;
  muted: string;
  pageBg: string;
  paper: string;
  hairline: string;
  logoUrl: string | null;
  headingFont: string;
  bodyFont: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  /** Base URL for guest links — the white-label domain when one is configured. */
  siteBaseUrl: string;
}

const DEFAULTS = {
  accent: "#E91E8C",
  secondary: "#FFFDFA",
  fontColor: "#1A1A2E",
  dark: "#1A1A2E",
  muted: "#8C8677",
  pageBg: "#FBF9F6",
  paper: "#FFFDFA",
  hairline: "#EFE9E1",
};

// deno-lint-disable-next-line no-explicit-any
export function resolveEmailBrandFromProperty(
  // deno-lint-disable-next-line no-explicit-any
  property: any,
  opts: {
    whiteLabelAllowed?: boolean;
    whiteLabelDomain?: string | null;
    contactEmail?: string;
    contactPhone?: string;
  } = {},
): EmailBrand {
  const isWhiteLabel = !!opts.whiteLabelAllowed;
  const hasColors = !!property?.brand_primary_color;
  const isRol = !!property?.is_rol_property;
  const isBranded = hasColors && (isRol || !!property?.brand_override_enabled || isWhiteLabel);

  const pick = (value: unknown, fallback: string) =>
    isBranded && typeof value === "string" && value.trim() ? value : fallback;

  const headingFont = isBranded && property?.brand_heading_font
    ? `'${property.brand_heading_font}', Georgia, 'Times New Roman', serif`
    : `Georgia, 'Times New Roman', serif`;

  const websiteUrl = opts.whiteLabelDomain
    ? `https://${opts.whiteLabelDomain}`
    : property?.slug
    ? `${PLATFORM_SITE}/p/${property.slug}`
    : undefined;

  return {
    isBranded,
    isWhiteLabel,
    propertyName: property?.name || "RoomsOnline",
    accent: pick(property?.brand_primary_color, DEFAULTS.accent),
    secondary: pick(property?.brand_secondary_color, DEFAULTS.secondary),
    fontColor: pick(property?.brand_font_color, DEFAULTS.fontColor),
    dark: pick(property?.brand_dark_bg_color, DEFAULTS.dark),
    muted: pick(property?.brand_muted_text_color, DEFAULTS.muted),
    pageBg: pick(property?.brand_light_bg_color, DEFAULTS.pageBg),
    paper: DEFAULTS.paper,
    hairline: DEFAULTS.hairline,
    logoUrl: isBranded && property?.brand_logo_url ? property.brand_logo_url : (isWhiteLabel ? null : ROL_LOGO),
    headingFont,
    bodyFont: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`,
    contactEmail: opts.contactEmail,
    contactPhone: opts.contactPhone,
    websiteUrl,
    siteBaseUrl: opts.whiteLabelDomain ? `https://${opts.whiteLabelDomain}` : PLATFORM_SITE,
  };
}

/** Load the property's brand, white-label and public contact details in one go. */
export async function resolveEmailBrand(
  supabase: Db,
  propertyId: string | null | undefined,
): Promise<EmailBrand> {
  if (!propertyId) return resolveEmailBrandFromProperty(null);

  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, name, slug, is_rol_property, brand_override_enabled, brand_primary_color, brand_secondary_color, brand_font_color, brand_dark_bg_color, brand_muted_text_color, brand_light_bg_color, brand_logo_url, brand_heading_font, brand_body_font",
    )
    .eq("id", propertyId)
    .maybeSingle();

  let whiteLabelAllowed = false;
  let whiteLabelDomain: string | null = null;
  try {
    const { data: cfg } = await supabase
      .from("property_billing_configs")
      .select("white_label_allowed, white_label_domain")
      .eq("property_id", propertyId)
      .maybeSingle();
    whiteLabelAllowed = !!cfg?.white_label_allowed;
    whiteLabelDomain = cfg?.white_label_domain || null;
  } catch (_e) {
    // best effort
  }

  let contactEmail: string | undefined;
  let contactPhone: string | undefined;
  try {
    const { data: contacts } = await supabase
      .from("property_contact_details")
      .select("email, phone, is_public, sort_order")
      .eq("property_id", propertyId)
      .eq("is_public", true)
      .order("sort_order", { ascending: true })
      .limit(5);
    if (Array.isArray(contacts) && contacts.length) {
      contactEmail = contacts.find((c: { email?: string }) => c.email)?.email || undefined;
      contactPhone = contacts.find((c: { phone?: string }) => c.phone)?.phone || undefined;
    }
  } catch (_e) {
    // best effort
  }

  return resolveEmailBrandFromProperty(property, {
    whiteLabelAllowed,
    whiteLabelDomain,
    contactEmail,
    contactPhone,
  });
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Sign-off block. White-label / branded properties sign off as themselves; everyone else keeps the
 * RoomsOnline-backed footer.
 */
export function renderBrandedFooterHtml(brand: EmailBrand): string {
  const bits: string[] = [];
  if (brand.contactPhone) {
    bits.push(
      `<a href="tel:${esc(brand.contactPhone)}" style="color:inherit;text-decoration:none;">${esc(brand.contactPhone)}</a>`,
    );
  }
  if (brand.contactEmail) {
    bits.push(
      `<a href="mailto:${esc(brand.contactEmail)}" style="color:inherit;text-decoration:none;">${esc(brand.contactEmail)}</a>`,
    );
  }
  if (brand.websiteUrl) {
    bits.push(
      `<a href="${esc(brand.websiteUrl)}" style="color:inherit;text-decoration:none;">${esc(brand.websiteUrl.replace(/^https?:\/\//, ""))}</a>`,
    );
  }

  const platformLine = brand.isWhiteLabel
    ? ""
    : `<div style="margin:8px 0 0;font-size:11px;color:${brand.muted};">Reservations powered by RoomsOnline</div>`;

  return `
    <div style="padding:18px 24px 22px;background:${brand.pageBg};border-top:1px solid ${brand.hairline};text-align:center;font-family:${brand.bodyFont};color:${brand.muted};font-size:12px;line-height:1.6;">
      <div style="margin:0 0 4px;color:${brand.fontColor};font-weight:600;">Contact ${esc(brand.propertyName)}</div>
      <div style="margin:0;">${bits.join(" &nbsp;·&nbsp; ")}</div>
      ${platformLine}
    </div>`;
}

/** Masthead: the property's logo when branded, otherwise its name in the display face. */
export function renderBrandedHeaderHtml(brand: EmailBrand, title: string): string {
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.propertyName)}" style="max-height:44px;margin:0 0 12px;display:block;" />`
    : "";
  return `
    <div style="padding:26px 28px 8px;">
      ${logo}
      <p style="margin:0;font-family:${brand.bodyFont};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};">${esc(brand.propertyName)}</p>
      <h1 style="margin:8px 0 0;font-family:${brand.headingFont};font-size:26px;font-weight:400;color:${brand.fontColor};">${esc(title)}</h1>
    </div>`;
}
