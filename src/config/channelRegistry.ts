/**
 * Data-driven channel registry for the ROL'OS Channel Manager surface.
 *
 * Adding a channel that Rentals United already exposes is a data change here —
 * no component changes required. `connection_mode` decides how the connect flow
 * behaves:
 *
 *  - `ru_white_label`  distribution runs through the RU white-label account
 *                      (master → sub-user scope). ROL'OS pushes content/ARI and
 *                      RU fans out to the channel; the card only needs the
 *                      channel-side identifier once RU has activated the feed.
 *  - `direct`          ROL'OS talks to the channel (or its aggregator) directly
 *                      using the identifiers captured on the card.
 */

export type ChannelConnectionMode = "ru_white_label" | "direct";

export interface ChannelIdentifierField {
  key: string;
  label: string;
  help?: string;
  optional?: boolean;
}

export interface ChannelRegistryEntry {
  key: string;
  /** Display label shown in the UI (falls back to a title-cased key). */
  label?: string;

  /** How the connection is established. */
  connection_mode: ChannelConnectionMode;
  /** RU sales-channel name used to resolve the ChannelID via Pull_ListSalesChannels_RQ. */
  ru_sales_channel?: string;
  /** Identifiers the owner/admin must supply. */
  identifiers: ChannelIdentifierField[];
  /** Requires the RU listing to be live + eligible (MCQ) before it can go active. */
  requires_ru_listing: boolean;
  /** Hidden from the picker unless the admin enables it. */
  beta?: boolean;
}

export const CHANNEL_REGISTRY: ChannelRegistryEntry[] = [
  {
    key: "booking_com",
    connection_mode: "ru_white_label",
    ru_sales_channel: "Booking.com",
    requires_ru_listing: true,
    identifiers: [
      { key: "hotel_id", label: "Booking.com Hotel ID" },
      {
        key: "hyperguest_property_id",
        label: "HyperGuest Property ID",
        optional: true,
        help: "Only when this property is also distributed via HyperGuest — live ARI is then tunnelled through HyperGuest.",
      },
    ],
  },
  {
    key: "expedia",
    connection_mode: "ru_white_label",
    ru_sales_channel: "Expedia",
    requires_ru_listing: true,
    identifiers: [{ key: "property_id", label: "Expedia Property ID" }],
  },
  {
    key: "vrbo",
    connection_mode: "ru_white_label",
    ru_sales_channel: "Vrbo",
    requires_ru_listing: true,
    identifiers: [
      { key: "listing_id", label: "Vrbo Listing ID", help: "Distributed through Expedia Partner Central for Vrbo inventory." },
    ],
  },
  {
    key: "airbnb",
    connection_mode: "ru_white_label",
    ru_sales_channel: "Airbnb",
    requires_ru_listing: true,
    identifiers: [{ key: "listing_id", label: "Airbnb Listing ID" }],
  },
  {
    key: "lekkeslaap",
    connection_mode: "ru_white_label",
    ru_sales_channel: "LekkeSlaap",
    requires_ru_listing: true,
    identifiers: [{ key: "property_id", label: "LekkeSlaap Property ID" }],
  },
  {
    key: "google_hotels",
    connection_mode: "direct",
    requires_ru_listing: false,
    identifiers: [{ key: "partner_id", label: "Google Hotel Ads Partner ID" }],
  },
  {
    key: "agoda",
    connection_mode: "ru_white_label",
    ru_sales_channel: "Agoda",
    requires_ru_listing: true,
    identifiers: [{ key: "hotel_id", label: "Agoda Hotel ID" }],
    beta: true,
  },
  {
    key: "nightsbridge",
    connection_mode: "direct",
    requires_ru_listing: false,
    identifiers: [{ key: "bbid", label: "Property ID (BBID)" }],
    beta: true,
  },
];

export const getChannelEntry = (key: string): ChannelRegistryEntry | undefined =>
  CHANNEL_REGISTRY.find((c) => c.key === key);

/**
 * Maps a Rentals United readiness check key onto the property-editor deep link
 * (requirement `focus` key + owning tab) so a non-ready counter can send the
 * owner straight to the field that is missing.
 */
export const RU_CHECK_DEEPLINK: Record<string, { focus: string; tab: string }> = {
  has_name: { focus: "name", tab: "general" },
  has_object_type_id: { focus: "property_type", tab: "general" },
  has_description: { focus: "description", tab: "general" },
  description_meets_recommended: { focus: "description", tab: "general" },
  meets_minimum_amenities: { focus: "facilities", tab: "info" },
  amenities_not_padded: { focus: "facilities", tab: "info" },
  has_space: { focus: "rooms", tab: "rooms" },
  has_floor: { focus: "rooms", tab: "rooms" },
  can_sleep_max_ok: { focus: "rooms", tab: "rooms" },
  has_rooms: { focus: "rooms", tab: "rooms" },
  rooms_have_amenities: { focus: "rooms", tab: "rooms" },
  beds_cover_half: { focus: "rooms", tab: "rooms" },
  beds_meet_max_guests: { focus: "rooms", tab: "rooms" },
  meets_minimum_images: { focus: "images", tab: "images" },
  images_meet_size: { focus: "images", tab: "images" },
  has_main_image: { focus: "hero_image", tab: "images" },
  has_street: { focus: "address", tab: "general" },
  has_zip_code: { focus: "address", tab: "general" },
  has_detailed_location_id: { focus: "address", tab: "general" },
  has_coordinates: { focus: "geo", tab: "general" },
  has_payment_methods: { focus: "master_policy", tab: "policies" },
  has_cancellation_policies: { focus: "master_policy", tab: "policies" },
};

/** Build the property-editor deep link for a failing RU check. */
export function ruCheckDeepLink(propertyId: string, checkKey: string): string {
  const target = RU_CHECK_DEEPLINK[checkKey];
  if (!target) return `/admin/properties/${propertyId}`;
  return `/admin/properties/${propertyId}?tab=${target.tab}&focus=${target.focus}`;
}
