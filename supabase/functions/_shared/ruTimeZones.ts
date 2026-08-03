/**
 * Rentals United `CompanyInfo/TimeZone` normalisation (edge-side twin of
 * `src/lib/ruTimeZones.ts`).
 *
 * RU expects an exact fixed offset (`UTC+HH:MM` or `UTC-HH:MM`). Older records
 * may contain IANA names, so every company push converts those before XML output.
 */

const IANA_OFFSETS: Record<string, string> = {
  'Africa/Johannesburg': 'UTC+02:00', 'Africa/Windhoek': 'UTC+02:00',
  'Africa/Maputo': 'UTC+02:00', 'Africa/Nairobi': 'UTC+03:00',
  'Africa/Lagos': 'UTC+01:00', 'Europe/London': 'UTC+00:00',
  'Europe/Amsterdam': 'UTC+01:00', 'Europe/Berlin': 'UTC+01:00',
  'Asia/Dubai': 'UTC+04:00', 'Asia/Kolkata': 'UTC+05:30',
  'Asia/Bangkok': 'UTC+07:00', 'Asia/Singapore': 'UTC+08:00',
  'Asia/Tokyo': 'UTC+09:00', 'Australia/Sydney': 'UTC+10:00',
  'Pacific/Auckland': 'UTC+12:00', 'America/Sao_Paulo': 'UTC-03:00',
  'America/New_York': 'UTC-05:00', 'America/Chicago': 'UTC-06:00',
  'America/Denver': 'UTC-07:00', 'America/Los_Angeles': 'UTC-08:00',
};

export function normalizeRuTimeZone(raw?: string | null): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^UTC[+-](?:0\d|1[0-4]):[0-5]\d$/i.test(value)) return value.toUpperCase();
  if (IANA_OFFSETS[value]) return IANA_OFFSETS[value];
  if (/^(sast|south africa standard time|cat|central africa(n)? time)$/i.test(value)) return 'UTC+02:00';
  if (/^(eat|east africa(n)? time)$/i.test(value)) return 'UTC+03:00';
  if (/^(gmt|utc|z)$/i.test(value)) return 'UTC+00:00';
  const offset = value.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
  if (offset) {
    const sign = offset[1];
    const hh = String(Number(offset[2])).padStart(2, '0');
    const mm = offset[3] ?? '00';
    const hours = Number(hh);
    const minutes = Number(mm);
    if (hours > 14 || minutes > 59) return '';
    return `UTC${sign}${hh}:${mm}`;
  }
  return '';
}
