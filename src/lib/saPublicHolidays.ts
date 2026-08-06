// South African public holidays used for calendar tinting across ROL'OS.
import { format } from "date-fns";

export const SA_PUBLIC_HOLIDAYS: Record<number, Record<string, string>> = {
  2025: {
    "2025-01-01": "New Year's Day", "2025-03-21": "Human Rights Day", "2025-04-18": "Good Friday",
    "2025-04-21": "Family Day", "2025-04-27": "Freedom Day", "2025-04-28": "Freedom Day (Observed)",
    "2025-05-01": "Workers' Day", "2025-06-16": "Youth Day", "2025-08-09": "National Women's Day",
    "2025-09-24": "Heritage Day", "2025-12-16": "Day of Reconciliation", "2025-12-25": "Christmas Day",
    "2025-12-26": "Day of Goodwill",
  },
  2026: {
    "2026-01-01": "New Year's Day", "2026-03-21": "Human Rights Day", "2026-04-03": "Good Friday",
    "2026-04-06": "Family Day", "2026-04-27": "Freedom Day", "2026-05-01": "Workers' Day",
    "2026-06-16": "Youth Day", "2026-08-10": "National Women's Day (Observed)", "2026-09-24": "Heritage Day",
    "2026-12-16": "Day of Reconciliation", "2026-12-25": "Christmas Day", "2026-12-26": "Day of Goodwill",
  },
  2027: {
    "2027-01-01": "New Year's Day", "2027-03-22": "Human Rights Day (Observed)", "2027-03-26": "Good Friday",
    "2027-03-29": "Family Day", "2027-04-27": "Freedom Day", "2027-05-01": "Workers' Day",
    "2027-06-16": "Youth Day", "2027-08-09": "National Women's Day", "2027-09-24": "Heritage Day",
    "2027-12-16": "Day of Reconciliation", "2027-12-25": "Christmas Day", "2027-12-27": "Day of Goodwill (Observed)",
  },
};

export function getSaHolidayName(date: Date): string | null {
  const dateStr = format(date, "yyyy-MM-dd");
  return SA_PUBLIC_HOLIDAYS[date.getFullYear()]?.[dateStr] || null;
}

export function isWeekendDay(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
