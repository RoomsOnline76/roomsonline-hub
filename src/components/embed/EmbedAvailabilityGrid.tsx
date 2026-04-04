import { useState, useMemo } from "react";
import { format, addDays, eachDayOfInterval, isBefore, startOfDay } from "date-fns";

interface RoomAvailability {
  roomId: string;
  roomName: string;
  maxGuests?: number;
  beds?: number;
  ratesByDate: Record<string, number | null>;
}

interface EmbedAvailabilityGridProps {
  rooms: RoomAvailability[];
  startDate: string;
  visibleDays?: number;
  brandColor: string;
  fontColor: string;
  currency?: string;
  onBook?: (roomId: string, roomName: string) => void;
}

export function EmbedAvailabilityGrid({
  rooms,
  startDate,
  visibleDays = 10,
  brandColor,
  fontColor,
  currency = "R",
  onBook,
}: EmbedAvailabilityGridProps) {
  const [offset, setOffset] = useState(0);
  const today = startOfDay(new Date());

  const dates = useMemo(() => {
    const base = addDays(new Date(startDate), offset);
    return eachDayOfInterval({ start: base, end: addDays(base, visibleDays - 1) });
  }, [startDate, offset, visibleDays]);

  const canGoBack = !isBefore(addDays(new Date(startDate), offset - 1), today);

  return (
    <div style={{ overflowX: "auto", width: "100%", padding: "4px 0" }}>
      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 16px", fontSize: "12px" }}>
        <NavBtn label="‹‹" onClick={() => setOffset(o => Math.max(o - 7, 0))} disabled={!canGoBack} brandColor={brandColor} fontColor={fontColor} />
        <NavBtn label="‹" onClick={() => setOffset(o => Math.max(o - 1, 0))} disabled={!canGoBack} brandColor={brandColor} fontColor={fontColor} />
        <span style={{ padding: "0 12px", fontWeight: 600, fontSize: "13px", color: "#333", letterSpacing: "-0.01em" }}>
          {format(dates[0], "d MMM")} – {format(dates[dates.length - 1], "d MMM yyyy")}
        </span>
        <NavBtn label="›" onClick={() => setOffset(o => o + 1)} brandColor={brandColor} fontColor={fontColor} />
        <NavBtn label="››" onClick={() => setOffset(o => o + 7)} brandColor={brandColor} fontColor={fontColor} />
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0", fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: "140px", textAlign: "left", background: brandColor, color: fontColor, borderRadius: "8px 0 0 8px" }}>
                Room Type
              </th>
              {dates.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <th
                    key={d.toISOString()}
                    style={{
                      ...thStyle,
                      minWidth: "58px",
                      textAlign: "center",
                      background: isWeekend ? darken(brandColor, 0.12) : brandColor,
                      color: fontColor,
                      borderRadius: i === dates.length - 1 && !onBook ? "0 8px 8px 0" : undefined,
                    }}
                  >
                    <div style={{ fontSize: "10px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>{format(d, "EEE")}</div>
                    <div style={{ fontWeight: 700, fontSize: "14px" }}>{format(d, "d")}</div>
                    <div style={{ fontSize: "9px", opacity: 0.6, textTransform: "uppercase" }}>{format(d, "MMM")}</div>
                  </th>
                );
              })}
              {onBook && (
                <th style={{ ...thStyle, width: "48px", background: brandColor, color: fontColor, borderRadius: "0 8px 8px 0" }} />
              )}
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
              rooms.map((room, ri) => (
                <tr key={room.roomId} style={{ background: ri % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#222" }}>
                    <div style={{ fontSize: "13px" }}>{room.roomName}</div>
                    {(room.maxGuests || room.beds) && (
                      <div style={{ fontSize: "10px", color: "#999", fontWeight: 400, marginTop: "1px" }}>
                        {[room.maxGuests && `${room.maxGuests} guests`, room.beds && `${room.beds} bed${room.beds > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  {dates.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const rate = room.ratesByDate[key];
                    const isSold = rate === null;
                    const hasRate = rate !== undefined && rate !== null;

                    return (
                      <td
                        key={key}
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 600,
                          background: isSold ? "#fef2f2" : undefined,
                          color: isSold ? "#ef4444" : hasRate ? "#222" : "#ccc",
                        }}
                        title={hasRate ? `${currency}${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per night` : isSold ? "Sold out" : "No rate"}
                      >
                        {isSold ? (
                          <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>SOLD</span>
                        ) : hasRate ? (
                          <span style={{ fontSize: "12px" }}>{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span style={{ fontSize: "11px" }}>–</span>
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
                          borderRadius: "6px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.02em",
                          transition: "opacity 0.15s",
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

/* ── Helpers ── */

function NavBtn({ label, onClick, disabled, brandColor, fontColor }: { label: string; onClick: () => void; disabled?: boolean; brandColor: string; fontColor: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#f0f0f0" : brandColor,
        color: disabled ? "#bbb" : fontColor,
        border: "none",
        borderRadius: "6px",
        padding: "5px 10px",
        fontSize: "13px",
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        minWidth: "32px",
      }}
    >
      {label}
    </button>
  );
}

function darken(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) * (1 - amount));
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

const thStyle: React.CSSProperties = {
  padding: "8px 4px",
  borderBottom: "none",
  fontSize: "11px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 6px",
  borderBottom: "1px solid #f0f0f0",
  fontSize: "12px",
};
