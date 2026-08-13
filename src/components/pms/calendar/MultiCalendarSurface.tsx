import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { format, isSameDay } from "date-fns";
import { Building2, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSaHolidayName, isWeekendDay } from "@/lib/saPublicHolidays";

/** Compact density used by every ROL'OS multi-calendar surface. */
export const MC_COL_W = 46;
export const MC_LABEL_W = 200;

export interface MultiCalendarGroup {
  id: string;
  /** Property band label — omit for a single ungrouped stack. */
  name?: string;
  /** Small right-aligned meta shown in the band (room counts, badges). */
  meta?: ReactNode;
  /** Optional action rendered at the end of the band. */
  action?: ReactNode;
  rows: ReactNode;
}

interface Props {
  dates: Date[];
  /** Week bands across the top: label + how many columns it spans. */
  weeks: Array<{ label: string; span: number }>;
  groups: MultiCalendarGroup[];
  title?: string;
  subtitle?: string;
  /** Sticky label-column header (e.g. "Room type ... Units"). */
  labelHeader?: ReactNode;
  /** Toolbar content rendered on the right of the header bar. */
  toolbar?: ReactNode;
  colW?: number;
  labelW?: number;
  onShiftWindow?: (direction: -1 | 1) => void;
  onToday?: () => void;
  /** Fired when the viewport nears the right edge so callers can load more nights. */
  onExtend?: () => void;
  emptyMessage?: string;
}

/**
 * One continuous multi-calendar: properties stacked tightly down the sticky left
 * column, nights running to the right inside a single shared horizontal scroller.
 * Time is travelled sideways (drag the header, shift-wheel, or the nav buttons) —
 * never by stacking another block underneath.
 */
export function MultiCalendarSurface({
  dates,
  weeks,
  groups,
  title,
  subtitle,
  labelHeader,
  toolbar,
  colW = MC_COL_W,
  labelW = MC_LABEL_W,
  onShiftWindow,
  onToday,
  onExtend,
  emptyMessage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const extendRef = useRef(onExtend);
  extendRef.current = onExtend;

  // Horizontal wheel/trackpad panning — React's onWheel is passive so this must
  // be a native non-passive listener to be able to swallow the page scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const dx = e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const horizontal = e.shiftKey ? dy : Math.abs(dx) > Math.abs(dy) ? dx : 0;
      if (!horizontal) return;
      e.preventDefault();
      el.scrollLeft += horizontal;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !extendRef.current) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - colW * 3) extendRef.current();
  }, [colW]);

  // Drag-to-pan from the date/week header bands (cells stay clickable).
  const panFrom = useRef<{ x: number; left: number } | null>(null);
  const onPanStart = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    panFrom.current = { x: e.clientX, left: el.scrollLeft };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || !panFrom.current) return;
    el.scrollLeft = panFrom.current.left - (e.clientX - panFrom.current.x);
  };
  const onPanEnd = () => {
    panFrom.current = null;
  };

  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  const minWidth = labelW + dates.length * colW;

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      {(title || toolbar || onShiftWindow || onToday) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-primary/10 px-2 py-1">
          <div className="min-w-0">
            {title && <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{title}</p>}
            {subtitle && <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {toolbar}
            {onShiftWindow && (
              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onShiftWindow(-1)} aria-label="Earlier nights">
                <ChevronLeft className="h-3 w-3" />
              </Button>
            )}
            {onToday && (
              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onToday}>
                Today
              </Button>
            )}
            {onShiftWindow && (
              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onShiftWindow(1)} aria-label="Later nights">
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain" onScroll={handleScroll}>
        <div style={{ minWidth }}>
          {/* Week band — also the drag handle for sideways travel */}
          <div
            className="flex cursor-ew-resize select-none border-b border-border bg-muted/40"
            onPointerDown={onPanStart}
            onPointerMove={onPanMove}
            onPointerUp={onPanEnd}
            onPointerCancel={onPanEnd}
          >
            <div className="sticky left-0 z-20 shrink-0 bg-muted/40" style={{ width: labelW }} />
            {weeks.map((week, idx) => (
              <div
                key={`${week.label}-${idx}`}
                className="border-l border-border py-0.5 text-center text-[10px] font-medium text-muted-foreground"
                style={{ width: week.span * colW }}
              >
                {week.label}
              </div>
            ))}
          </div>

          {/* Date header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-card">
            <div className="sticky left-0 z-20 shrink-0 bg-card px-2 py-0.5" style={{ width: labelW }}>
              {labelHeader}
            </div>
            {dates.map((date) => {
              const holiday = getSaHolidayName(date);
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={date.toISOString()}
                  title={holiday || undefined}
                  className={cn(
                    "shrink-0 border-l border-border py-0.5 text-center",
                    isWeekendDay(date) && "bg-muted/40",
                    holiday && "bg-primary/10",
                    isToday && "border-l-2 border-l-primary"
                  )}
                  style={{ width: colW }}
                >
                  <p className="text-[9px] leading-tight text-muted-foreground">{format(date, "EEE")}</p>
                  <p className={cn("text-[10px] font-semibold leading-tight tabular-nums", isToday && "text-primary")}>
                    {format(date, "dd.MM")}
                  </p>
                </div>
              );
            })}
          </div>

          {groups.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {emptyMessage || "Nothing to show in this window."}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.id}>
              {group.name && (
                <div
                  className="sticky left-0 z-10 flex items-center gap-1.5 border-b border-border bg-muted/50 px-2 py-0.5"
                  style={{ width: minWidth }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    className="flex min-w-0 items-center gap-1.5 text-left"
                    aria-expanded={!collapsed[group.id]}
                  >
                    <ChevronDown
                      className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", collapsed[group.id] && "-rotate-90")}
                    />
                    <Building2 className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate text-[11px] font-semibold">{group.name}</span>
                  </button>
                  {group.meta && <span className="shrink-0 text-[10px] text-muted-foreground">{group.meta}</span>}
                  {group.action && <span className="ml-auto shrink-0">{group.action}</span>}
                </div>
              )}
              {!collapsed[group.id] && group.rows}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
