/**
 * ROL reference helpers for edge functions.
 *
 * Format: ROL-<PROP>-<NNNN> (e.g. ROL-JON-1042); journeys use ROL-TRIP-<NNNN>.
 * The legacy long form ROL-<ORIGIN>-<KIND>-<PROP>-<NNNNN>
 * References are minted by the `assign_rol_booking_reference` trigger on insert, so
 * ingest paths never need to build one. These helpers are for reading/formatting:
 * statements, e-mails, invoices and API payloads.
 *
 * Keep in sync with `src/lib/bookingReference.ts` and `public.rol_origin_code()`.
 */

export type RolOriginCode =
  | 'WEB' | 'WL' | 'EMB' | 'JNY' | 'PMS'
  | 'RU' | 'HG' | 'HF' | 'BEN' | 'NB' | 'CB' | 'CF' | 'OTA';

export type RolReferenceKind = 'B' | 'R';

const IN_ECOSYSTEM: RolOriginCode[] = ['WEB', 'WL', 'EMB', 'JNY', 'PMS'];

export const ROL_ORIGIN_LABELS: Record<string, string> = {
  WEB: 'ROL marketplace',
  WL: 'White-label site',
  EMB: 'Widget / WordPress embed',
  JNY: 'Journey builder',
  PMS: 'Front desk (manual)',
  RU: 'Channel connection',
  HG: 'Channel connection',
  HF: 'Property management system',
  BEN: 'Property management system',
  NB: 'Property management system',
  CB: 'Property management system',
  CF: 'Property management system',
  OTA: 'External channel',
};

export function resolveOriginCode(integrationType?: string | null, bookingChannel?: string | null): RolOriginCode {
  const it = (integrationType || '').toLowerCase();
  const bc = (bookingChannel || '').toLowerCase();
  if (it.startsWith('rentalsunited') || bc.startsWith('rentals_united')) return 'RU';
  if (it.startsWith('hyperguest')) return 'HG';
  if (it.startsWith('hostfully')) return 'HF';
  if (it.startsWith('benson') || it.startsWith('bed24') || it.startsWith('beds24')) return 'BEN';
  if (it.startsWith('nightsbridge')) return 'NB';
  if (it.startsWith('cloudbeds')) return 'CB';
  if (it.startsWith('checkfront')) return 'CF';
  if (it === 'wordpress' || bc === 'wordpress') return 'EMB';
  if (it === 'embed' || it === 'widget' || bc === 'embed' || bc === 'widget') return 'EMB';
  if (bc.includes('itinerary') || bc.includes('journey') || it.includes('journey')) return 'JNY';
  if (it === 'rol_marketplace' || bc === 'marketplace') return 'WEB';
  if (bc === 'white_label' || bc === 'whitelabel') return 'WL';
  if (['manual', 'front_desk', 'walk_in', 'phone', 'email'].includes(bc)) return 'PMS';
  if (['rolos', 'none', ''].includes(it) || ['direct', 'legacy_direct'].includes(bc)) return 'WEB';
  return 'OTA';
}

export function kindForOrigin(origin: RolOriginCode): RolReferenceKind {
  return IN_ECOSYSTEM.includes(origin) ? 'B' : 'R';
}

/** Reference to quote to guests, owners and on statements. */
export function displayBookingReference(booking: {
  rol_reference?: string | null;
  rol_reference_legacy?: string | null;
  external_reservation_id?: string | null;
  id?: string | null;
}): string {
  return booking.rol_reference
    || booking.rol_reference_legacy
    || booking.external_reservation_id
    || '—';
}

/**
 * Reconciliation label for statements: the ROL reference plus the channel's own
 * reference when the two differ, e.g. "ROL-RU-R-JON-00311 · channel ref 88213345".
 */
export function reconciliationReference(booking: {
  rol_reference?: string | null;
  rol_reference_legacy?: string | null;
  external_reservation_id?: string | null;
  id?: string | null;
}): string {
  const primary = displayBookingReference(booking);
  const external = booking.external_reservation_id;
  if (external && external !== primary) return `${primary} · channel ref ${external}`;
  return primary;
}
