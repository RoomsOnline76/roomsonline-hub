/**
 * Open action items: the channel needs a human at ITS portal.
 *
 * Some channel refusals cannot be healed from here — a held request whose own nights the channel
 * insists are closed, a listing it no longer serves. Retrying those forever produced the refusal
 * storms the monitor kept reporting as "unresolved errors". Instead the loop stops and raises one
 * open item naming the reservation, the nights and the evidence we captured, so an operator can
 * clear it at the channel once and the monitor can show it as closed.
 *
 * One open row per (kind, reservation, property) — enforced by a partial unique index, so a
 * repeated attempt refreshes the same item instead of stacking duplicates.
 */

type Db = {
  from: (table: string) => any;
};

export type RuOpenActionKind =
  | 'confirm_request_blocked_dates'
  | 'listing_missing'
  | 'price_push_notice';

export interface RuOpenActionInput {
  kind: RuOpenActionKind;
  propertyId?: string | null;
  bookingId?: string | null;
  reservationId?: string | null;
  verb?: string | null;
  title: string;
  detail?: string | null;
  evidence?: Record<string, unknown>;
}

/** Raise (or refresh) an open action item. Never throws — observability must not break a push. */
export async function recordRuOpenAction(supabase: Db, input: RuOpenActionInput): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('ru_open_actions')
      .select('id')
      .eq('kind', input.kind)
      .eq('status', 'open')
      .eq('reservation_id', input.reservationId ?? '')
      .limit(1);
    const row = {
      kind: input.kind,
      property_id: input.propertyId ?? null,
      booking_id: input.bookingId ?? null,
      reservation_id: input.reservationId ?? '',
      verb: input.verb ?? null,
      title: input.title,
      detail: input.detail ?? null,
      evidence: input.evidence ?? {},
      status: 'open',
      updated_at: new Date().toISOString(),
    };
    const openId = (existing ?? [])[0]?.id as string | undefined;
    if (openId) {
      await supabase.from('ru_open_actions').update(row).eq('id', openId);
    } else {
      await supabase.from('ru_open_actions').insert(row);
    }
  } catch (err) {
    console.warn('[ruOpenActions] could not record open action:', err instanceof Error ? err.message : err);
  }
}

/** Close every open item for a reservation once the call it was blocking finally succeeded. */
export async function clearRuOpenActions(
  supabase: Db,
  args: { kind?: RuOpenActionKind; reservationId: string },
): Promise<void> {
  try {
    let query = supabase
      .from('ru_open_actions')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('status', 'open')
      .eq('reservation_id', args.reservationId);
    if (args.kind) query = query.eq('kind', args.kind);
    await query;
  } catch (err) {
    console.warn('[ruOpenActions] could not clear open actions:', err instanceof Error ? err.message : err);
  }
}
