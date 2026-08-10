import { useState, useMemo, useEffect } from "react";
import { format, addDays, eachDayOfInterval, isBefore, startOfDay } from "date-fns";

interface RoomAvailability {
  roomId: string;
  roomName: string;
  maxGuests?: number;
  maxAdults?: number;
  beds?: number;
  allowChildren?: boolean;
  childPolicyNote?: string;
  mealPlan?: string;
  /** Main rate per night keyed by yyyy-MM-dd. `null` = sold out, `undefined` = no rate loaded. */
  ratesByDate: Record<string, number | null>;
  /** Optional single-occupancy rate keyed by yyyy-MM-dd (shown as the small upper figure). */
  singleRatesByDate?: Record<string, number | null>;
}

interface EmbedAvailabilityGridProps {
  rooms: RoomAvailability[];
  startDate: string;
  visibleDays?: number;
  brandColor: string;
  fontColor: string;
  currency?: string;
  onBook?: (roomId: string, roomName: string) => void;
  /** Highlights a date span already reserved in the guest's journey. */
  highlightRange?: { from: string; to: string; label?: string } | null;
}


interface HoverCell {
  roomId: string;
  dateKey: string;
}

const money = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function EmbedAvailabilityGrid({
  rooms,
  startDate,
  visibleDays = 10,
  brandColor,
  fontColor,
  currency = "R",
  onBook,
  highlightRange,
}: EmbedAvailabilityGridProps) {
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<HoverCell | null>(null);
  // On narrow screens the trailing "Book" column scrolls out of view, so the
  // action moves into the always-visible room-name cell instead.
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const today = startOfDay(new Date());


  const dates = useMemo(() => {
    const base = addDays(new Date(startDate), offset);
    return eachDayOfInterval({ start: base, end: addDays(base, visibleDays - 1) });
  }, [startDate, offset, visibleDays]);

  const canGoBack = !isBefore(addDays(new Date(startDate), offset - 1), today);

  const isHighlighted = (key: string) =>
    !!highlightRange && key >= highlightRange.from && key < highlightRange.to;

  return (
    <div style={{ width: "100%", background: "#fff", padding: "4px 0 10px" }}>
      {highlightRange && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: "8px 16px 0",
            padding: "6px 10px",
            background: `${brandColor}14`,
            borderLeft: `3px solid ${brandColor}`,
            fontSize: "12px",
            color: "#3d3d3d",
          }}
        >
          <span style={{ fontWeight: 700, color: brandColor }}>
            {highlightRange.label || "Your journey"}
          </span>
          <span>
            {format(new Date(highlightRange.from), "d MMM")} – {format(new Date(highlightRange.to), "d MMM")}
          </span>
        </div>
      )}

      {/* Navigation — day / week stepper, NightsBridge style */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          padding: "12px 16px 8px",
        }}
      >
        <span style={{ fontSize: "12px", color: "#8a8a8a" }}>
          Move the mouse over the price for more info.
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
          <StepBtn label="‹" onClick={() => setOffset((o) => Math.max(o - 1, 0))} disabled={!canGoBack} />
          <StepLabel>DAY</StepLabel>
          <StepBtn label="‹‹" onClick={() => setOffset((o) => Math.max(o - 7, 0))} disabled={!canGoBack} />
          <StepLabel>WEEK</StepLabel>
          <StepBtn label="››" onClick={() => setOffset((o) => o + 7)} />
          <StepLabel>DAY</StepLabel>
          <StepBtn label="›" onClick={() => setOffset((o) => o + 1)} />
        </div>
      </div>

      <div style={{ overflowX: "auto", padding: "0 12px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            color: "#3d3d3d",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  ...thStyle,
                  minWidth: "180px",
                  textAlign: "left",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#2b2b2b",
                }}
              >
                Room Type
              </th>
              {dates.map((d) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const labelColor = isWeekend ? "#6b6b6b" : brandColor;
                const hl = isHighlighted(format(d, "yyyy-MM-dd"));
                return (
                  <th
                    key={d.toISOString()}
                    style={{
                      ...thStyle,
                      minWidth: "62px",
                      textAlign: "center",
                      background: hl ? `${brandColor}14` : "#fff",
                      borderBottom: hl ? `2px solid ${brandColor}` : thStyle.borderBottom,
                    }}
                  >

                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: labelColor,
                      }}
                    >
                      {format(d, "EEE")}
                    </div>
                    <div style={{ fontSize: "17px", fontWeight: 700, lineHeight: 1.15, color: labelColor }}>
                      {format(d, "d")}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#9a9a9a",
                      }}
                    >
                      {format(d, "MMM")}
                    </div>
                  </th>
                );
              })}
              {onBook && !isNarrow && <th style={{ ...thStyle, width: "56px" }} />}
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 2} style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: "13px" }}>
                  No rooms configured yet.
                </td>
              </tr>
            ) : (
              rooms.map((room) => (
                <tr key={room.roomId}>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "left",
                      ...(isNarrow
                        ? { position: "sticky" as const, left: 0, background: "#fff", zIndex: 2 }
                        : {}),
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ fontSize: "14px", color: brandColor, fontWeight: 500 }}>{room.roomName}</span>
                      <OccupancyIcons count={room.maxGuests || room.maxAdults || 2} />
                    </div>
                    {onBook && isNarrow && (
                      <button
                        onClick={() => onBook(room.roomId, room.roomName)}
                        title={`Book ${room.roomName}`}
                        style={{ ...bookButtonStyle, marginTop: "8px", width: "100%" }}
                      >
                        Book
                      </button>
                    )}
                  </td>

                  {dates.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const rate = room.ratesByDate[key];
                    const single = room.singleRatesByDate?.[key];
                    const isSold = rate === null;
                    const hasRate = rate !== undefined && rate !== null;
                    const isHovered = hover?.roomId === room.roomId && hover?.dateKey === key;

                    if (isSold) {
                      return (
                        <td key={key} style={{ ...tdStyle, textAlign: "center", padding: "6px 4px" }}>
                          <div
                            style={{
                              background: "#d9d9d9",
                              color: "#4a4a4a",
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              padding: "12px 2px",
                            }}
                          >
                            SOLD
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={key}
                        onMouseEnter={() => setHover({ roomId: room.roomId, dateKey: key })}
                        onMouseLeave={() => setHover((h) => (h?.roomId === room.roomId && h?.dateKey === key ? null : h))}
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          position: "relative",
                          padding: "6px 4px",
                          cursor: hasRate ? "default" : undefined,
                          background: isHovered && hasRate
                            ? "#f6f6f6"
                            : isHighlighted(key)
                              ? `${brandColor}0d`
                              : undefined,

                        }}
                      >
                        {hasRate ? (
                          <div style={{ padding: "6px 2px", lineHeight: 1.25 }}>
                            {single != null && single !== rate && (
                              <div style={{ fontSize: "11px", color: brandColor }}>{money(single)}</div>
                            )}
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#2b2b2b" }}>{money(rate)}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#cfcfcf" }}>–</span>
                        )}

                        {isHovered && hasRate && (
                          <RateTooltip
                            room={room}
                            date={d}
                            rate={rate}
                            single={single ?? undefined}
                            currency={currency}
                            brandColor={brandColor}
                          />
                        )}
                      </td>
                    );
                  })}
                  {onBook && (
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button
                        onClick={() => onBook(room.roomId, room.roomName)}
                        title={`Book ${room.roomName}`}
                        style={{
                          background: brandColor,
                          color: fontColor,
                          border: "none",
                          borderRadius: "2px",
                          padding: "7px 12px",
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Book
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Pieces ── */

function RateTooltip({
  room,
  date,
  rate,
  single,
  currency,
  brandColor,
}: {
  room: RoomAvailability;
  date: Date;
  rate: number;
  single?: number;
  currency: string;
  brandColor: string;
}) {
  const maxAdults = room.maxAdults || room.maxGuests || 2;
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        marginTop: "2px",
        minWidth: "210px",
        textAlign: "left",
        background: "#f1f1f1",
        border: "1px solid #dcdcdc",
        boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
        padding: "12px 14px",
        fontSize: "12px",
        color: "#3d3d3d",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, color: "#2b2b2b", marginBottom: "8px" }}>
        {format(date, "EEE, d MMM yyyy")}
      </div>
      <Row label="Max Occupancy" value={String(room.maxGuests || maxAdults)} />
      <Row label="Max Adults" value={String(maxAdults)} />
      <div style={{ marginTop: "8px", fontWeight: 700, color: "#2b2b2b" }}>Child Policy</div>
      <div style={{ color: "#6b6b6b" }}>
        {room.childPolicyNote || (room.allowChildren === false ? "No children allowed." : "Children welcome.")}
      </div>
      {room.mealPlan && (
        <>
          <div style={{ marginTop: "8px", fontWeight: 700, color: "#2b2b2b" }}>Default Meal Plan</div>
          <div style={{ color: "#6b6b6b" }}>{room.mealPlan}</div>
        </>
      )}
      <div style={{ marginTop: "8px", borderTop: "1px solid #dcdcdc", paddingTop: "8px" }}>
        {single != null && single !== rate && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span>1 Adult</span>
            <span style={{ fontWeight: 700, color: brandColor }}>
              {currency}
              {money(single)}
            </span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span>{maxAdults >= 2 ? "2 Adults" : "Per night"}</span>
          <span style={{ fontWeight: 700, color: "#2b2b2b" }}>
            {currency}
            {money(rate)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: "#2b2b2b" }}>{value}</span>
    </div>
  );
}

function OccupancyIcons({ count }: { count: number }) {
  const shown = Math.min(Math.max(count, 1), 4);
  return (
    <span style={{ display: "inline-flex", gap: "1px", color: "#bdbdbd" }} title={`Sleeps ${count}`}>
      {Array.from({ length: shown }).map((_, i) => (
        <svg key={i} width="11" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
        </svg>
      ))}
    </span>
  );
}

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "none",
        color: disabled ? "#d5d5d5" : "#4a4a4a",
        fontSize: "16px",
        fontWeight: 700,
        lineHeight: 1,
        padding: "4px 6px",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#2b2b2b",
        padding: "0 2px",
      }}
    >
      {children}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  padding: "6px 4px 10px",
  background: "#fff",
  borderBottom: "1px solid #ececec",
  fontSize: "11px",
  fontWeight: 600,
  verticalAlign: "bottom",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 6px",
  borderBottom: "1px solid #ececec",
  fontSize: "13px",
  verticalAlign: "middle",
};
