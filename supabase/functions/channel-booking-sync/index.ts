// Push a booking change to the Channel Manager and report the outcome to the caller.
//
// Interactive surfaces (drag-and-drop move, cancel, edits) call this and await the answer so the
// operator sees "Channel updated" / "Queued behind the channel rate limit" / the channel's own
// refusal. The database trigger enqueues the same work as a background job, so a change made on a
// surface that has not been wired up still reaches the channel.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { syncBookingToChannel, type ChannelBookingChange } from '../_shared/channelBookingSync.ts';

const CHANGES: ChannelBookingChange[] = [
  'created',
  'moved',
  'dates',
  'pax',
  'price',
  'payment',
  'notes',
  'status',
  'cancelled',
  'deleted',
  'unknown',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : '';
    if (!bookingId) {
      return json({ success: false, error: { code: 'INVALID_REQUEST', message: 'booking_id is required' } }, 400);
    }

    const rawChange = String(body?.change ?? 'unknown') as ChannelBookingChange;
    const change: ChannelBookingChange = CHANGES.includes(rawChange) ? rawChange : 'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const previous = body?.previous && typeof body.previous === 'object'
      ? {
        room_type_id: body.previous.room_type_id ?? null,
        check_in_date: body.previous.check_in_date ?? null,
        check_out_date: body.previous.check_out_date ?? null,
      }
      : null;

    const result = await syncBookingToChannel(supabase, {
      booking_id: bookingId,
      change,
      previous,
      reason: typeof body?.reason === 'string' ? body.reason : null,
      cancel_type_id: Number.isFinite(Number(body?.cancel_type_id)) ? Number(body.cancel_type_id) : null,
      skip_ari: body?.skip_ari === true,
    });

    return json({ success: result.reservation !== 'failed', ...result });
  } catch (err) {
    console.error('[channel-booking-sync] error:', err);
    return json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
    }, 500);
  }
});
