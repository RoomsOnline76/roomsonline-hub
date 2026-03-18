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
}

/**
 * Expanding-snake date range picker for embed contexts.
 * Renders an inline calendar with the range highlighted as a continuous pill shape.
 */
export function EmbedDatePicker({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  brandColor,
  fontColor = "#fff",
}: EmbedDatePickerProps) {
  const today = startOfDay(new Date());
  const initialMonth = today.getDate() > 25 ? addMonths(today, 1) : today;
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialMonth));
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

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
      ? `${format(ciDate, "d MMM")} – ${format(coDate, "d MMM")} (${nightsCount} night${nightsCount !== 1 ? "s" : ""})`
      : ciDate
        ? `${format(ciDate, "d MMM")} – select checkout`
        : "Select dates";

  return (
    <div style={{ position: "relative" }}>
      {/* Date pill trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: brandColor,
          color: fontColor,
          border: "none",
          padding: "8px 16px",
          borderRadius: "999px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <svg
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
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
            marginTop: "8px",
            width: "320px",
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {/* Month nav */}
          <div
            style={{
              padding: "12px 16px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "18px",
                color: "#666",
                padding: "4px 8px",
                borderRadius: "50%",
              }}
            >
              ‹
            </button>
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#111" }}>
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "18px",
                color: "#666",
                padding: "4px 8px",
                borderRadius: "50%",
              }}
            >
              ›
            </button>
          </div>

          {/* Day names */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              padding: "0 12px",
            }}
          >
            {dayNames.map((d) => (
              <span
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  color: "#999",
                  padding: "4px 0",
                  fontWeight: 500,
                }}
              >
                {d}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              padding: "0 12px 12px",
              gap: "2px",
            }}
          >
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
                bg = brandColor;
                color = fontColor;
                borderRadius = "50%";
              } else if (isCi) {
                bg = brandColor;
                color = fontColor;
                borderRadius = "50% 0 0 50%";
              } else if (isCo) {
                bg = brandColor;
                color = fontColor;
                borderRadius = "0 50% 50% 0";
              } else if (inRange) {
                bg = `${brandColor}22`;
                color = brandColor;
                borderRadius = "0";
              }

              return (
                <button
                  key={day.toISOString()}
                  disabled={isPast}
                  onClick={() => handleDayClick(day)}
                  style={{
                    border: "none",
                    background: bg,
                    color: isPast ? "#ccc" : color,
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius,
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isPast ? "default" : "pointer",
                    position: "relative",
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

          {/* Summary */}
          {ciDate && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #f0f0f0",
                background: "#fafafa",
                fontSize: "13px",
                color: "#666",
                textAlign: "center",
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
