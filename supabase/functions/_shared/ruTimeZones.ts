/**
 * Rentals United `CompanyInfo/TimeZone` normalisation (edge-side twin of
 * `src/lib/ruTimeZones.ts`).
 *
 * RU expects a canonical IANA identifier ("Africa/Johannesburg"). Older records
 * captured free text ("UTC+02:00", "SAST"), which RU silently drops or rejects,
 * so every company push runs the stored value through here first.
 */

const OFFSET_FALLBACK: Record<string, string> = {
  '+00:00': 'UTC',
  '+01:00': 'Africa/Lagos',
  '+02:00': 'Africa/Johannesburg',
  '+03:00': 'Africa/Nairobi',
  '+04:00': 'Asia/Dubai',
  '+05:30': 'Asia/Kolkata',
  '+07:00': 'Asia/Bangkok',
  '+08:00': 'Asia/Singapore',
  '+09:00': 'Asia/Tokyo',
  '+10:00': 'Australia/Sydney',
  '+12:00': 'Pacific/Auckland',
  '-03:00': 'America/Sao_Paulo',
  '-05:00': 'America/New_York',
  '-06:00': 'America/Chicago',
  '-07:00': 'America/Denver',
  '-08:00': 'America/Los_Angeles',
};

export function normalizeRuTimeZone(raw?: string | null): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^[A-Za-z]+\/[A-Za-z_/+-]+$/.test(value)) return value;
  if (/^(sast|south africa standard time)$/i.test(value)) return 'Africa/Johannesburg';
  if (/^(cat|central africa(n)? time)$/i.test(value)) return 'Africa/Maputo';
  if (/^(eat|east africa(n)? time)$/i.test(value)) return 'Africa/Nairobi';
  if (/^(gmt|utc|z)$/i.test(value)) return 'UTC';
  const offset = value.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
  if (offset) {
    const sign = offset[1];
    const hh = String(Number(offset[2])).padStart(2, '0');
    const mm = offset[3] ?? '00';
    return OFFSET_FALLBACK[`${sign}${hh}:${mm}`] ?? '';
  }
  return '';
}
