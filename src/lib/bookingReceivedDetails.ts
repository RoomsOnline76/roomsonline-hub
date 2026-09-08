/**
 * Everything a booking arrived with, read back in one shape.
 *
 * Channel reservations land with far more detail than the edit form used to show: the guest's own
 * contact record, the address and country supplied, the night-by-night prices the channel priced
 * the stay at, the account that created it, and how much of the money was already taken at the
 * channel. All of it is stored on `bookings.modification_notes` by the ingest, so this module is the
 * single reader for that payload — the dialog stays presentational and other surfaces can reuse it.
 */

export interface ReceivedNightPrice {
  date: string;
  price: number;
}

export interface ReceivedUnitNote {
  date_from: string | null;
  date_to: string | null;
  guests: number | null;
  comments: string | null;
}

export interface ReceivedChannelDetails {
  /** Channel's own reservation id, e.g. the RU reservation number. */
  reservationId: string | null;
  /** Secondary channel reference where the channel supplies one. */
  secondaryId: string | null;
  /** Human label for the account/channel that created the reservation. */
  channelLabel: string | null;
  createdAt: string | null;
  syncedAt: string | null;
  address: string | null;
  zipCode: string | null;
  countryId: string | null;
  arrivalTime: string | null;
  guestComments: string | null;
  reservationComments: string | null;
  nights: ReceivedNightPrice[];
  nightsTotal: number | null;
  unitNotes: ReceivedUnitNote[];
  amountAlreadyPaid: number | null;
  /** True when any of the above carries something worth showing. */
  hasDetails: boolean;
}

type Notes = Record<string, unknown> | null | undefined;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "null" ? null : s;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `modification_notes` is a bag on some bookings and an append-only array on others. */
function latestNotes(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i -= 1) {
      const entry = raw[i];
      if (entry && typeof entry === "object") return entry as Record<string, unknown>;
    }
    return {};
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function readChannelDetails(rawNotes: unknown, fallbackReservationId?: string | null): ReceivedChannelDetails {
  const notes = latestNotes(rawNotes);

  const nights: ReceivedNightPrice[] = Array.isArray(notes.nightly_prices)
    ? (notes.nightly_prices as unknown[])
        .map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          const date = str(row.date);
          const price = num(row.price);
          return date && price !== null ? { date, price } : null;
        })
        .filter((n): n is ReceivedNightPrice => n !== null)
    : [];

  const unitNotes: ReceivedUnitNote[] = Array.isArray(notes.unit_comments)
    ? (notes.unit_comments as unknown[]).map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          date_from: str(row.date_from),
          date_to: str(row.date_to),
          guests: num(row.guests),
          comments: str(row.comments),
        };
      })
    : [];

  const creator = (notes.ru_creator_channel ?? {}) as Record<string, unknown>;
  const channelLabel =
    str(creator.channel_label) ?? str(creator.creator) ?? str(notes.creator) ?? str(notes.channel);

  const details: Omit<ReceivedChannelDetails, "hasDetails"> = {
    reservationId: str(notes.ru_reservation_id) ?? str(fallbackReservationId),
    secondaryId: str(notes.resapa_id),
    channelLabel,
    createdAt: str(notes.created_date),
    syncedAt: str(notes.synced_at),
    address: str(notes.address),
    zipCode: str(notes.zip_code),
    countryId: str(notes.country_id),
    arrivalTime: str(notes.arrival_time),
    guestComments: str(notes.guest_comments),
    reservationComments: str(notes.reservation_comments),
    nights,
    nightsTotal: nights.length > 0 ? Math.round(nights.reduce((sum, n) => sum + n.price, 0) * 100) / 100 : null,
    unitNotes,
    amountAlreadyPaid: num(notes.amount_already_paid),
  };

  const hasDetails = Boolean(
    details.reservationId ||
      details.channelLabel ||
      details.nights.length > 0 ||
      details.address ||
      details.guestComments ||
      details.reservationComments ||
      details.unitNotes.length > 0,
  );

  return { ...details, hasDetails };
}

export interface CommissionView {
  /** Percentage applied, when one was recorded. */
  rate: number | null;
  amount: number | null;
  type: string | null;
  /** Guest total less our commission — what the property earns on this stay. */
  netToProperty: number | null;
}

export function readCommission(input: {
  guestTotal: number;
  calculated_commission?: number | null;
  commission_rate_applied?: number | null;
  commission_type?: string | null;
}): CommissionView {
  const rate = num(input.commission_rate_applied);
  const stored = num(input.calculated_commission);
  // Nothing computed yet: the recorded rate still tells the operator what this stay will cost.
  const amount = stored !== null
    ? stored
    : rate !== null && input.guestTotal > 0
      ? Math.round(input.guestTotal * (rate / 100) * 100) / 100
      : null;
  return {
    rate,
    amount,
    type: str(input.commission_type),
    netToProperty: amount === null ? null : Math.round((input.guestTotal - amount) * 100) / 100,
  };
}
