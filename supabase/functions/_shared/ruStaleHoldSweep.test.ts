import { describe, expect, it, vi, beforeEach } from 'vitest';

const refreshRuReservationById = vi.fn();
const releaseChannelBlocksForBooking = vi.fn().mockResolvedValue(2);

vi.mock('./ruReservationIngest.ts', () => ({ refreshRuReservationById }));
vi.mock('./ruReservationParsing.ts', () => ({ releaseChannelBlocksForBooking }));

const { sweepStaleRuHolds } = await import('./ruStaleHoldSweep.ts');

interface Candidate {
  id: string;
  external_reservation_id: string;
  property_id: string | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  created_at: string;
}

const updates: Record<string, unknown>[] = [];
const inserted: Record<string, unknown>[] = [];

function fakeDb(candidates: Candidate[]) {
  const bookings = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ['select', 'in', 'not', 'gte', 'or', 'order', 'eq', 'limit']) {
      // deno-lint-ignore no-explicit-any
      (chain as any)[k] = vi.fn(self);
    }
    // deno-lint-ignore no-explicit-any
    (chain as any).limit = vi.fn(() => Promise.resolve({ data: candidates, error: null }));
    // deno-lint-ignore no-explicit-any
    (chain as any).update = vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: vi.fn(() => Promise.resolve({ error: null })) };
    });
    return chain;
  };

  const notifications = () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ gte: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })),
    })),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserted.push(payload);
      return Promise.resolve({ error: null });
    }),
  });

  return { from: (table: string) => (table === 'bookings' ? bookings() : notifications()) };
}

const candidate: Candidate = {
  id: 'booking-1',
  external_reservation_id: '147176019',
  property_id: 'prop-1',
  status: 'pending',
  check_in_date: '2099-01-01',
  check_out_date: '2099-01-03',
  created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
};

describe('sweepStaleRuHolds', () => {
  beforeEach(() => {
    updates.length = 0;
    inserted.length = 0;
    refreshRuReservationById.mockReset();
    releaseChannelBlocksForBooking.mockClear();
  });

  it('settles a stay the channel no longer holds and releases its nights', async () => {
    refreshRuReservationById.mockResolvedValue({ outcome: 'failed', error: 'Reservation does not exist.' });
    const res = await sweepStaleRuHolds(fakeDb([candidate]) as never, { seenReservationIds: [] });
    expect(res.cancelled).toBe(1);
    expect(updates[0]).toMatchObject({ status: 'cancelled', cancellation_reason: 'Cancelled at the Channel Manager' });
    expect(releaseChannelBlocksForBooking).toHaveBeenCalledWith(expect.anything(), 'booking-1', expect.any(String));
  });

  it('never cancels on a channel rate refusal', async () => {
    refreshRuReservationById.mockResolvedValue({ outcome: 'failed', rateDeferred: true, error: 'rate limit' });
    const res = await sweepStaleRuHolds(fakeDb([candidate]) as never, { seenReservationIds: [] });
    expect(res.deferred).toBe(1);
    expect(res.cancelled).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('leaves a stay the channel still holds untouched', async () => {
    refreshRuReservationById.mockResolvedValue({ outcome: 'updated' });
    const res = await sweepStaleRuHolds(fakeDb([candidate]) as never, { seenReservationIds: [] });
    expect(res.live).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('does not verify a reservation the channel returned this run', async () => {
    const res = await sweepStaleRuHolds(fakeDb([candidate]) as never, { seenReservationIds: ['147176019'] });
    expect(res.verified).toBe(0);
    expect(refreshRuReservationById).not.toHaveBeenCalled();
  });

  it('does not treat an unclear channel error as a cancellation', async () => {
    refreshRuReservationById.mockResolvedValue({ outcome: 'failed', error: 'Unexpected error, contact IT' });
    const res = await sweepStaleRuHolds(fakeDb([candidate]) as never, { seenReservationIds: [] });
    expect(res.inconclusive).toBe(1);
    expect(updates).toHaveLength(0);
  });
});
