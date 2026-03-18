import { useState, useMemo } from "react";
import { format, addDays, eachDayOfInterval, isBefore, startOfDay } from "date-fns";

interface RoomAvailability {
  roomId: string;
  roomName: string;
  maxGuests?: number;
  beds?: number;
  /** rate per date key (yyyy-MM-dd) → number | null (null = sold out) */
  ratesByDate: Record<string, number | null>;
}

interface EmbedAvailabilityGridProps {
  rooms: RoomAvailability[];
  startDate: string; // yyyy-MM-dd
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
    <div style={{ overflowX: "auto", width: "100%" }}>
      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 0", fontSize: "12px" }}>
        <NavBtn label="‹‹ Week" onClick={() => setOffset(o => Math.max(o - 7, 0))} disabled={!canGoBack} brandColor={brandColor} fontColor={fontColor} />
        <NavBtn label="‹ Day" onClick={() => setOffset(o => Math.max(o - 1, 0))} disabled={!canGoBack} brandColor={brandColor} fontColor={fontColor} />
        <span style={{ padding: "0 8px", fontWeight: 600, fontSize: "13px", color: "#333" }}>
          {format(dates[0], "d MMM")} – {format(dates[dates.length - 1], "d MMM yyyy")}
        </span>
        <NavBtn label="Day ›" onClick={() => setOffset(o => o + 1)} brandColor={brandColor} fontColor={fontColor} />
        <NavBtn label="Week ››" onClick={() => setOffset(o => o + 7)} brandColor={brandColor} fontColor={fontColor} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, minWidth: "140px", textAlign: "left", background: brandColor, color: fontColor, borderRadius: "6px 0 0 0" }}>
              Room Type
            </th>
            {dates.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <th
                  key={d.toISOString()}
                  style={{
                    ...thStyle,
                    minWidth: "62px",
                    textAlign: "center",
                    background: isWeekend ? darken(brandColor, 0.15) : brandColor,
                    color: fontColor,
                    borderRadius: i === dates.length - 1 ? "0 6px 0 0" : undefined,
                  }}
                >
                  <div>{format(d, "EEE")}</div>
                  <div style={{ fontWeight: 700 }}>{format(d, "d")}</div>
                  <div style={{ fontSize: "10px", opacity: 0.8 }}>{format(d, "MMM")}</div>
                </th>
              );
            })}
            <th style={{ ...thStyle, width: "40px", background: brandColor, color: fontColor }} />
          </tr>
        </thead>
        <tbody>
          {rooms.length === 0 ? (
            <tr>
              <td colSpan={dates.length + 2} style={{ padding: "24px", textAlign: "center", color: "#999" }}>
                No rooms configured. Add rooms in your property setup.
              </td>
            </tr>
          ) : (
            rooms.map((room, ri) => (
              <tr key={room.roomId} style={{ background: ri % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ ...tdStyle, fontWeight: 600, color: "#333" }}>
                  <div>{room.roomName}</div>
                  {(room.maxGuests || room.beds) && (
                    <div style={{ fontSize: "10px", color: "#888", fontWeight: 400 }}>
                      {[room.maxGuests && `${room.maxGuests} pax`, room.beds && `${room.beds} bed${room.beds > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
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
                        background: isSold ? "#fee2e2" : undefined,
                        color: isSold ? "#dc2626" : hasRate ? "#222" : "#ccc",
                      }}
                      title={hasRate ? `${currency}${rate.toLocaleString()} per night` : isSold ? "Sold out" : "No rate"}
                    >
                      {isSold ? (
                        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>SOLD</span>
                      ) : hasRate ? (
                        <span>{rate.toLocaleString()}</span>
                      ) : (
                        "–"
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {onBook && (
                    <button
                      onClick={() => onBook(room.roomId, room.roomName)}
                      title={`Book ${room.roomName}`}
                      style={{
                        background: brandColor,
                        color: fontColor,
                        border: "none",
                        borderRadius: "4px",
                        padding: "4px 6px",
                        cursor: "pointer",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Small helpers ── */

function NavBtn({ label, onClick, disabled, brandColor, fontColor }: { label: string; onClick: () => void; disabled?: boolean; brandColor: string; fontColor: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#e5e5e5" : brandColor,
        color: disabled ? "#999" : fontColor,
        border: "none",
        borderRadius: "4px",
        padding: "4px 10px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
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
  padding: "6px 4px",
  borderBottom: "1px solid #e5e5e5",
  fontSize: "11px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #f0f0f0",
  fontSize: "12px",
};
