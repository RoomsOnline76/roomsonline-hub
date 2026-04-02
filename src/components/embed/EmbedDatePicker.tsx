import { useState, useMemo, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isBefore,
  isAfter,
  isSameDay,
  startOfDay,
  addDays,
} from "date-fns";

interface EmbedDatePickerProps {
  checkIn: string;
  checkOut: string;
  onCheckInChange: (date: string) => void;
  onCheckOutChange: (date: string) => void;
  brandColor: string;
  fontColor?: string;
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EmbedDatePicker({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  brandColor,
  fontColor = "#fff",
  controlledOpen,
  onOpenChange,
}: EmbedDatePickerProps) {
  const today = startOfDay(new Date());
  const initialMonth = today.getDate() > 25 ? addMonths(today, 1) : today;
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialMonth));
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const ciDate = checkIn ? startOfDay(new Date(checkIn)) : null;
  const coDate = checkOut ? startOfDay(new Date(checkOut)) : null;

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const leadingBlanks = useMemo(() => getDay(startOfMonth(currentMonth)), [currentMonth]);

  const handleDayClick = useCallback(
    (day: Date) => {
      if (isBefore(day, today)) return;
      if (!selectingCheckOut || !ciDate) {
        onCheckInChange(format(day, "yyyy-MM-dd"));
        onCheckOutChange("");
        setSelectingCheckOut(true);
      } else {
        if (isBefore(day, ciDate) || isSameDay(day, ciDate)) {
          onCheckInChange(format(day, "yyyy-MM-dd"));
          onCheckOutChange("");
        } else {
          onCheckOutChange(format(day, "yyyy-MM-dd"));
          setSelectingCheckOut(false);
          setIsOpen(false);
        }
      }
    },
    [selectingCheckOut, ciDate, today, onCheckInChange, onCheckOutChange]
  );

  const isInRange = (d: Date) =>
    ciDate && coDate && isAfter(d, ciDate) && isBefore(d, coDate);

  const nightsCount =
    ciDate && coDate
      ? Math.round((coDate.getTime() - ciDate.getTime()) / 86400000)
      : 0;

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const label =
    ciDate && coDate
      ? `${format(ciDate, "d MMM")} – ${format(coDate, "d MMM")} (${nightsCount}n)`
      : ciDate
        ? `${format(ciDate, "d MMM")} – select checkout`
        : "Select dates";

  return (
    <div style={{ position: "relative" }}>
      {/* Trigger pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: brandColor,
          color: fontColor,
          border: "none",
          padding: "7px 16px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "opacity 0.15s",
          letterSpacing: "-0.01em",
        }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {label}
      </button>

      {/* Calendar dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            marginTop: "6px",
            width: "310px",
            background: "#fff",
            borderRadius: "14px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          {/* Month nav */}
          <div style={{ padding: "14px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <MonthNavBtn label="‹" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} />
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#111", letterSpacing: "-0.01em" }}>
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <MonthNavBtn label="›" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} />
          </div>

          {/* Day names */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 12px" }}>
            {dayNames.map((d) => (
              <span key={d} style={{ textAlign: "center", fontSize: "10px", color: "#aaa", padding: "4px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {d}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "2px 12px 12px", gap: "2px" }}>
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((day) => {
              const isPast = isBefore(day, today);
              const isCi = ciDate && isSameDay(day, ciDate);
              const isCo = coDate && isSameDay(day, coDate);
              const inRange = isInRange(day);
              const isToday = isSameDay(day, today);

              let bg = "transparent";
              let color = "#333";
              let borderRadius = "50%";

              if (isCi && isCo) {
                bg = brandColor; color = fontColor; borderRadius = "50%";
              } else if (isCi) {
                bg = brandColor; color = fontColor; borderRadius = "50% 0 0 50%";
              } else if (isCo) {
                bg = brandColor; color = fontColor; borderRadius = "0 50% 50% 0";
              } else if (inRange) {
                bg = `${brandColor}18`; color = brandColor; borderRadius = "0";
              }

              return (
                <button
                  key={day.toISOString()}
                  disabled={isPast}
                  onClick={() => handleDayClick(day)}
                  style={{
                    border: "none",
                    background: bg,
                    color: isPast ? "#d0d0d0" : color,
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius,
                    fontSize: "13px",
                    fontWeight: isCi || isCo ? 700 : 500,
                    cursor: isPast ? "default" : "pointer",
                    position: "relative",
                    transition: "background 0.1s, color 0.1s",
                    boxShadow:
                      isToday && !isCi && !isCo && !inRange
                        ? `inset 0 0 0 1.5px ${brandColor}`
                        : undefined,
                  }}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          {/* Summary footer */}
          {ciDate && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #f0f0f0",
                background: "#fafafa",
                fontSize: "12px",
                color: "#666",
                textAlign: "center",
                fontWeight: 500,
              }}
            >
              {coDate
                ? `${format(ciDate, "d MMM")} → ${format(coDate, "d MMM")} · ${nightsCount} night${nightsCount !== 1 ? "s" : ""}`
                : "Select check-out date"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthNavBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background: "#f5f5f5",
        cursor: "pointer",
        fontSize: "16px",
        color: "#555",
        padding: "4px 10px",
        borderRadius: "8px",
        fontWeight: 700,
        transition: "background 0.15s",
      }}
    >
      {label}
    </button>
  );
}
