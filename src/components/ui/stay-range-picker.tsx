import * as React from "react";
import { format, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange, Matcher } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, type CalendarProps } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ────────────────────────────────────────────────────────────────────────────
   Shared "snake" range styling — check-in / check-out render as diagonal
   half-day cells so a departure day reads as half occupied, exactly like the
   room plan. All colours come from semantic tokens (see index.css).
   ──────────────────────────────────────────────────────────────────────────── */

export type StayCalendarSize = "default" | "compact";

export function stayRangeCalendarClassNames(
  size: StayCalendarSize = "default",
): CalendarProps["classNames"] {
  const compact = size === "compact";
  const box = compact ? "h-8 w-8" : "h-9 w-9";
  return {
    head_cell: cn("text-muted-foreground font-normal", compact ? "w-8 text-[0.7rem]" : "w-9 text-[0.8rem]"),
    cell: cn(
      box,
      "text-center p-0 relative focus-within:relative focus-within:z-20",
      compact ? "text-xs" : "text-sm",
      "[&:has([aria-selected])]:bg-transparent",
    ),
    day: cn(box, "p-0 font-normal rounded-md aria-selected:opacity-100 hover:bg-accent/60"),
    day_range_start: "rol-stay-start rounded-l-md rounded-r-none",
    day_range_end: "day-range-end rol-stay-end rounded-r-md rounded-l-none",
    day_range_middle: "rol-stay-middle rounded-none",
    day_selected: "rol-stay-selected",
    day_today: "ring-1 ring-inset ring-primary/50",
    day_outside: "day-outside text-muted-foreground opacity-40",
    day_disabled: "text-muted-foreground opacity-40 line-through",
  };
}

/** Half-day legend used under the calendar. */
export function StayRangeLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground", className)}>
      <span className="flex items-center gap-1.5">
        <span className="rol-stay-swatch rol-stay-start inline-block h-3.5 w-3.5 rounded-sm" />
        Check-in (afternoon)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rol-stay-swatch rol-stay-middle inline-block h-3.5 w-3.5 rounded-sm" />
        Night occupied
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rol-stay-swatch rol-stay-end inline-block h-3.5 w-3.5 rounded-sm" />
        Check-out (morning)
      </span>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

export const toDate = (value?: string | Date | null): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return isValid(value) ? value : undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
};

export const toIso = (value?: Date | null): string | undefined =>
  value ? format(value, "yyyy-MM-dd") : undefined;

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

export interface StayRangeChange {
  from?: string;
  to?: string;
  fromDate?: Date;
  toDate?: Date;
  nights: number;
}

export interface StayRangePickerProps {
  from?: string | Date | null;
  to?: string | Date | null;
  onChange: (range: StayRangeChange) => void;
  /** Earliest selectable date. Defaults to today; pass null to allow the past. */
  minDate?: Date | null;
  maxDate?: Date;
  /** Extra unselectable days (e.g. blocked nights). */
  disabledDays?: Matcher | Matcher[];
  minNights?: number;
  numberOfMonths?: number;
  size?: StayCalendarSize;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  /** Extra content rendered above the calendar inside the popover. */
  header?: React.ReactNode;
  modifiers?: CalendarProps["modifiers"];
  modifiersClassNames?: CalendarProps["modifiersClassNames"];
  showLegend?: boolean;
  id?: string;
}

export function StayRangePicker({
  from,
  to,
  onChange,
  minDate,
  maxDate,
  disabledDays,
  minNights = 1,
  numberOfMonths = 2,
  size = "default",
  placeholder = "Select arrival & departure",
  className,
  triggerClassName,
  disabled,
  align = "start",
  header,
  modifiers,
  modifiersClassNames,
  showLegend = true,
  id,
}: StayRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  const nights = fromDate && toDateValue ? Math.max(0, differenceInCalendarDays(toDateValue, fromDate)) : 0;

  const floor = minDate === null ? undefined : (minDate ?? startOfToday());

  const disabledMatcher = React.useMemo<Matcher | Matcher[]>(() => {
    const matchers: Matcher[] = [];
    if (floor) matchers.push({ before: floor });
    if (maxDate) matchers.push({ after: maxDate });
    if (Array.isArray(disabledDays)) matchers.push(...disabledDays);
    else if (disabledDays) matchers.push(disabledDays);
    return matchers;
  }, [floor, maxDate, disabledDays]);

  const emit = (range: DateRange | undefined) => {
    const nextFrom = range?.from;
    let nextTo = range?.to;
    if (nextFrom && nextTo && differenceInCalendarDays(nextTo, nextFrom) < minNights) {
      nextTo = undefined;
    }
    onChange({
      from: toIso(nextFrom),
      to: toIso(nextTo),
      fromDate: nextFrom,
      toDate: nextTo,
      nights: nextFrom && nextTo ? differenceInCalendarDays(nextTo, nextFrom) : 0,
    });
    if (nextFrom && nextTo) setOpen(false);
  };

  const label = fromDate
    ? toDateValue
      ? `${format(fromDate, "d MMM yyyy")} → ${format(toDateValue, "d MMM yyyy")} · ${nights} night${nights === 1 ? "" : "s"}`
      : `${format(fromDate, "d MMM yyyy")} → select departure`
    : placeholder;

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              size === "compact" && "h-8 text-xs",
              !fromDate && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <CalendarIcon className={cn("mr-2 shrink-0", size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4")} />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          {header}
          <Calendar
            mode="range"
            numberOfMonths={numberOfMonths}
            defaultMonth={fromDate}
            selected={fromDate ? { from: fromDate, to: toDateValue } : undefined}
            onSelect={(range) => emit(range as DateRange | undefined)}
            disabled={disabledMatcher}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            classNames={stayRangeCalendarClassNames(size)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
          {showLegend && (
            <div className="border-t px-3 py-2">
              <StayRangeLegend />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

StayRangePicker.displayName = "StayRangePicker";
