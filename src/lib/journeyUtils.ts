import type { ItineraryStay } from '@/contexts/ItineraryContext';

/**
 * Sort stays chronologically by check-in date.
 * Returns a new array — does not mutate the original.
 */
export function sortStaysChronologically(stays: ItineraryStay[]): ItineraryStay[] {
  return [...stays].sort((a, b) => a.dates.check_in.localeCompare(b.dates.check_in));
}
