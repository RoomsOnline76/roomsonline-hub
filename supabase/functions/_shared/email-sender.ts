// Shared sender + contact resolution for property emails.
// All property-scoped emails send from our verified domain (notify.roomsonline.co.za),
// but the friendly-from name and local part are personalised per property, and
// the reply-to is set to the property's public contact address when available.

const VERIFIED_DOMAIN = "notify.roomsonline.co.za";
const PLATFORM_FROM = `RoomsOnline <hello@${VERIFIED_DOMAIN}>`;

export interface PropertyEmailIdentity {
  from: string;
  replyTo?: string;
  propertyName: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  isBranded: boolean;
}

function slugify(input: string): string {
  return (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function encodeDisplayName(name: string): string {
  const safe = (name || "RoomsOnline").replace(/["\\]/g, " ").trim();
  // Quote if the name contains anything other than plain ASCII letters/digits/spaces
  if (/[^A-Za-z0-9 ]/.test(safe)) return `"${safe}"`;
  return safe;
}

export function platformSender(): string {
  return PLATFORM_FROM;
}

/**
 * Build a property-scoped sender identity. Falls back to the platform sender
 * when no property row is available.
 */
export async function resolvePropertySender(
  supabase: any,
  propertyId: string | null | undefined,
  opts: { forceBranded?: boolean } = {},
): Promise<PropertyEmailIdentity> {
  if (!propertyId) {
    return {
      from: PLATFORM_FROM,
      propertyName: "RoomsOnline",
      isBranded: false,
    };
  }

  let property: any = null;
  try {
    // NOTE: only select columns that exist on public.properties.
    const { data, error } = await supabase
      .from("properties")
      .select("id, name, slug, is_rol_property")
      .eq("id", propertyId)
      .maybeSingle();
    if (error) console.error("[email-sender] property lookup failed:", error.message);
    property = data;
  } catch (_e) {
    property = null;
  }

  // White-label config lives on property_billing_configs.
  let whiteLabelDomain: string | undefined;
  let whiteLabelAllowed = false;
  if (property) {
    try {
      const { data: cfg } = await supabase
        .from("property_billing_configs")
        .select("white_label_allowed, white_label_domain")
        .eq("property_id", propertyId)
        .maybeSingle();
      whiteLabelAllowed = !!cfg?.white_label_allowed;
      whiteLabelDomain = cfg?.white_label_domain || undefined;
    } catch (_e) {
      // ignore
    }
  }

  if (!property) {
    return { from: PLATFORM_FROM, propertyName: "RoomsOnline", isBranded: false };
  }

  // Best-effort contact lookup — table may not exist in some environments.
  let contactEmail: string | undefined;
  let contactPhone: string | undefined;
  try {
    const { data: contact } = await supabase
      .from("property_contact_details")
      .select("email, phone, role, is_public, sort_order")
      .eq("property_id", propertyId)
      .eq("is_public", true)
      .order("sort_order", { ascending: true })
      .limit(5);
    if (Array.isArray(contact) && contact.length) {
      contactEmail = contact.find((c: any) => c.email)?.email || undefined;
      contactPhone = contact.find((c: any) => c.phone)?.phone || undefined;
    }
  } catch (_e) {
    // ignore
  }

  const isBranded =
    !!opts.forceBranded || !!property.white_label_enabled || !!property.is_rolos_property;

  const slug = slugify(property.slug || property.name || "") || "noreply";
  const displayName = encodeDisplayName(property.name || "RoomsOnline");
  const from = `${displayName} <${slug}@${VERIFIED_DOMAIN}>`;

  const websiteUrl = property.custom_domain
    ? `https://${property.custom_domain}`
    : property.slug
    ? `https://book.sleepinafrica.roomsonline.co.za/p/${property.slug}`
    : undefined;

  return {
    from,
    replyTo: contactEmail,
    propertyName: property.name || "RoomsOnline",
    contactEmail,
    contactPhone,
    websiteUrl,
    isBranded,
  };
}
